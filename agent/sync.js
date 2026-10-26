"use strict";
// One polling step of the agent: read the POS, turn rows into standard bills, tell the server what changed.
// Everything it needs is passed in, so it is tested without a network or a real POS.
const core = require("./billcore");
const { rowToBill } = require("./automap");

const MIN = 60000;
const BEAT_MS = 5 * MIN;     // "I am alive" + re-check today and yesterday
const FULL_MS = 15 * MIN;    // re-check the whole window against the server
const CHUNK_BILLS = 2500;
const CHUNK_DAYS = 30;

function createSync({ connector, source, callFn, cfg, log = () => {}, now = () => Date.now() }) {
  const m = { table: source.table, cols: source.cols, dayFirst: source.dayFirst !== false, mode: source.mode };
  const windowDays = source.windowDays || 35;
  const state = { sent: new Map(), lastBeat: 0, lastFull: 0, lastFp: undefined, unreadable: 0, lastTotal: null, lastTotalAt: 0, lastCount: null };
  const auth = { shopId: cfg.shopId, license_key: cfg.license_key };

  async function readRows() {
    const used = [...new Set(Object.entries(m.cols).filter(([k]) => k !== "statusMode").map(([, v]) => v))];
    const since = core.dayOf(now() - (windowDays - 1) * 86400000);
    return connector.readRows(m.table, used, { since, dateCol: m.cols.date, dateIso: source.dateIso, dateType: source.dateType });
  }

  async function tickBills() {
    const t = now();
    const full = t - state.lastFull >= FULL_MS || state.lastFull === 0;
    const beat = t - state.lastBeat >= BEAT_MS;
    const fp = connector.fingerprint ? await connector.fingerprint() : null;
    if (fp !== null && fp === state.lastFp && !full && !beat) return;

    const rows = await readRows();
    const today = core.dayOf(t);
    const oldest = core.dayOf(t - (windowDays - 1) * 86400000);
    let unreadable = 0;
    const raw = [];
    for (const r of rows) {
      const b = rowToBill(r, m);
      if (!b) { unreadable++; continue; }
      raw.push(b);
    }
    const byDay = new Map();
    for (const b of core.collapse(raw.map(core.normalizeBill).filter(Boolean))) {
      const d = core.dayOf(b.ts);
      if (d < oldest || d > today) continue; // outside the window (or a date in the future)
      (byDay.get(d) || byDay.set(d, []).get(d)).push(b);
    }
    const digests = new Map([...byDay].map(([d, bills]) => [d, core.dayDigest(bills)]));
    // a day that had bills and now has none still has to be reported
    for (const d of state.sent.keys()) if (!digests.has(d) && d >= oldest) { byDay.set(d, []); digests.set(d, core.dayDigest([])); }

    let toSend = new Set();
    for (const [d, dg] of digests) if (state.sent.get(d) !== dg) toSend.add(d);
    if (full) for (const d of digests.keys()) toSend.add(d);
    if (beat) { toSend.add(today); toSend.add(core.dayOf(t - 86400000)); }
    // an unreadable row changes no day's fingerprint, so a change in their number must trigger a report by itself
    if (unreadable !== state.unreadable) toSend.add(today);
    if (!digests.has(today)) { byDay.set(today, byDay.get(today) || []); digests.set(today, core.dayDigest([])); }
    if (!digests.has(core.dayOf(t - 86400000))) digests.set(core.dayOf(t - 86400000), core.dayDigest([]));
    toSend = [...toSend].filter((d) => digests.has(d)).sort();
    if (!toSend.length) { state.lastFp = fp; return; }

    const needAll = [];
    for (let i = 0; i < toSend.length; i += CHUNK_DAYS) {
      const part = toSend.slice(i, i + CHUNK_DAYS);
      const res = await callFn("agentSync", { ...auth, days: part.map((d) => ({ date: d, digest: digests.get(d) })), unreadable });
      const need = new Set(res.need || []);
      for (const d of part) if (!need.has(d)) state.sent.set(d, digests.get(d));
      needAll.push(...need);
    }
    // send the bills of days the server does not agree with, in chunks
    let chunk = [], n = 0;
    const flush = async () => {
      if (!chunk.length) return;
      const bills = {};
      for (const d of chunk) bills[d] = (byDay.get(d) || []).map((b) => ({ id: b.id, ts: b.ts, total: b.total, status: b.status, cashier: b.cashier, discount: b.discount }));
      await callFn("agentSync", { ...auth, days: chunk.map((d) => ({ date: d, digest: digests.get(d) })), bills, unreadable });
      for (const d of chunk) state.sent.set(d, digests.get(d));
      chunk = []; n = 0;
    };
    for (const d of needAll.sort()) {
      const size = (byDay.get(d) || []).length;
      if (n + size > CHUNK_BILLS && chunk.length) await flush();
      if (size > CHUNK_BILLS) { log("Day", d, "has", size, "bills, more than one call can carry; skipped"); continue; }
      chunk.push(d); n += size;
    }
    await flush();
    state.unreadable = unreadable;
    state.lastFp = fp;
    if (beat) state.lastBeat = t;
    if (full) state.lastFull = t;
    if (unreadable) log(unreadable, "rows in the POS could not be read (bad date or amount)");
  }

  // Fallback for databases with no invoice number: only the day's total (and number of rows) is known.
  async function tickTotals() {
    const t = now();
    const rows = await readRows();
    const today = core.dayOf(t);
    let total = 0, count = 0;
    for (const r of rows) {
      const b = rowToBill(r, m);
      if (!b || core.dayOf(b.ts) !== today || b.status === "void") continue;
      total += b.total; count++;
    }
    total = core.money(total);
    if (total !== state.lastTotal || count !== state.lastCount || t - state.lastTotalAt >= BEAT_MS) {
      await callFn("agentPush", { ...auth, total, count });
      state.lastTotal = total; state.lastCount = count; state.lastTotalAt = t;
    }
  }

  return {
    state,
    // returns how long to wait before the next step
    async tick() {
      const t0 = Date.now();
      await (m.mode === "bills" ? tickBills() : tickTotals());
      return Math.max(connector.pollMs || 10000, (Date.now() - t0) * 5);
    },
  };
}

module.exports = { createSync };
