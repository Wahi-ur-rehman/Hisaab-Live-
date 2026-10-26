"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { createSync } = require("./sync");
const { chooseSource } = require("./setup");
const sqlite = require("./connectors/sqlite");
const core = require("./billcore");

const MIN = 60000;
const NOW0 = Date.parse("2026-10-20T15:00:00+05:00");
const dbFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hl-sync-")), "pos.db");
function seed(file, n = 6) {
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE Sales(InvoiceNo TEXT, InvDate TEXT, NetAmount REAL, IsDeleted INTEGER DEFAULT 0)");
  const ins = db.prepare("INSERT INTO Sales(InvoiceNo, InvDate, NetAmount) VALUES (?,?,?)");
  for (let i = 1; i <= n; i++) ins.run("INV-" + i, `2026-10-20 1${i % 5}:00:00`, 100 * i);
  return db;
}
const source = { type: "sqlite", table: "Sales", mode: "bills", dayFirst: true, dateIso: true, cols: { id: "InvoiceNo", total: "NetAmount", date: "InvDate", status: "IsDeleted", statusMode: "flag" } };

// A stand-in server: remembers each day's digest like the real one, asks for bills when it differs.
function fakeServer() {
  const known = new Map(), calls = [];
  const callFn = async (name, data) => {
    calls.push({ name, data });
    if (name === "agentPush") return { ok: true };
    const need = [];
    for (const d of data.days) {
      if (data.bills && data.bills[d.date]) known.set(d.date, core.dayDigest(core.collapse(data.bills[d.date].map(core.normalizeBill).filter(Boolean))));
      else if (known.get(d.date) !== d.digest) need.push(d.date);
    }
    return { ok: true, need };
  };
  return { callFn, calls, known };
}
const mk = (file, srv, clock, src = source) => createSync({ connector: sqlite.create({ path: file }), source: src, callFn: srv.callFn, cfg: { shopId: "g10", license_key: "L" }, now: () => clock.t });

test("sync: first run sends digests then the bills; quiet when nothing changes; sends only what changed", async () => {
  const file = dbFile(); const db = seed(file);
  const srv = fakeServer(), clock = { t: NOW0 };
  const s = mk(file, srv, clock);
  await s.tick();
  const withBills = srv.calls.filter((c) => c.data.bills);
  assert.strictEqual(withBills.length, 1);
  assert.strictEqual(withBills[0].data.bills["2026-10-20"].length, 6);
  const before = srv.calls.length;
  clock.t += 30000; await s.tick();
  assert.strictEqual(srv.calls.length, before, "unchanged data -> no calls");

  db.exec("UPDATE Sales SET NetAmount = 5 WHERE InvoiceNo = 'INV-3'");
  clock.t += 30000; await s.tick();
  const c = srv.calls.slice(before);
  assert.strictEqual(c.length, 2, "digest call + bills call");
  assert.deepStrictEqual(c[0].data.days.map((d) => d.date), ["2026-10-20"], "only the changed day");
  assert.strictEqual(c[1].data.bills["2026-10-20"].find((b) => b.id === "INV-3").total, 5);
});

test("sync: a deleted row is reported (the day's digest changes), a soft-delete flag becomes 'void'", async () => {
  const file = dbFile(); const db = seed(file);
  const srv = fakeServer(), clock = { t: NOW0 };
  const s = mk(file, srv, clock);
  await s.tick();
  db.exec("DELETE FROM Sales WHERE InvoiceNo = 'INV-2'");
  db.exec("UPDATE Sales SET IsDeleted = 1 WHERE InvoiceNo = 'INV-5'");
  clock.t += 30000; await s.tick();
  const last = srv.calls[srv.calls.length - 1].data.bills["2026-10-20"];
  assert.strictEqual(last.length, 5);
  assert.ok(!last.find((b) => b.id === "INV-2"));
  assert.strictEqual(last.find((b) => b.id === "INV-5").status, "void");
});

