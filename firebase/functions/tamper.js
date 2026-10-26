"use strict";
// Tamper detection: compares what the POS shows now with the server's permanent record of each
// bill ("ledger"). Pure functions, no Firebase, so every rule is unit-tested.
const core = require("./billcore");

const rs = (n) => "Rs " + Math.round(n).toLocaleString("en-US");
const hh = (ms) => String(core.hourOf(ms)).padStart(2, "0") + ":00";
const MAX_ALERTS = 30;

const keyOf = (day, id) => day + "_" + id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40) + "_" + core.billHash({ id, ts: 0, total: 0, status: "ok", cashier: "", discount: 0 }).slice(0, 8);

function mk(type, severity, day, bill, o) {
  const ref = bill ? bill.id : "";
  return {
    type, severity, day, bill_id: ref, amount: o.amount || 0,
    from: o.from === undefined ? null : o.from, to: o.to === undefined ? null : o.to,
    message_en: o.en, message_roman: o.ro,
    // same event never raises the same alert twice
    id: type + "_" + day + "_" + (bill ? keyOf(day, bill.id).slice(11) : "day") + "_" + (o.tag || ""),
  };
}

// ledger: Map key -> stored bill ({day,id,ts,total,status,cashier,discount,hash,peak_total,missing,first_total,...})
// incoming: normalized bills the agent sent for this day (complete list for the day)
// ctx: { day, today (YYYY-MM-DD), now (ms), dayKnown (we have seen this day before), oddFrom, oddTo, discountPct }
function diffDay(ledger, incomingRaw, ctx) {
  const o = Object.assign({ oddFrom: 0, oddTo: 5, discountPct: 30 }, ctx);
  const incoming = core.collapse(incomingRaw);
  const creates = [], updates = [], alerts = [];
  const seen = new Set();

  for (const b of incoming) {
    const key = keyOf(o.day, b.id);
    seen.add(key);
    const hash = core.billHash(b);
    const old = ledger.get(key);
    if (!old) {
      creates.push({ key, doc: {
        day: o.day, id: b.id, ts: b.ts, total: b.total, status: b.status, cashier: b.cashier, discount: b.discount, hash,
        first_total: b.total, first_status: b.status, first_hash: hash, first_seen: o.now,
        peak_total: b.status === "ok" ? b.total : 0, missing: false, versions: 1,
      } });
      if (b.status === "void") alerts.push(mk("void_new", "medium", o.day, b, { amount: b.total, en: `A cancelled bill ${b.id} (${rs(b.total)}) was recorded`, ro: `Cancel kiya hua bill ${b.id} (${rs(b.total)}) mila` }));
      if (o.dayKnown && o.day < o.today && o.now - b.ts > 30 * 60000) {
        alerts.push(mk("late_add", "medium", o.day, b, { amount: b.total, en: `Bill ${b.id} (${rs(b.total)}) was added to ${o.day} after that day was already recorded`, ro: `Bill ${b.id} (${rs(b.total)}) ${o.day} mein baad mein add hua, jab din record ho chuka tha` }));
      }
      const hr = core.hourOf(b.ts);
      if (hr >= o.oddFrom && hr < o.oddTo) {
        alerts.push(mk("odd_hour", "low", o.day, b, { amount: b.total, en: `Bill ${b.id} (${rs(b.total)}) was made at ${hh(b.ts)}, outside normal hours`, ro: `Bill ${b.id} (${rs(b.total)}) ${hh(b.ts)} par bana, aam waqt se bahar` }));
      }
      const gross = b.total + b.discount;
      if (b.discount > 0 && gross > 0 && b.discount / gross * 100 >= o.discountPct && b.discount >= 200) {
        alerts.push(mk("big_discount", "medium", o.day, b, { amount: b.discount, en: `Bill ${b.id}: discount ${rs(b.discount)} on ${rs(gross)}`, ro: `Bill ${b.id}: ${rs(gross)} par ${rs(b.discount)} discount` }));
      }
      continue;
    }
    if (old.hash === hash) {
      if (old.missing) updates.push({ key, patch: { missing: false } }); // came back (e.g. restored); the earlier alert stays
      continue;
    }
    // The bill changed after it was first recorded.
    const patch = { total: b.total, status: b.status, cashier: b.cashier, discount: b.discount, ts: b.ts, hash, missing: false, versions: (old.versions || 1) + 1 };
    if (b.status === "ok" && b.total > (old.peak_total || 0)) patch.peak_total = b.total;
    updates.push({ key, patch });
    const before = old.status === "ok" ? old.total : 0;
    if (old.status === "ok" && b.status === "void") {
      alerts.push(mk("voided", "high", o.day, b, { amount: before, from: before, to: 0, tag: hash.slice(0, 6), en: `Bill ${b.id} (${rs(before)}) was cancelled after it was recorded`, ro: `Bill ${b.id} (${rs(before)}) record hone ke baad cancel kar diya gaya` }));
    } else if (b.total < old.total) {
      alerts.push(mk("total_lowered", "high", o.day, b, { amount: old.total - b.total, from: old.total, to: b.total, tag: hash.slice(0, 6), en: `Bill ${b.id} was lowered from ${rs(old.total)} to ${rs(b.total)}`, ro: `Bill ${b.id} ka total ${rs(old.total)} se kam karke ${rs(b.total)} kar diya gaya` }));
    } else if (b.total > old.total) {
      alerts.push(mk("total_raised", "medium", o.day, b, { amount: b.total - old.total, from: old.total, to: b.total, tag: hash.slice(0, 6), en: `Bill ${b.id} was raised from ${rs(old.total)} to ${rs(b.total)}`, ro: `Bill ${b.id} ka total ${rs(old.total)} se barha kar ${rs(b.total)} kar diya gaya` }));
    } else {
      alerts.push(mk("edited", "medium", o.day, b, { amount: 0, tag: hash.slice(0, 6), en: `Bill ${b.id} (${rs(b.total)}) was edited after it was recorded (time, user or discount changed)`, ro: `Bill ${b.id} (${rs(b.total)}) record hone ke baad edit hua (waqt, user ya discount)` }));
    }
  }

  // Bills we recorded earlier that are no longer in the POS.
  const gone = [];
  for (const [key, old] of ledger) {
    if (seen.has(key) || old.missing) continue;
    gone.push({ key, old });
    updates.push({ key, patch: { missing: true, missing_at: o.now } });
  }
  const live = [...ledger.values()].filter((x) => !x.missing).length;
  if (gone.length >= 5 && gone.length >= 0.3 * Math.max(live, 1)) {
    const amt = gone.reduce((s, g) => s + (g.old.status === "ok" ? g.old.total : 0), 0);
    alerts.push(mk("mass_missing", "high", o.day, null, { amount: amt, tag: String(gone.length) + "_" + o.now, en: `${gone.length} bills (${rs(amt)}) disappeared at once. The POS data may have been restored from an old backup or wiped`, ro: `${gone.length} bills (${rs(amt)}) ek saath ghayab. POS ka data purane backup se wapas daala gaya ya saaf kiya gaya ho sakta hai` }));
  } else {
    for (const { old } of gone) {
      const was = old.status === "ok" ? old.total : 0;
      alerts.push(mk("deleted", "high", o.day, old, { amount: was, from: was, to: 0, en: `Bill ${old.id} (${rs(was)}) was deleted from the POS`, ro: `Bill ${old.id} (${rs(was)}) POS se delete kar diya gaya` }));
    }
  }

  // Numbering gaps: a number between the first and last of the day that we never saw.
  const known = new Map(); // prefix -> Set(n)
  for (const b of incoming) { const s = core.seqNumber(b.id); if (s) (known.get(s.prefix) || known.set(s.prefix, new Set()).get(s.prefix)).add(s.n); }
  for (const old of ledger.values()) { const s = core.seqNumber(old.id); if (s) (known.get(s.prefix) || known.set(s.prefix, new Set()).get(s.prefix)).add(s.n); }
  const total = incoming.length + gone.length;
  for (const [prefix, set] of known) {
    if (set.size < 5 || set.size < 0.8 * total) continue; // not a clean running number
    const nums = [...set].sort((a, b) => a - b);
    const missing = [];
    for (let n = nums[0]; n <= nums[nums.length - 1] && missing.length <= 20; n++) if (!set.has(n)) missing.push(n);
    if (missing.length && missing.length <= 20) {
      const list = missing.map((n) => prefix + n).join(", ");
      alerts.push(mk("gap", "medium", o.day, null, { tag: missing.join("-").slice(0, 60), en: `Bill numbers missing on ${o.day}: ${list}`, ro: `${o.day} par bill numbers gayab: ${list}` }));
    }
  }

  const merged = new Map(ledger);
  for (const c of creates) merged.set(c.key, c.doc);
  for (const u of updates) merged.set(u.key, Object.assign({}, merged.get(u.key), u.patch));
  let liveTotal = 0, recorded = 0, count = 0;
  for (const x of merged.values()) {
    recorded += x.peak_total || 0;
    if (!x.missing && x.status === "ok") { liveTotal += x.total; count++; }
  }
  return {
    creates, updates, alerts: alerts.slice(0, MAX_ALERTS), alertsDropped: Math.max(0, alerts.length - MAX_ALERTS),
    totals: { live: core.money(liveTotal), recorded: core.money(recorded), count },
  };
}

// Total-only mode (the agent could not read single bills): only the day total and row count are known.
function checkTotalOnly(prev, total, count, day) {
  const alerts = [];
  if (prev && typeof prev.peak_total === "number" && total < prev.peak_total - 0.5) {
    alerts.push(mk("total_dropped", "high", day, null, { amount: prev.peak_total - total, from: prev.peak_total, to: total, tag: String(Math.round(total)), en: `Today's total dropped from ${rs(prev.peak_total)} to ${rs(total)}`, ro: `Aaj ka total ${rs(prev.peak_total)} se gir kar ${rs(total)} reh gaya` }));
  }
  if (prev && typeof prev.peak_count === "number" && typeof count === "number" && count < prev.peak_count) {
    alerts.push(mk("bills_fewer", "high", day, null, { from: prev.peak_count, to: count, tag: String(count), en: `Number of sales today dropped from ${prev.peak_count} to ${count}`, ro: `Aaj ki sales ki tadad ${prev.peak_count} se kam ho kar ${count} reh gayi` }));
  }
  return alerts;
}

module.exports = { diffDay, checkTotalOnly, keyOf };
