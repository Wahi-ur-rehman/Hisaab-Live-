"use strict";
// Shared by the agent and the Cloud Functions. THE TWO COPIES MUST BE IDENTICAL
// (firebase/functions/billcore.js and agent/billcore.js; a test checks this), because the
// agent and the server both compute the same bill hashes and day digests and compare them.
const crypto = require("crypto");

const TZ = "Asia/Karachi";
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const money = (n) => Math.round(Number(n) * 100) / 100;

function dayOf(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
function hourOf(ms) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(ms))) % 24;
}

// One bill in the standard shape, or null if it is unusable.
function normalizeBill(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id == null ? "" : raw.id).trim();
  const ts = Number(raw.ts);
  const total = Number(raw.total);
  if (!id || id.length > 64) return null;
  if (!Number.isFinite(ts) || ts < 946684800000 || ts > 4102444800000) return null; // year 2000..2100
  if (!Number.isFinite(total) || Math.abs(total) > 1e9) return null;
  const disc = Number(raw.discount);
  return {
    id, ts: Math.round(ts), total: money(total),
    status: raw.status === "void" ? "void" : "ok",
    cashier: String(raw.cashier == null ? "" : raw.cashier).trim().slice(0, 40),
    discount: Number.isFinite(disc) && disc > 0 && disc < 1e9 ? money(disc) : 0,
  };
}

// Some databases hold one row per bill line (or reuse a number for a return). Rows with the same
// id become one bill: totals add up, the earliest time wins, it is "void" only if every row is.
function collapse(bills) {
  const map = new Map();
  for (const b of bills) {
    const c = map.get(b.id);
    if (!c) { map.set(b.id, { ...b }); continue; }
    c.total = money(c.total + b.total);
    c.discount = money(c.discount + b.discount);
    c.ts = Math.min(c.ts, b.ts);
    if (b.status === "ok") c.status = "ok";
    if (!c.cashier) c.cashier = b.cashier;
  }
  return [...map.values()];
}

const billHash = (b) => sha(JSON.stringify([b.id, b.ts, b.total, b.status, b.cashier, b.discount])).slice(0, 32);

// Fingerprint of a whole day: any added, removed or changed bill changes it.
function dayDigest(bills) {
  const lines = bills.map((b) => b.id + ":" + billHash(b)).sort();
  return sha(lines.join("\n"));
}

// "INV-0042" -> { prefix: "INV-", n: 42 }; ids without a trailing number -> null.
function seqNumber(id) {
  const m = /^(.*?)(\d{1,12})$/.exec(String(id));
  return m ? { prefix: m[1], n: Number(m[2]) } : null;
}

module.exports = { TZ, dayOf, hourOf, normalizeBill, collapse, billHash, dayDigest, seqNumber, money };