test("sync: heartbeat every 5 minutes, full re-check every 15 minutes", async () => {
  const file = dbFile(); seed(file);
  const srv = fakeServer(), clock = { t: NOW0 };
  const s = mk(file, srv, clock);
  await s.tick();
  let n = srv.calls.length;
  clock.t += 6 * MIN; await s.tick();
  assert.strictEqual(srv.calls.length, n + 1, "one light call");
  assert.deepStrictEqual(srv.calls[n].data.days.map((d) => d.date).sort(), ["2026-10-19", "2026-10-20"]);
  n = srv.calls.length;
  clock.t += 16 * MIN; await s.tick();
  assert.ok(srv.calls[n].data.days.length >= 2);
});

test("sync: unreadable rows are counted and reported (a garbage date must not hide a bill)", async () => {
  const file = dbFile(); const db = seed(file);
  db.exec("INSERT INTO Sales(InvoiceNo, InvDate, NetAmount) VALUES ('INV-99','not a date',5000)");
  const srv = fakeServer(), clock = { t: NOW0 };
  const sy = mk(file, srv, clock);
  await sy.tick();
  assert.strictEqual(srv.calls[0].data.unreadable, 1);
  // a garbage row added LATER changes no day's fingerprint, but must still be reported
  const n = srv.calls.length;
  db.exec("INSERT INTO Sales(InvoiceNo, InvDate, NetAmount) VALUES ('INV-98','???',9000)");
  clock.t += 30000; await sy.tick();
  assert.ok(srv.calls.length > n && srv.calls[srv.calls.length - 1].data.unreadable === 2);
});

test("sync: totals-only mode sends the day's total and row count; cancelled rows are not counted", async () => {
  const file = dbFile(); const db = seed(file);
  db.exec("UPDATE Sales SET IsDeleted = 1 WHERE InvoiceNo = 'INV-1'");
  const srv = fakeServer(), clock = { t: NOW0 };
  const s = mk(file, srv, clock, { ...source, mode: "totals", cols: { total: "NetAmount", date: "InvDate", status: "IsDeleted", statusMode: "flag" } });
  await s.tick();
  assert.deepStrictEqual([srv.calls[0].name, srv.calls[0].data.total, srv.calls[0].data.count], ["agentPush", 2000, 5]);
  clock.t += 30000; await s.tick();
  assert.strictEqual(srv.calls.length, 1, "unchanged -> nothing sent");
});

test("setup wizard: only asks for the type and the path, then confirms the automatic guess", async () => {
  const file = dbFile(); seed(file);
  const answers = ["1", file, "y"], asked = [];
  const ask = async (q) => { asked.push(q); return answers.shift(); };
  const src = await chooseSource({ ask, make: (t, c) => sqlite.create(c), log: () => {} });
  assert.strictEqual(asked.length, 3);
  assert.strictEqual(src.table, "Sales");
  assert.strictEqual(src.mode, "bills");
  assert.strictEqual(src.dateIso, true);
  assert.deepStrictEqual([src.cols.id, src.cols.total, src.cols.date], ["InvoiceNo", "NetAmount", "InvDate"]);
});

test("setup wizard: when the guess is wrong the person picks table and columns by number", async () => {
  const file = dbFile();
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE xyz(a TEXT, b TEXT, c REAL)");
  for (let i = 0; i < 5; i++) db.prepare("INSERT INTO xyz VALUES (?,?,?)").run("N" + i, "2026-10-20 10:0" + i + ":00", 100 + i);
  db.close();
  const answers = ["1", file, "1", "1", "3", "2", "0", "0"]; // type, path, table 1, id=a, total=c, date=b, no status, no cashier
  const src = await chooseSource({ ask: async () => answers.shift(), make: (t, c) => sqlite.create(c), log: () => {} });
  assert.deepStrictEqual(src.cols, { total: "c", date: "b", id: "a" });
  assert.strictEqual(src.mode, "bills");
});
