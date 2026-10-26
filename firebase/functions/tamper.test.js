"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const core = require("./billcore");
const { diffDay, checkTotalOnly, keyOf } = require("./tamper");

const DAY = "2026-10-20";
const T = (h, m = 0) => Date.parse(`${DAY}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:00`);
const bill = (n, total, h = 12, extra = {}) => core.normalizeBill({ id: "INV-" + String(n).padStart(4, "0"), ts: T(h, n % 60), total, ...extra });
const NOW = T(23, 30);
const ctxOf = (o = {}) => Object.assign({ day: DAY, today: "2026-10-26", now: NOW, dayKnown: false }, o);

// Applies a diff result to a ledger Map like the server does.
function apply(ledger, r) {
  const m = new Map(ledger);
  for (const c of r.creates) m.set(c.key, c.doc);
  for (const u of r.updates) m.set(u.key, Object.assign({}, m.get(u.key), u.patch));
  return m;
}
const types = (r) => r.alerts.map((a) => a.type).sort();
const first = (bills) => { const r = diffDay(new Map(), bills, ctxOf()); return { r, ledger: apply(new Map(), r) }; };

test("billcore: normalize, hash and digest", () => {
  assert.strictEqual(core.normalizeBill({ id: "", ts: T(10), total: 5 }), null);
  assert.strictEqual(core.normalizeBill({ id: "A", ts: 5, total: 5 }), null);
  assert.strictEqual(core.normalizeBill({ id: "A", ts: T(10), total: "abc" }), null);
  const a = bill(1, 100), b = bill(2, 200);
  assert.strictEqual(core.dayDigest([a, b]), core.dayDigest([b, a]), "order must not matter");
  assert.notStrictEqual(core.dayDigest([a, b]), core.dayDigest([a, bill(2, 199)]), "any total change changes the digest");
  assert.notStrictEqual(core.dayDigest([a, b]), core.dayDigest([a]), "a missing bill changes the digest");
  assert.strictEqual(core.dayOf(T(0, 30)), DAY, "Karachi midnight belongs to the new day");
  assert.strictEqual(core.dayOf(Date.parse(DAY + "T23:30:00+05:00")), DAY);
});

test("billcore: the agent and server copies are identical", () => {
  const a = fs.readFileSync(path.join(__dirname, "billcore.js"), "utf8");
  const b = fs.readFileSync(path.join(__dirname, "..", "..", "agent", "billcore.js"), "utf8");
  assert.strictEqual(a, b);
});

test("collapse: rows with one id become one bill", () => {
  const rows = [bill(1, 100), bill(1, 50), bill(2, 70)];
  const c = core.collapse(rows);
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c.find((x) => x.id === "INV-0001").total, 150);
});

test("first sight records bills, raises no alerts for ordinary sales", () => {
  const bills = [1, 2, 3, 4, 5, 6].map((n) => bill(n, 100 * n));
  const { r } = first(bills);
  assert.strictEqual(r.creates.length, 6);
  assert.deepStrictEqual(r.alerts, []);
  assert.strictEqual(r.totals.live, 2100);
  assert.strictEqual(r.totals.recorded, 2100);
});

test("a deleted bill is flagged with its original amount, and the day total shows the hole", () => {
  const bills = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => bill(n, 1000));
  const { ledger } = first(bills);
  const r = diffDay(ledger, bills.filter((b) => b.id !== "INV-0004"), ctxOf({ dayKnown: true }));
  const del = r.alerts.filter((a) => a.type === "deleted");
  assert.strictEqual(del.length, 1);
  assert.strictEqual(del[0].bill_id, "INV-0004");
  assert.strictEqual(del[0].amount, 1000);
  assert.strictEqual(r.totals.live, 9000);
  assert.strictEqual(r.totals.recorded, 10000, "recorded keeps the deleted bill, so the loss stays visible");
  assert.ok(!types(r).includes("gap"), "a bill we recorded is reported as deleted, not as a gap");
});

test("a number we never saw (created and deleted between checks) shows up as a gap", () => {
  const bills = [1, 2, 3, 5, 6, 7, 8].map((n) => bill(n, 100));
  const { r } = first(bills);
  assert.deepStrictEqual(types(r), ["gap"]);
  assert.ok(r.alerts[0].message_en.includes("INV-4"));
});

