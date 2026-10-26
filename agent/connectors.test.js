"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { autoMap, rowToBill } = require("./automap");
const sqlite = require("./connectors/sqlite");
const csv = require("./connectors/csv");
const xlsx = require("./connectors/xlsx");
const psdb = require("./connectors/psdb");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hl-conn-"));

function makePosDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE Customers(CustomerID INTEGER PRIMARY KEY, Name TEXT);
    CREATE TABLE Sales(SaleID INTEGER PRIMARY KEY, InvoiceNo TEXT, InvDate TEXT, NetAmount REAL, CashierName TEXT, IsDeleted INTEGER DEFAULT 0);
    CREATE TABLE SaleDetail(InvoiceNo TEXT, ItemName TEXT, Qty INTEGER, Amount REAL);`);
  const ins = db.prepare("INSERT INTO Sales(InvoiceNo, InvDate, NetAmount, CashierName) VALUES (?,?,?,?)");
  for (let i = 1; i <= 12; i++) ins.run("INV-" + String(i).padStart(4, "0"), `2026-10-20 ${String(9 + (i % 10)).padStart(2, "0")}:0${i % 6}:00`, 100 * i, i % 2 ? "ali" : "zain");
  db.exec("INSERT INTO Customers(Name) VALUES ('x')");
  db.exec("INSERT INTO SaleDetail VALUES ('INV-0001','soap',2,100)");
  db.close();
}

test("SQLite: tables listed, columns found automatically, rows read as bills", async () => {
  const file = path.join(tmp(), "pos.db");
  makePosDb(file);
  const c = sqlite.create({ path: file });
  const tables = await c.listTables();
  assert.deepStrictEqual(tables.map((t) => t.name).sort(), ["Customers", "SaleDetail", "Sales"]);
  const m = autoMap(tables);
  assert.ok(m.ok && m.confident);
  assert.strictEqual(m.table, "Sales");
  assert.deepStrictEqual([m.cols.id, m.cols.total, m.cols.date], ["InvoiceNo", "NetAmount", "InvDate"]);
  const rows = await c.readRows(m.table, ["InvoiceNo", "NetAmount", "InvDate"]);
  assert.strictEqual(rows.length, 12);
  assert.strictEqual(rowToBill(rows[0], m).total, 100);
  const filtered = await c.readRows(m.table, ["InvoiceNo", "NetAmount", "InvDate"], { dateIso: true, since: "2026-10-21", dateCol: "InvDate" });
  assert.strictEqual(filtered.length, 0, "ISO dates let the database skip old rows");
});

test("SQLite connector cannot change the POS database", async () => {
  const file = path.join(tmp(), "pos.db");
  makePosDb(file);
  const db = new (require("node:sqlite").DatabaseSync)(file, { readOnly: true });
  assert.throws(() => db.exec("DELETE FROM Sales"));
  db.close();
  const c = sqlite.create({ path: file });
  await assert.rejects(() => c.readRows('Sales"; DROP TABLE Sales; --', ["x"]));
  const n = new DatabaseSync(file).prepare("SELECT COUNT(*) AS n FROM Sales").get().n;
  assert.strictEqual(n, 12, "table names are quoted, nothing can be injected");
});

test("CSV: quotes, commas inside fields, semicolon separator, BOM, title rows above the header", async () => {
  const dir = tmp(), f = path.join(dir, "sales.csv");
  fs.writeFileSync(f, '\ufeffMy shop,\nBill No;Date;Customer;Total\n1;20/10/2026 10:00;"Ali; & ""Sons""";"1,200"\n2;20/10/2026 11:00;Bob;300\n');
  const c = csv.create({ path: f });
  const [t] = await c.listTables();
  assert.deepStrictEqual(t.columns.map((x) => x.name), ["Bill No", "Date", "Customer", "Total"]);
  assert.strictEqual(t.rowCount, 2);
  const m = autoMap([t]);
  assert.deepStrictEqual([m.cols.id, m.cols.total, m.cols.date], ["Bill No", "Total", "Date"]);
  const rows = await c.readRows();
  assert.strictEqual(rows[0].Customer, 'Ali; & "Sons"');
  assert.strictEqual(rowToBill(rows[0], m).total, 1200);
  assert.ok((await c.fingerprint()).includes(":"));
});

test("Excel .xlsx: reads sheets without any library, finds the header under a title row, numeric dates", async () => {
  const c = xlsx.create({ path: path.join(__dirname, "test-fixtures", "sample.xlsx") });
  const tables = await c.listTables();
  assert.deepStrictEqual(tables.map((t) => t.name), ["Sales Register", "Notes"]);
  const m = autoMap(tables);
  assert.ok(m.ok);
  assert.strictEqual(m.table, "Sales Register");
  assert.deepStrictEqual([m.cols.id, m.cols.total, m.cols.date, m.cols.cashier], ["Bill No", "Amount", "Date", "Cashier"]);
  const rows = await c.readRows("Sales Register");
  assert.strictEqual(rows.length, 5);
  const b = rowToBill(rows[0], m);
  assert.strictEqual(b.id, "B-001");
  assert.strictEqual(b.total, 100.5);
  assert.strictEqual(new Date(b.ts).toISOString().slice(0, 16), "2026-10-20T05:17", "10:17 Pakistan time");
  assert.strictEqual(rows[1].Customer, "Cust & Co 2", "XML escapes decoded");
});

test("SQL Server / Access: scripts are built safely and the JSON answer is understood (not run here)", async () => {
  assert.strictEqual(psdb.b("Sales]; DROP"), "[Sales]]; DROP]");
  assert.strictEqual(psdb.psq("it's"), "'it''s'");
  assert.strictEqual(psdb.qname("dbo.Sales"), "[dbo].[Sales]");
  const scripts = [];
  const run = async (script) => {
    scripts.push(script);
    if (script.includes("INFORMATION_SCHEMA.COLUMNS")) return JSON.stringify([
      { s: "dbo", t: "Sales", c: "InvoiceNo", d: "varchar" }, { s: "dbo", t: "Sales", c: "SaleDate", d: "datetime" }, { s: "dbo", t: "Sales", c: "NetAmount", d: "money" }]);
    if (script.includes("COUNT(*)")) return JSON.stringify([{ n: 7 }]);
    if (script.includes("TOP 30")) return JSON.stringify([{ InvoiceNo: "A1", SaleDate: "2026-10-20 10:00:00", NetAmount: 500 }]);
    return JSON.stringify([{ InvoiceNo: "A1", SaleDate: "2026-10-20 10:00:00", NetAmount: 500 }]);
  };
  const c = psdb.create("mssql", { conn: "Server=x;Database=y;Integrated Security=SSPI;" }, run);
  const tables = await c.listTables();
  assert.strictEqual(tables[0].name, "dbo.Sales");
  assert.strictEqual(tables[0].rowCount, 7);
  assert.strictEqual(autoMap(tables).cols.total, "NetAmount");
  const rows = await c.readRows("dbo.Sales", ["InvoiceNo", "SaleDate"], { since: "2026-10-01", dateCol: "SaleDate", dateType: "datetime" });
  assert.strictEqual(rows.length, 1);
  const last = scripts[scripts.length - 1];
  assert.ok(last.includes("[dbo].[Sales]") && last.includes(">= ''2026-10-01''"), "date filter applied");
  assert.ok(last.includes("Integrated Security=SSPI"));
  assert.strictEqual(psdb.parse("").length, 0);
  assert.strictEqual(psdb.parse('{"a":1}').length, 1, "PowerShell prints a single object without brackets");
  const acc = psdb.accessScript("C:\\POS\\it's$data.mdb", "Write-Output 1");
  assert.ok(acc.includes("'C:\\POS\\it''s$data.mdb'"), "path is a quoted PowerShell string, no $ expansion");
});
