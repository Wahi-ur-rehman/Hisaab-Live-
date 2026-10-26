"use strict";
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const lib = require("./lib");
const core = require("./billcore");
const tamper = require("./tamper");

admin.initializeApp();
const db = admin.firestore();
const { HttpsError } = functions.https;
const FieldValue = admin.firestore.FieldValue;

// Owner-app and admin-panel callables can require a Firebase App Check token (only real copies of
// your own apps can call them). Off by default; turn on with ENFORCE_APPCHECK=true in .env after
// App Check is set up in both apps (see README). The agent functions never use it: a shop PC has
// no browser to attest from, so they rely on the license key instead.
const ENFORCE_APPCHECK = process.env.ENFORCE_APPCHECK === "true";
const web = functions.runWith({ enforceAppCheck: ENFORCE_APPCHECK });

const BAD_LOGIN = "Shop Code / Phone ya PIN galat hai";
const BAD_CODE = "Code galat hai ya expire ho chuka hai";
const MIN = 60000;
const DAY = 24 * 60 * MIN;
const tooMany = () => new HttpsError("resource-exhausted", "Bohat ghalat koshishen. 15 minute baad dobara try karen.");

function requireAdmin(context) {
  if (!context || !context.auth || context.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only");
  }
}

// Server-side secret mixed into every PIN hash. Lives in the Functions environment (.env), never in Firestore.
function pepper() {
  const p = process.env.PIN_PEPPER;
  if (!p || p.length < 16) throw new HttpsError("internal", "Server setup incomplete: PIN_PEPPER is missing");
  return p;
}
let dummyHash;
const getDummyHash = () => dummyHash || (dummyHash = lib.hashPin("000000", pepper()));

// ---------------------------------------------------------------------------
// Rate limiting. State lives in rate_limits/{key} = { n, start }. Every check-and-count
// happens inside one transaction, so a burst of parallel requests cannot all slip through
// before the counter moves (the old check-then-act login lockout could be beaten that way).
// ---------------------------------------------------------------------------
const rl = (key) => db.collection("rate_limits").doc(key);

async function consume(key, max, windowMs) {
  const ref = rl(key);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const r = lib.consumeWindow(s.exists ? s.data() : null, now, max, windowMs);
    if (r.allowed) tx.set(ref, r.state);
    return r.allowed;
  });
}

// Give back one use (a successful login should not count against the owner).
async function refund(key) {
  const ref = rl(key);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return;
    const d = s.data();
    if (d.n > 1) tx.set(ref, { n: d.n - 1, start: d.start });
    else tx.delete(ref);
  });
}

// Ends every signed-in session of a shop (new ID tokens can no longer be minted; an
// already-issued one still works for up to an hour).
async function revokeSessions(shopId) {
  try {
    await admin.auth().revokeRefreshTokens("shop_" + shopId);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e; // never signed in = nothing to revoke
  }
}

// ---------------------------------------------------------------------------
// Owner login: verifies the 6-digit PIN on the server, returns a Firebase Auth
// custom token carrying the shopId claim that firestore.rules checks.
// Limits (each is atomic, and each attempt is counted BEFORE the PIN is checked):
//   - 30 attempts / 15 min per IP across all shops (stops a script spraying many shops)
//   - 5 attempts / 15 min per shop per IP (a stranger can't lock the owner out from another network)
//   - 30 attempts / hour per shop in total (caps guessing spread over many IPs)
// ---------------------------------------------------------------------------
exports.shopLogin = web.https.onCall(async (data, context) => {
  const code = String((data && data.code) || "").trim();
  const pin = String((data && data.pin) || "");
  if (!code || !/^\d{6}$/.test(pin)) throw new HttpsError("invalid-argument", BAD_LOGIN);
  const ip = lib.ipKey(context && context.rawRequest);
  const pep = pepper();

  const ipKey = `login_ip_${ip}`;
  if (!(await consume(ipKey, 30, 15 * MIN))) throw tooMany();

  let snap = await db.collection("shops").where("shop_code_lc", "==", code.toLowerCase()).limit(1).get();
  if (snap.empty) {
    const phone = lib.digitsOnly(code);
    if (phone) snap = await db.collection("shops").where("owner_phone", "==", phone).limit(1).get();
  }
  if (snap.empty) {
    lib.verifyPin(pin, getDummyHash(), pep); // same work as a real shop, so timing doesn't reveal which codes exist
    throw new HttpsError("unauthenticated", BAD_LOGIN);
  }

  const shopId = snap.docs[0].id;
  const shopIpKey = `login_shop_${shopId}_${ip}`;
  const shopKey = `login_shop_${shopId}`;
  if (!(await consume(shopIpKey, 5, 15 * MIN))) throw tooMany();
  if (!(await consume(shopKey, 30, 60 * MIN))) throw tooMany();

  const priv = (await db.collection("shops_private").doc(shopId).get()).data() || {};
  if (!lib.verifyPin(pin, priv.pin_hash, pep)) throw new HttpsError("unauthenticated", BAD_LOGIN);

  await Promise.all([rl(shopIpKey).delete(), refund(shopKey), refund(ipKey)]);
  const token = await admin.auth().createCustomToken("shop_" + shopId, { shopId });
  return { token };
});

