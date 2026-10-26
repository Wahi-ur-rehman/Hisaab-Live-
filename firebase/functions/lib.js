"use strict";
// Pure helpers (no Firebase imports) so they can be unit tested.
const crypto = require("crypto");

const TZ = "Asia/Karachi";

// Today's date (YYYY-MM-DD) in Pakistan time, regardless of the server's timezone.
function todayPK(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) throw new Error("Bad date: " + s);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

const pad = (n) => String(n).padStart(2, "0");
const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12

// Same anchor day next month, clamped to the month length (31st -> 28/29/30).
// Pure string math: no local-timezone or month-overflow surprises.
function addMonthAnchored(dateStr, anchorDay) {
  const { y, m } = parseYMD(dateStr);
  let ny = y, nm = m + 1;
  if (nm > 12) { nm = 1; ny += 1; }
  return fmt(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
}

function daysBetween(fromStr, toStr) {
  const a = parseYMD(fromStr), b = parseYMD(toStr);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

// New expiry after a payment. Keeps the anchor day of start_date. If the shop had
// lapsed, steps forward to the first anchor date after today (so a late payment
// can never leave the shop "active" with an expiry in the past).
function nextExpiryAfterPayment(startDate, currentExpiry, today) {
  const anchor = parseYMD(startDate).d;
  let next = addMonthAnchored(currentExpiry, anchor);
  while (next <= today) next = addMonthAnchored(next, anchor); // YYYY-MM-DD sorts as text
  return next;
}

// A 6-digit PIN has only 1,000,000 possibilities, so a leaked database alone would let someone
// crack every hash in seconds. The PIN is first mixed with a server-side secret (the "pepper",
// kept in the Functions environment, never in Firestore), so a database leak is not enough.
const pinMaterial = (pin, pepper) => crypto.createHmac("sha256", String(pepper)).update(String(pin)).digest();

function hashPin(pin, pepper = "") {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pinMaterial(pin, pepper), salt, 32);
  return salt.toString("hex") + ":" + hash.toString("hex");
}

function verifyPin(pin, stored, pepper = "") {
  const [saltHex, hashHex] = String(stored || "").split(":");
  if (!saltHex || !hashHex) return false;
  const calc = crypto.scryptSync(pinMaterial(pin, pepper), Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === calc.length && crypto.timingSafeEqual(calc, expected);
}

function genLicense(code) {
  const tag = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `HL-${tag}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

// The server stores only this hash of a license key. The key itself exists on the shop PC only.
const hashLicense = (license) => crypto.createHash("sha256").update(String(license)).digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const digitsOnly = (v) => String(v || "").replace(/\D/g, "");

// Firestore-safe shop id from the shop code, or null if invalid.
function slugId(code) {
  const id = String(code || "").trim().toLowerCase().replace(/\s+/g, "_");
  return /^[a-z0-9_-]{2,30}$/.test(id) ? id : null;
}

// ---- Monthly summary ------------------------------------------------------
const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

// "2026-10-22" -> "2026-10" (throws on a malformed date)
function monthOf(dateStr) {
  const { y, m } = parseYMD(dateStr);
  return `${y}-${pad(m)}`;
}

// Text bounds for "all days in this month" (YYYY-MM-DD strings sort as text).
const monthBounds = (ym) => ({ start: ym + "-01", end: ym + "-31" });

// Firestore-safe map key for an expense category ("Bijli / Bills" -> "Bijli_Bills").
const catKey = (c) => String(c).replace(/[^A-Za-z0-9]+/g, "_");

const EXPENSE_CATEGORIES = ["Bijli / Bills", "Staff / Tankhwa", "Dukaan Kiraya", "Transport / Rickshaw", "Maintenance", "Other"];

// Expenses are created only by the server (addExpense), which picks the date itself.
function validateExpense(d) {
  const title = String((d && d.title) || "").trim().slice(0, 100);
  const amount = roundMoney(d && d.amount);
  if (!title) return { error: "Title likhen" };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e8) return { error: "Amount sahi likhen" };
  if (!EXPENSE_CATEGORIES.includes(d.category)) return { error: "Category sahi nahi" };
  return { value: { title, amount, category: d.category } };
}

// ---- Rate limiting (pure part; index.js stores the state in Firestore) -----
// At most `max` uses per window. The window starts at the first use. A refused use is not counted.
function consumeWindow(state, now, max, windowMs) {
  if (!state || typeof state.start !== "number" || now - state.start >= windowMs) {
    return { allowed: max >= 1, state: { n: 1, start: now } };
  }
  if (state.n >= max) return { allowed: false, state };
  return { allowed: true, state: { n: state.n + 1, start: state.start } };
}

// Short stable key for a caller's IP (hashed so raw IPs aren't stored); "unknown" when unavailable.
function ipKey(rawRequest) {
  const ip = rawRequest && rawRequest.ip;
  return ip ? crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 16) : "unknown";
}

// ---- Khata (customer credit ledger) ---------------------------------------
// balance > 0 means the customer owes the shop; < 0 means they paid in advance.
function applyEntry(balance, type, amount) {
  return roundMoney((Number(balance) || 0) + (type === "udhaar" ? amount : -amount));
}

function validateEntry(d) {
  const type = d && d.type;
  const amount = roundMoney(d && d.amount);
  if (type !== "udhaar" && type !== "payment") return { error: "Type udhaar ya payment hona chahiye" };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return { error: "Amount sahi likhen" };
  return { value: { type, amount, note: String((d && d.note) || "").trim().slice(0, 200) } };
}

function validateCustomer(d) {
  const name = String((d && d.name) || "").trim().slice(0, 60);
  const phone = digitsOnly(d && d.phone);
  if (!name) return { error: "Customer ka naam likhen" };
  if (phone && (phone.length < 10 || phone.length > 15)) return { error: "Phone number sahi likhen" };
  return { value: { name, phone } };
}

// ---- Agent setup code -----------------------------------------------------
// 8 characters shown as XXXX-XXXX. No 0/O/1/I/L so it can't be misread or mistyped.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genSetupCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s.slice(0, 4) + "-" + s.slice(4);
}

// Accepts any case / spacing / dash; returns the 8 plain characters or null.
function normalizeSetupCode(input) {
  const s = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 && [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : null;
}

// Only this hash is stored on the server, never the code itself.
const hashSetupCode = (normalized) => crypto.createHash("sha256").update(normalized).digest("hex");

module.exports = {
  todayPK, parseYMD, addMonthAnchored, daysBetween, nextExpiryAfterPayment,
  hashPin, verifyPin, genLicense, safeEqual, digitsOnly, slugId,
  hashLicense,
  roundMoney, monthOf, monthBounds, catKey, EXPENSE_CATEGORIES, validateExpense,
  consumeWindow, ipKey,
  applyEntry, validateEntry, validateCustomer,
  genSetupCode, normalizeSetupCode, hashSetupCode,
};