test("lowering a bill total is a HIGH alert and keeps the original", () => {
  const bills = [1, 2, 3].map((n) => bill(n, 5000));
  const { ledger } = first(bills);
  const r = diffDay(ledger, [bills[0], bill(2, 500), bills[2]], ctxOf({ dayKnown: true }));
  assert.deepStrictEqual(types(r), ["total_lowered"]);
  assert.strictEqual(r.alerts[0].severity, "high");
  assert.strictEqual(r.alerts[0].amount, 4500);
  assert.strictEqual(r.totals.recorded, 15000);
  assert.strictEqual(r.totals.live, 10500);
  const m = apply(ledger, r);
  assert.strictEqual(m.get(keyOf(DAY, "INV-0002")).first_total, 5000, "first_total never changes");
});

test("same tamper seen again does not raise a second alert id", () => {
  const bills = [1, 2, 3].map((n) => bill(n, 5000));
  const { ledger } = first(bills);
  const tampered = [bills[0], bill(2, 500), bills[2]];
  const r1 = diffDay(ledger, tampered, ctxOf({ dayKnown: true }));
  const r2 = diffDay(apply(ledger, r1), tampered, ctxOf({ dayKnown: true }));
  assert.deepStrictEqual(r2.alerts, []);
  assert.deepStrictEqual(r2.updates, []);
});

test("void after recording, raised total, plain edit", () => {
  const bills = [1, 2, 3].map((n) => bill(n, 1000));
  const { ledger } = first(bills);
  const r = diffDay(ledger, [bill(1, 1000, 12, { status: "void" }), bill(2, 1500), bill(3, 1000, 12, { cashier: "zain" })], ctxOf({ dayKnown: true }));
  assert.deepStrictEqual(types(r), ["edited", "total_raised", "voided"]);
});

test("many bills vanishing at once = one 'restored from backup' alert, not a flood", () => {
  const bills = Array.from({ length: 20 }, (_, i) => bill(i + 1, 100));
  const { ledger } = first(bills);
  const r = diffDay(ledger, bills.slice(0, 8), ctxOf({ dayKnown: true }));
  assert.deepStrictEqual(types(r), ["mass_missing"]);
  assert.strictEqual(r.alerts[0].amount, 1200);
});

test("late add to a past day, odd hour, big discount, void on arrival", () => {
  const { ledger } = first([1, 2, 3].map((n) => bill(n, 100)));
  const r = diffDay(ledger, [1, 2, 3].map((n) => bill(n, 100)).concat([bill(4, 900, 14), bill(5, 300, 3), bill(6, 700, 13, { discount: 500 }), bill(7, 400, 15, { status: "void" })]), ctxOf({ dayKnown: true }));
  assert.deepStrictEqual(types(r).filter((t) => t !== "late_add"), ["big_discount", "odd_hour", "void_new"]);
  assert.ok(types(r).includes("late_add"));
  // today's new bills are normal
  const r2 = diffDay(ledger, [1, 2, 3].map((n) => bill(n, 100)).concat([bill(4, 900, 14)]), ctxOf({ dayKnown: true, today: DAY }));
  assert.deepStrictEqual(r2.alerts, []);
});

test("a bill made minutes ago on a day that just rolled over is not 'late'", () => {
  const { ledger } = first([1, 2, 3].map((n) => bill(n, 100)));
  const nb = core.normalizeBill({ id: "INV-0004", ts: NOW - 5 * 60000, total: 100 });
  const r = diffDay(ledger, [1, 2, 3].map((n) => bill(n, 100)).concat([nb]), ctxOf({ dayKnown: true }));
  assert.ok(!types(r).includes("late_add"));
});

test("ids that are not a clean running number never cause gap alerts", () => {
  const bills = ["A7", "ZZ", "B-99", "X1", "Q500", "Q9"].map((id, i) => core.normalizeBill({ id, ts: T(10, i), total: 10 }));
  assert.deepStrictEqual(first(bills).r.alerts, []);
});

test("total-only mode: a lower total or fewer rows is flagged", () => {
  const prev = { peak_total: 10000, peak_count: 40 };
  assert.deepStrictEqual(checkTotalOnly(prev, 10000, 40, DAY), []);
  assert.deepStrictEqual(checkTotalOnly(prev, 12000, 41, DAY), []);
  assert.deepStrictEqual(checkTotalOnly(null, 5, 1, DAY), []);
  const a = checkTotalOnly(prev, 7500, 39, DAY);
  assert.deepStrictEqual(a.map((x) => x.type).sort(), ["bills_fewer", "total_dropped"]);
  assert.strictEqual(a.find((x) => x.type === "total_dropped").amount, 2500);
});