// ---------------------------------------------------------------------------
// Admin-only callables (require the `admin: true` custom claim, see scripts/setAdmin.js)
// ---------------------------------------------------------------------------
exports.createShop = web.https.onCall(async (data, context) => {
  requireAdmin(context);
  const code = String((data && data.code) || "").trim();
  const name = String((data && data.name) || "").trim();
  const phone = lib.digitsOnly(data && data.phone);
  const pin = String((data && data.pin) || "");
  const amount = Number(data && data.amount);
  const id = lib.slugId(code);

  if (!id) throw new HttpsError("invalid-argument", "Shop code 2-30 letters/numbers hona chahiye (e.g. G10)");
  if (!name) throw new HttpsError("invalid-argument", "Shop name zaroori hai");
  if (phone.length < 10) throw new HttpsError("invalid-argument", "Owner phone sahi likhen");
  if (!/^\d{6}$/.test(pin)) throw new HttpsError("invalid-argument", "PIN 6 digit hona chahiye");
  if (!Number.isFinite(amount) || amount < 0) throw new HttpsError("invalid-argument", "Amount sahi likhen");

  const dupPhone = await db.collection("shops").where("owner_phone", "==", phone).limit(1).get();
  if (!dupPhone.empty) throw new HttpsError("already-exists", "Yeh phone number kisi aur shop par pehle se hai");

  const start = lib.todayPK();
  const expiry = lib.addMonthAnchored(start, lib.parseYMD(start).d);

  const batch = db.batch();
  // batch.create() fails if the shop already exists, so two admins can't overwrite each other.
  batch.create(db.collection("shops").doc(id), {
    shop_name: name, shop_code: code, shop_code_lc: code.toLowerCase(), owner_phone: phone,
    amount, start_date: start, current_expiry: expiry, status: "active",
    live_banner: false, total_months_paid: 1, last_paid: start, license_active: false,
  });
  // No license yet: one is issued when the agent is activated with a setup code.
  batch.create(db.collection("shops_private").doc(id), { pin_hash: lib.hashPin(pin, pepper()), license_hash: null });
  try {
    await batch.commit();
  } catch (e) {
    if (e.code === 6) throw new HttpsError("already-exists", "Is code ki shop pehle se maujood hai");
    throw e;
  }
  return { shopId: id };
});

exports.markPaid = web.https.onCall(async (data, context) => {
  requireAdmin(context);
  const shopId = String((data && data.shopId) || "");
  if (!shopId) throw new HttpsError("invalid-argument", "shopId missing");
  const ref = db.collection("shops").doc(shopId);
  const today = lib.todayPK();
  const expiry = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError("not-found", "Shop nahi mili");
    const d = s.data();
    const next = lib.nextExpiryAfterPayment(d.start_date, d.current_expiry, today);
    tx.update(ref, {
      status: "active", current_expiry: next, live_banner: false,
      total_months_paid: (d.total_months_paid || 0) + 1, last_paid: today,
    });
    return next;
  });
  return { current_expiry: expiry };
});

// Changes the PIN, clears its lockout, and signs the shop out everywhere (a stolen phone
// or a leaked PIN must not stay logged in after a reset).
exports.resetPin = web.https.onCall(async (data, context) => {
  requireAdmin(context);
  const shopId = String((data && data.shopId) || "");
  const pin = String((data && data.pin) || "");
  if (!shopId) throw new HttpsError("invalid-argument", "shopId missing");
  if (!/^\d{6}$/.test(pin)) throw new HttpsError("invalid-argument", "PIN 6 digit hona chahiye");
  const ref = db.collection("shops_private").doc(shopId);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Shop nahi mili");
  await ref.update({ pin_hash: lib.hashPin(pin, pepper()) });
  await rl(`login_shop_${shopId}`).delete();
  await revokeSessions(shopId);
  return { ok: true };
});

// Kills a leaked license key at once. The agent stops being accepted until it is activated again
// with a new setup code (activation always issues a brand-new key).
exports.revokeLicense = web.https.onCall(async (data, context) => {
  requireAdmin(context);
  const shopId = String((data && data.shopId) || "");
  if (!shopId) throw new HttpsError("invalid-argument", "shopId missing");
  const priv = db.collection("shops_private").doc(shopId);
  if (!(await priv.get()).exists) throw new HttpsError("not-found", "Shop nahi mili");
  await priv.update({ license_hash: null });
  await db.collection("shops").doc(shopId).update({ license_active: false });
  return { ok: true };
});

// Completely delete a shop (Super Admin only)
exports.deleteShop = web.https.onCall(async (data, context) => {
  requireAdmin(context);
  const shopId = String((data && data.shopId) || "");
  if (!shopId) throw new HttpsError("invalid-argument", "shopId missing");
  await revokeSessions(shopId);
  const batch = db.batch();
  batch.delete(db.collection("shops").doc(shopId));
  batch.delete(db.collection("shops_private").doc(shopId));
  const codes = await db.collection("setup_codes").where("shopId", "==", shopId).get();
  codes.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return { ok: true };
});

// Owner: sign out every device (e.g. a lost phone).
exports.logoutEverywhere = web.https.onCall(async (data, context) => {
  await revokeSessions(ownerShopId(context));
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Agent (shop PC): authenticates with shopId + license key, no Firebase credentials
// on the shop's machine. The server stores only a hash of the license. The server picks
// the date, so a wrong PC clock can't write to the wrong day. The agent is never locked,
// even when the shop is expired.
// ---------------------------------------------------------------------------
// Checks shopId + license. Every agent call goes through this.
async function authAgent(data) {
  const shopId = String((data && data.shopId) || "");
  const license = String((data && data.license_key) || "");
  if (!shopId || !license) throw new HttpsError("unauthenticated", "Invalid license");
  const priv = (await db.collection("shops_private").doc(shopId).get()).data();
  if (!priv || !priv.license_hash || !lib.safeEqual(priv.license_hash, lib.hashLicense(license))) {
    throw new HttpsError("unauthenticated", "Invalid license");
  }
  return shopId;
}

// Push notification to every device of a shop; dead devices are removed.
async function sendPush(shopRef, tokens, body) {
  if (!Array.isArray(tokens) || !tokens.length) return;
  try {
    const res = await admin.messaging().sendEachForMulticast({ tokens, notification: { title: "HisaabLive", body } });
    const gone = tokens.filter((t, i) => {
      const code = res.responses[i].error && res.responses[i].error.code;
      return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
    });
    if (gone.length) await shopRef.update({ fcm_tokens: FieldValue.arrayRemove(...gone) });
  } catch (e) {
    functions.logger.warn("FCM send failed", shopRef.id, e.message);
  }
}

// Writes new alerts (skipping ones already recorded) and tells the owner's phone, at most once per 5 minutes.
async function raiseAlerts(shopId, day, alerts, extraNote) {
  if (!alerts.length) return 0;
  const shopRef = db.collection("shops").doc(shopId);
  const have = new Set();
  (await shopRef.collection("alerts").where("day", "==", day).get()).forEach((d) => have.add(d.id));
  const fresh = alerts.filter((a) => !have.has(a.id));
  for (let i = 0; i < fresh.length; i += 400) {
    const b = db.batch();
    for (const a of fresh.slice(i, i + 400)) {
      const { id, ...rest } = a;
      b.set(shopRef.collection("alerts").doc(id), { ...rest, seen: false, created_at: FieldValue.serverTimestamp(), note: extraNote || "" });
    }
    await b.commit();
  }
  const loud = fresh.filter((a) => a.severity === "high" || a.severity === "medium");
  if (loud.length) {
    const s = (await shopRef.get()).data() || {};
    if (!s.last_alert_push || Date.now() - s.last_alert_push > 5 * MIN) {
      const amt = loud.reduce((t, a) => t + (a.amount || 0), 0);
      const body = `Warning: ${loud.length} suspicious change(s) in your POS${amt ? " (Rs " + Math.round(amt).toLocaleString("en-US") + ")" : ""}. Open HisaabLive.`;
      await shopRef.update({ last_alert_push: Date.now() });
      await sendPush(shopRef, s.fcm_tokens, body);
    }
  }
  return fresh.length;
}

// Total-only agent (it could read only the day's total): history of the total, alert if it ever drops.
exports.agentPush = functions.https.onCall(async (data) => {
  const total = Number(data && data.total);
  const count = data && data.count === undefined ? undefined : Number(data.count);
  const shopId = await authAgent(data);
  if (!Number.isFinite(total) || total < 0 || total > 1e10) throw new HttpsError("invalid-argument", "Invalid total");
  if (count !== undefined && (!Number.isFinite(count) || count < 0 || count > 1e7)) throw new HttpsError("invalid-argument", "Invalid count");
  // Even a valid license can't be used to hammer the database (a real agent sends far fewer).
  if (!(await consume(`push_${shopId}`, 150, 10 * MIN))) throw new HttpsError("resource-exhausted", "Too many updates");

  const today = lib.todayPK();
  const shopRef = db.collection("shops").doc(shopId);
  const dayRef = shopRef.collection("daily_sales").doc(today);
  const prev = (await dayRef.get()).data();
  const alerts = tamper.checkTotalOnly(prev, total, count, today);
  const peak = Math.max(total, (prev && prev.peak_total) || 0);
  const peakCount = count === undefined ? (prev && prev.peak_count) : Math.max(count, (prev && prev.peak_count) || 0);
  const batch = db.batch();
  const dayDoc = { total, date: today, peak_total: peak, missing: core.money(peak - total), updated_at: FieldValue.serverTimestamp() };
  if (peakCount !== undefined) dayDoc.peak_count = peakCount;
  batch.set(dayRef, dayDoc, { merge: true });
  batch.update(shopRef, { today_sale: total, today_sale_date: today, today_missing: dayDoc.missing, agent_last_seen: FieldValue.serverTimestamp() });
  await batch.commit();
  await raiseAlerts(shopId, today, alerts);
  try {
    await recomputeMonthSale(shopId, lib.monthOf(today)); // monthly sum updates automatically
  } catch (e) {
    functions.logger.error("Month sale recompute failed", shopId, e);
  }
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Bill-by-bill sync (tamper protection). The agent sends a fingerprint (digest) per day. Only for
// days whose fingerprint differs from the server's record does it send the bills; the server
// compares them with its permanent ledger of every bill (shops/{id}/bills) and raises alerts for
// anything deleted, lowered, cancelled, edited, back-dated, odd-hour or missing from the numbering.
// The ledger is append-only for clients (rules: no writes) and keeps each bill's first version.
// ---------------------------------------------------------------------------
const MAX_DAYS = 40, MAX_BILLS = 3000;

async function ingestDay(shopId, day, rawBills) {
  const shopRef = db.collection("shops").doc(shopId);
  const dayRef = shopRef.collection("bill_days").doc(day);
  const [daySnap, ledgerSnap] = await Promise.all([dayRef.get(), shopRef.collection("bills").where("day", "==", day).get()]);
  const ledger = new Map();
  ledgerSnap.forEach((d) => ledger.set(d.id, d.data()));
  const incoming = rawBills.map(core.normalizeBill).filter(Boolean).filter((b) => core.dayOf(b.ts) === day);
  const r = tamper.diffDay(ledger, incoming, { day, today: lib.todayPK(), now: Date.now(), dayKnown: daySnap.exists });

  const ops = [];
  for (const c of r.creates) ops.push((b) => b.set(shopRef.collection("bills").doc(c.key), c.doc));
  for (const u of r.updates) ops.push((b) => b.update(shopRef.collection("bills").doc(u.key), u.patch));
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach((f) => f(b));
    await b.commit();
  }
  const digest = core.dayDigest(core.collapse(incoming));
  const missing = core.money(r.totals.recorded - r.totals.live);
  await dayRef.set({ day, digest, count: r.totals.count, live_total: r.totals.live, recorded_total: r.totals.recorded, missing, updated_at: FieldValue.serverTimestamp() });
  await shopRef.collection("daily_sales").doc(day).set({ total: r.totals.live, date: day, recorded_total: r.totals.recorded, missing, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  await raiseAlerts(shopId, day, r.alerts, r.alertsDropped ? `${r.alertsDropped} more alerts not shown` : "");
  return { day, live: r.totals.live, missing, alerts: r.alerts.length };
}

exports.agentSync = functions.https.onCall(async (data) => {
  const shopId = await authAgent(data);
  if (!(await consume(`sync_${shopId}`, 300, 10 * MIN))) throw new HttpsError("resource-exhausted", "Too many updates");
  const days = Array.isArray(data.days) ? data.days : [];
  const billsByDay = data.bills && typeof data.bills === "object" ? data.bills : {};
  if (days.length > MAX_DAYS) throw new HttpsError("invalid-argument", "Too many days");
  const today = lib.todayPK();
  const shopRef = db.collection("shops").doc(shopId);

  // Rows the agent could not read (a bad date or amount can be used to hide a bill).
  const unreadable = Math.min(Math.max(Math.floor(Number(data.unreadable) || 0), 0), 1e6);
  if (unreadable > 0) {
    await raiseAlerts(shopId, today, [{
      id: `unreadable_${today}_${unreadable}`, type: "unreadable", severity: "medium", day: today, bill_id: "", amount: 0, from: null, to: unreadable,
      message_en: `${unreadable} row(s) in your POS data could not be read (unusual date or amount). A bill could be hidden this way.`,
      message_roman: `POS ke ${unreadable} row padhe nahi ja sakay (ajeeb date ya amount). Is tarah bill chhupaya ja sakta hai.`,
    }]);
  }

  let sentBills = 0;
  const need = [];
  const done = [];
  for (const d of days) {
    const day = String((d && d.date) || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) continue; // never accept a future day
    const rows = billsByDay[day];
    if (Array.isArray(rows)) {
      sentBills += rows.length;
      if (sentBills > MAX_BILLS) throw new HttpsError("invalid-argument", "Too many bills in one call");
      done.push(await ingestDay(shopId, day, rows));
      continue;
    }
    const known = (await shopRef.collection("bill_days").doc(day).get()).data();
    if (!known || known.digest !== String(d.digest || "")) need.push(day);
  }

  // Month total and the "today" figures shown on the owner's home screen.
  const upd = { agent_last_seen: FieldValue.serverTimestamp(), agent_mode: "bills" };
  const todaySnap = (await shopRef.collection("daily_sales").doc(today).get()).data();
  if (todaySnap) Object.assign(upd, { today_sale: todaySnap.total || 0, today_sale_date: today, today_missing: todaySnap.missing || 0 });
  await shopRef.update(upd);
  for (const day of new Set(done.map((x) => x.day))) {
    try { await recomputeMonthSale(shopId, lib.monthOf(day)); } catch (e) { functions.logger.error("Month sale recompute failed", shopId, e); }
  }
  return { ok: true, need };
});

// Owner marks alerts as seen (the only thing an owner can change; alerts can never be deleted).
exports.ackAlerts = web.https.onCall(async (data, context) => {
  const shopId = ownerShopId(context);
  await assertActive(shopId);
  const ids = Array.isArray(data && data.ids) ? data.ids.map(String).slice(0, 100) : [];
  const col = db.collection("shops").doc(shopId).collection("alerts");
  const b = db.batch();
  let n = 0;
  for (const id of ids) {
    if (!id || id.includes("/")) continue;
    b.update(col.doc(id), { seen: true, seen_at: FieldValue.serverTimestamp() }); n++;
  }
  if (n) { try { await b.commit(); } catch (e) { throw new HttpsError("not-found", "Alert nahi mila"); } }
  return { ok: true, n };
});

// Every 30 minutes: an agent that goes silent during shop hours (10:00-20:00 Pakistan time) is itself
// a warning sign (someone may have stopped it), so the owner is told once a day.
exports.agentOfflineCheck = functions.pubsub.schedule("every 30 minutes").timeZone("Asia/Karachi").onRun(async () => {
  const hour = core.hourOf(Date.now());
  if (hour < 10 || hour >= 20) return null;
  const snap = await db.collection("shops").where("license_active", "==", true).get();
  for (const d of snap.docs) {
    try {
      const s = d.data();
      if (s.status !== "active") continue;
      const seen = s.agent_last_seen && (s.agent_last_seen.toMillis ? s.agent_last_seen.toMillis() : Date.parse(s.agent_last_seen));
      if (!seen || Date.now() - seen < 2 * 3600000) continue;
      const day = lib.todayPK();
      await raiseAlerts(d.id, day, [{
        id: "offline_" + day, type: "agent_offline", severity: "medium", day, bill_id: "", amount: 0, from: null, to: null,
        message_en: "The HisaabLive program on your shop PC has not reported for over 2 hours. Check that the PC is on.",
        message_roman: "Dukan ke PC par HisaabLive program 2 ghante se zyada se report nahi kar raha. PC on hai ya nahi check karen.",
      }]);
    } catch (e) { functions.logger.error("Offline check failed for", d.id, e); }
  }
  return null;
});

// ---------------------------------------------------------------------------
// Agent setup code: the admin generates a one-time code (valid 48 hours); the EXE on the
// shop PC exchanges it once for shopId + a NEW license key. Only hashes are stored: of the
// code, and of the license. Each caller IP gets 20 tries per 10 minutes (one person's wrong
// guesses can no longer block everyone else's installs).
// ---------------------------------------------------------------------------
const CODE_TTL_MS = 48 * 3600 * 1000;

exports.createSetupCode = web.https.onCall(async (data, context) => {
  requireAdmin(context);
  const shopId = String((data && data.shopId) || "");
  if (!shopId || !(await db.collection("shops").doc(shopId).get()).exists) {
    throw new HttpsError("not-found", "Shop nahi mili");
  }
  const code = lib.genSetupCode();
  const batch = db.batch();
  // A new code replaces this shop's older unused ones.
  const old = await db.collection("setup_codes").where("shopId", "==", shopId).where("used", "==", false).get();
  old.forEach((d) => batch.delete(d.ref));
  batch.create(db.collection("setup_codes").doc(lib.hashSetupCode(lib.normalizeSetupCode(code))), {
    shopId, used: false, created_at: FieldValue.serverTimestamp(), expires_at: Date.now() + CODE_TTL_MS,
  });
  await batch.commit();
  return { code, expires_hours: CODE_TTL_MS / 3600000 };
});

exports.agentActivate = functions.https.onCall(async (data, context) => {
  const now = Date.now();
  if (!(await consume(`activate_${lib.ipKey(context && context.rawRequest)}`, 20, 10 * MIN))) {
    throw new HttpsError("resource-exhausted", "Bohat koshishen. Thori der baad dobara try karen.");
  }
  const code = lib.normalizeSetupCode(data && data.code);
  if (!code) throw new HttpsError("not-found", BAD_CODE);

  const ref = db.collection("setup_codes").doc(lib.hashSetupCode(code));
  const shopId = await db.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (!d.exists) return null;
    const v = d.data();
    if (v.used || v.expires_at < now) return null;
    tx.update(ref, { used: true, used_at: FieldValue.serverTimestamp() });
    return v.shopId;
  });
  if (!shopId) throw new HttpsError("not-found", BAD_CODE);

  const shopRef = db.collection("shops").doc(shopId);
  const privRef = db.collection("shops_private").doc(shopId);
  const [shop, priv] = await Promise.all([shopRef.get(), privRef.get()]);
  if (!shop.exists || !priv.exists) throw new HttpsError("not-found", "Shop nahi mili");

  // A fresh key every time: activating again replaces (and so revokes) any earlier one.
  const license = lib.genLicense(shopId);
  const batch = db.batch();
  batch.update(privRef, { license_hash: lib.hashLicense(license), license_set_at: FieldValue.serverTimestamp() });
  batch.update(shopRef, { license_active: true });
  await batch.commit();
  return { shopId, license_key: license, shopName: shop.data().shop_name };
});

// ---------------------------------------------------------------------------
// Monthly summary: shops/{id}/monthly_summary/{YYYY-MM} = { sale, expense, expense_by_cat }
//  - sale: recomputed from the daily_sales documents inside a transaction (so two agent
//    pushes at once can't leave a stale total)
//  - expense: added up as each expense is saved by addExpense (one atomic write, no re-reading)
// ---------------------------------------------------------------------------
async function recomputeMonthSale(shopId, ym) {
  const { start, end } = lib.monthBounds(ym);
  const shopRef = db.collection("shops").doc(shopId);
  const salesQuery = shopRef.collection("daily_sales").where("date", ">=", start).where("date", "<=", end);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(salesQuery);
    let sale = 0;
    snap.forEach((d) => { sale += Number(d.data().total) || 0; });
    tx.set(shopRef.collection("monthly_summary").doc(ym),
      { sale: lib.roundMoney(sale), updated_at: FieldValue.serverTimestamp() }, { merge: true });
  });
}

// ---------------------------------------------------------------------------
// Owner callables below need a signed-in shop (the shopId claim set by shopLogin).
// ---------------------------------------------------------------------------
function ownerShopId(context) {
  const id = context && context.auth && context.auth.token && context.auth.token.shopId;
  if (!id) throw new HttpsError("unauthenticated", "Pehle login karen");
  return id;
}

async function assertActive(shopId) {
  const s = await db.collection("shops").doc(shopId).get();
  if (!s.exists || s.data().status !== "active") {
    throw new HttpsError("failed-precondition", "Subscription khatam hai");
  }
}

const dailyCap = async (what, shopId, max) => {
  if (!(await consume(`${what}_${shopId}`, max, DAY))) throw new HttpsError("resource-exhausted", "Aaj ki hadd poori ho gayi");
};

// Expenses are written by the server only (clients can't create them directly), so the date
// can't be forged, totals stay in step, and a runaway client can't run up the database bill.
exports.addExpense = web.https.onCall(async (data, context) => {
  const shopId = ownerShopId(context);
  await assertActive(shopId);
  const v = lib.validateExpense(data);
  if (v.error) throw new HttpsError("invalid-argument", v.error);
  await dailyCap("expense", shopId, 300);

  const today = lib.todayPK();
  const shopRef = db.collection("shops").doc(shopId);
  const batch = db.batch();
  batch.create(shopRef.collection("expenses").doc(), {
    ...v.value, date: today, source: "app", created_at: new Date().toISOString(),
  });
  batch.set(shopRef.collection("monthly_summary").doc(lib.monthOf(today)), {
    expense: FieldValue.increment(v.value.amount),
    expense_by_cat: { [lib.catKey(v.value.category)]: FieldValue.increment(v.value.amount) },
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return { ok: true };
});

// Delete an expense and deduct from monthly summaries
exports.deleteExpense = web.https.onCall(async (data, context) => {
  const shopId = ownerShopId(context);
  await assertActive(shopId);
  const expenseId = String((data && data.expenseId) || "");
  if (!expenseId) throw new HttpsError("invalid-argument", "expenseId missing");

  const expRef = db.collection("shops").doc(shopId).collection("expenses").doc(expenseId);
  const expSnap = await expRef.get();
  if (!expSnap.exists) throw new HttpsError("not-found", "Expense not found");

  const exp = expSnap.data();
  const ym = lib.monthOf(exp.date || lib.todayPK());
  const amount = Number(exp.amount) || 0;
  const cat = exp.category || "Other";

  const batch = db.batch();
  batch.delete(expRef);
  batch.set(db.collection("shops").doc(shopId).collection("monthly_summary").doc(ym), {
    expense: FieldValue.increment(-amount),
    expense_by_cat: { [lib.catKey(cat)]: FieldValue.increment(-amount) },
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Khata (customer credit ledger). Owners call these; the server keeps balances
// correct inside a transaction, so a balance can never be edited from the browser.
// shops/{id}/khata_customers/{cid} = { name, phone, balance, created_at, last_txn_at }
//   .../entries/{eid}              = { type: udhaar | payment, amount, note, date, created_at }
// balance > 0 = customer owes the shop.
// ---------------------------------------------------------------------------
exports.khataAddCustomer = web.https.onCall(async (data, context) => {
  const shopId = ownerShopId(context);
  await assertActive(shopId);
  const v = lib.validateCustomer(data);
  if (v.error) throw new HttpsError("invalid-argument", v.error);
  await dailyCap("khata_customer", shopId, 100);
  const ref = db.collection("shops").doc(shopId).collection("khata_customers").doc();
  await ref.set({ ...v.value, balance: 0, created_at: new Date().toISOString(), last_txn_at: null });
  return { id: ref.id };
});

exports.khataAddEntry = web.https.onCall(async (data, context) => {
  const shopId = ownerShopId(context);
  await assertActive(shopId);
  const customerId = String((data && data.customerId) || "");
  if (!/^[A-Za-z0-9]{10,40}$/.test(customerId)) throw new HttpsError("invalid-argument", "Customer sahi nahi");
  const v = lib.validateEntry(data);
  if (v.error) throw new HttpsError("invalid-argument", v.error);
  await dailyCap("khata_entry", shopId, 1000);

  const custRef = db.collection("shops").doc(shopId).collection("khata_customers").doc(customerId);
  const today = lib.todayPK();
  const balance = await db.runTransaction(async (tx) => {
    const c = await tx.get(custRef);
    if (!c.exists) throw new HttpsError("not-found", "Customer nahi mila");
    const now = new Date().toISOString();
    const next = lib.applyEntry(c.data().balance, v.value.type, v.value.amount);
    tx.set(custRef.collection("entries").doc(), { ...v.value, date: today, created_at: now });
    tx.update(custRef, { balance: next, last_txn_at: now });
    return next;
  });
  return { balance };
});

// Delete a Khata customer
exports.khataDeleteCustomer = web.https.onCall(async (data, context) => {
  const shopId = ownerShopId(context);
  await assertActive(shopId);
  const customerId = String((data && data.customerId) || "");
  if (!customerId) throw new HttpsError("invalid-argument", "customerId missing");

  const custRef = db.collection("shops").doc(shopId).collection("khata_customers").doc(customerId);
  const snap = await custRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Customer not found");

  await custRef.delete();
  return { ok: true };
});

// Delete an individual Khata entry and adjust balance
exports.khataDeleteEntry = web.https.onCall(async (data, context) => {
  const shopId = ownerShopId(context);
  await assertActive(shopId);
  const customerId = String((data && data.customerId) || "");
  const entryId = String((data && data.entryId) || "");
  if (!customerId || !entryId) throw new HttpsError("invalid-argument", "Missing customerId or entryId");

  const custRef = db.collection("shops").doc(shopId).collection("khata_customers").doc(customerId);
  const entryRef = custRef.collection("entries").doc(entryId);

  const balance = await db.runTransaction(async (tx) => {
    const [c, e] = await Promise.all([tx.get(custRef), tx.get(entryRef)]);
    if (!c.exists) throw new HttpsError("not-found", "Customer not found");
    if (!e.exists) throw new HttpsError("not-found", "Entry not found");

    const entryData = e.data();
    const curBal = Number(c.data().balance) || 0;
    const revType = entryData.type === "udhaar" ? "payment" : "udhaar";
    const next = lib.applyEntry(curBal, revType, entryData.amount);

    tx.delete(entryRef);
    tx.update(custRef, { balance: next, last_txn_at: new Date().toISOString() });
    return next;
  });
  return { balance };
});

// ---------------------------------------------------------------------------
// Push notifications: the owner app registers a device token here (clients can't
// write shop documents). Up to 5 devices per shop, newest kept.
// ---------------------------------------------------------------------------
exports.saveFcmToken = web.https.onCall(async (data, context) => {
  const shopId = ownerShopId(context);
  const token = String((data && data.token) || "");
  if (token.length < 50 || token.length > 4096) throw new HttpsError("invalid-argument", "Invalid token");
  await dailyCap("fcm", shopId, 20);
  const ref = db.collection("shops").doc(shopId);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError("not-found", "Shop nahi mili");
    const cur = Array.isArray(s.data().fcm_tokens) ? s.data().fcm_tokens : [];
    tx.update(ref, { fcm_tokens: cur.filter((t) => t !== token).concat(token).slice(-5) });
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Nightly subscription check (21:00 Pakistan time)
// ---------------------------------------------------------------------------
exports.dailySubscriptionCheck = functions.pubsub.schedule("0 21 * * *").timeZone("Asia/Karachi").onRun(async () => {
  const today = lib.todayPK();
  const snap = await db.collection("shops").get();

  for (const docSnap of snap.docs) {
    try {
      const s = docSnap.data();
      if (!s.current_expiry) continue;
      const diff = lib.daysBetween(today, s.current_expiry);
      let type = "", en = "", ro = "";
      const update = {};

      if (diff <= 0) {
        if (s.status === "expired") continue;
        type = "expired";
        en = "Your subscription has ended.";
        ro = "Aapki subscription khatam ho gayi hai.";
        update.status = "expired";
      } else if (diff === 1) {
        type = "warning_1day";
        en = "Final reminder: Your subscription will be locked tomorrow.";
        ro = "Akhri reminder: Kal app band ho jayega, renew karen.";
      } else if (diff === 3) {
        type = "warning_3day";
        en = "Your subscription is about to expire. Please renew.";
        ro = "Aapki subscription khatam hone wali hai. Renew karen.";
      }
      if (!type) continue;

      await docSnap.ref.update({
        ...update, live_banner: true, live_banner_type: type,
        live_banner_msg_en: en, live_banner_msg_roman: ro,
      });
      await sendPush(docSnap.ref, s.fcm_tokens, ro);
    } catch (e) {
      functions.logger.error("Subscription check failed for", docSnap.id, e);
    }
  }

  // Housekeeping: rate-limit counters older than a day are no longer needed.
  try {
    const stale = await db.collection("rate_limits").where("start", "<=", Date.now() - DAY).limit(400).get();
    if (!stale.empty) {
      const b = db.batch();
      stale.forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  } catch (e) {
    functions.logger.warn("rate_limits cleanup failed", e.message);
  }
  return null;
});
