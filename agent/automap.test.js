"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { autoMap, rowToBill, parseDate, parseMoney, detectDayFirst } = require("./automap");

const cols = (...n) => n.map((name) => ({ name }));
const T = (name, c, sample, rowCount = 500) => ({ name, columns: cols(...c), sample, rowCount });

test("parseDate: the formats POS systems actually use", () => {
  const p = (v, o) => new Date(parseDate(v, o)).toISOString();
  assert.strictEqual(p("2026-10-20 14:30:00"), "2026-10-20T09:30:00.000Z", "wall time is Pakistan time");
  assert.strictEqual(p("2026-10-20T14:30:00"), "2026-10-20T09:30:00.000Z");
  assert.strictEqual(p("2026-10-20T14:30:00Z"), "2026-10-20T14:30:00.000Z");
  assert.strictEqual(p("20/10/2026 02:30 PM"), "2026-10-20T09:30:00.000Z");
  assert.strictEqual(p("05/06/2026"), "2026-06-04T19:00:00.000Z", "day first by default");
  assert.strictEqual(p("05/06/2026", { dayFirst: false }), "2026-05-05T19:00:00.000Z");
  assert.strictEqual(p("20-Oct-2026 10:05"), "2026-10-20T05:05:00.000Z");
  assert.strictEqual(p(46315.5), "2026-10-20T07:00:00.000Z".replace("07", "07"), "Excel serial");
  assert.strictEqual(p(1792499400000), new Date(1792499400000).toISOString());
  assert.strictEqual(p(1792499400), new Date(1792499400000).toISOString());
  assert.strictEqual(p("/Date(1792499400000)/"), new Date(1792499400000).toISOString());
  for (const bad of ["", "abc", "13/13/2026", "32/01/2026", null, undefined, 12, "INV-0001"]) assert.ok(Number.isNaN(parseDate(bad)), "not a date: " + bad);
});

test("parseMoney and day-first detection", () => {
  assert.strictEqual(parseMoney("1,250.50"), 1250.5);
  assert.strictEqual(parseMoney("Rs. 900"), 900);
  assert.strictEqual(parseMoney(15), 15);
  assert.ok(Number.isNaN(parseMoney("abc")));
  assert.ok(Number.isNaN(parseMoney("")));
  assert.strictEqual(detectDayFirst(["25/06/2026", "01/02/2026"]), true);
  assert.strictEqual(detectDayFirst(["06/25/2026"]), false);
});

test("typical shop database: picks the sales header, not the detail or customer tables", () => {
  const sales = T("Sales", ["SaleID", "CustomerID", "InvoiceNo", "InvDate", "SubTotal", "Discount", "Tax", "NetAmount", "CashierName", "IsDeleted"], [
    { SaleID: 1, CustomerID: 5, InvoiceNo: "INV-001", InvDate: "2026-10-20 10:00:00", SubTotal: 1100, Discount: 100, Tax: 0, NetAmount: 1000, CashierName: "ali", IsDeleted: 0 },
    { SaleID: 2, CustomerID: 6, InvoiceNo: "INV-002", InvDate: "2026-10-20 10:05:00", SubTotal: 520, Discount: 0, Tax: 0, NetAmount: 520, CashierName: "ali", IsDeleted: 0 },
    { SaleID: 3, CustomerID: 7, InvoiceNo: "INV-003", InvDate: "2026-10-20 10:09:00", SubTotal: 90, Discount: 0, Tax: 0, NetAmount: 90, CashierName: "zain", IsDeleted: 1 },
  ]);
  const detail = T("SaleDetail", ["InvoiceNo", "ItemId", "Qty", "Price", "Amount", "SaleDate"], [
    { InvoiceNo: "INV-001", ItemId: 9, Qty: 2, Price: 50, Amount: 100, SaleDate: "2026-10-20 10:00:00" },
    { InvoiceNo: "INV-001", ItemId: 8, Qty: 1, Price: 900, Amount: 900, SaleDate: "2026-10-20 10:00:00" },
    { InvoiceNo: "INV-002", ItemId: 8, Qty: 1, Price: 520, Amount: 520, SaleDate: "2026-10-20 10:05:00" },
  ], 3000);
  const cust = T("Customers", ["CustomerID", "Name", "Phone"], [{ CustomerID: 5, Name: "x", Phone: "0300" }]);
  const m = autoMap([cust, detail, sales]);
  assert.ok(m.ok && m.confident);
  assert.strictEqual(m.table, "Sales");
  assert.deepStrictEqual(m.cols, { total: "NetAmount", date: "InvDate", id: "InvoiceNo", status: "IsDeleted", statusMode: "flag", cashier: "CashierName", discount: "Discount" });
  assert.strictEqual(m.mode, "bills");
  const b = rowToBill(sales.sample[2], m);
  assert.strictEqual(b.status, "void");
  assert.strictEqual(b.id, "INV-003");
  assert.strictEqual(b.total, 90);
  assert.strictEqual(b.cashier, "zain");
});

test("snake_case names, text status, comma money, dd/mm/yyyy dates", () => {
  const t = T("tbl_bill", ["bill_id", "bill_date", "sub_total", "grand_total", "user_name", "status"], [
    { bill_id: 101, bill_date: "20/10/2026 10:15", sub_total: "1,000", grand_total: "1,180", user_name: "ali", status: "Completed" },
    { bill_id: 102, bill_date: "21/10/2026 11:15", sub_total: "500", grand_total: "590", user_name: "ali", status: "Cancelled" },
    { bill_id: 103, bill_date: "25/10/2026 11:15", sub_total: "50", grand_total: "59", user_name: "zain", status: "Completed" },
  ]);
  const m = autoMap([t]);
  assert.ok(m.ok);
  assert.strictEqual(m.cols.id, "bill_id");
  assert.strictEqual(m.cols.total, "grand_total");
  assert.strictEqual(m.cols.date, "bill_date");
  assert.strictEqual(m.cols.statusMode, "text");
  assert.strictEqual(rowToBill(t.sample[0], m).total, 1180);
  assert.strictEqual(rowToBill(t.sample[0], m).status, "ok");
  assert.strictEqual(rowToBill(t.sample[1], m).status, "void");
  assert.strictEqual(m.dayFirst, true);
});

test("an Excel sheet with plain headers: Date | Bill No | Amount", () => {
  const t = T("Sheet1", ["Date", "Bill No", "Customer", "Amount"], [
    { Date: 46315, "Bill No": 1, Customer: "a", Amount: 300 },
    { Date: 46315.1, "Bill No": 2, Customer: "b", Amount: 700 },
    { Date: 46315.2, "Bill No": 3, Customer: "c", Amount: 120 },
  ], 3);
  const m = autoMap([t]);
  assert.ok(m.ok);
  assert.deepStrictEqual([m.cols.id, m.cols.total, m.cols.date, m.mode], ["Bill No", "Amount", "Date", "bills"]);
});

test("no invoice column: falls back to totals-only mode", () => {
  const t = T("DailySales", ["Date", "Total", "Cash"], [{ Date: "2026-10-20", Total: 5000, Cash: 4000 }, { Date: "2026-10-21", Total: 6000, Cash: 4500 }]);
  const m = autoMap([t]);
  assert.ok(m.ok);
  assert.strictEqual(m.mode, "totals");
  assert.strictEqual(m.confident, false, "asks the person to confirm");
});

test("a wrong guess is rejected by looking at the values (text in the 'total' column)", () => {
  const t = T("Sales", ["InvoiceNo", "SaleDate", "TotalNote", "Amount"], [
    { InvoiceNo: "A1", SaleDate: "2026-10-20", TotalNote: "paid in full", Amount: 100 },
    { InvoiceNo: "A2", SaleDate: "2026-10-20", TotalNote: "pending", Amount: 200 },
    { InvoiceNo: "A3", SaleDate: "2026-10-21", TotalNote: "paid", Amount: 300 },
  ]);
  assert.strictEqual(autoMap([t]).cols.total, "Amount");
});

test("nothing usable -> ok:false, never a silent wrong mapping", () => {
  assert.strictEqual(autoMap([T("Notes", ["Id", "Text"], [{ Id: 1, Text: "hello" }])]).ok, false);
  assert.strictEqual(autoMap([]).ok, false);
});

test("rowToBill: unreadable rows return null", () => {
  const m = { cols: { id: "i", total: "t", date: "d" }, dayFirst: true };
  assert.strictEqual(rowToBill({ i: "A", t: "x", d: "2026-10-20" }, m), null);
  assert.strictEqual(rowToBill({ i: "A", t: 5, d: "garbage" }, m), null);
  assert.strictEqual(rowToBill({ i: "", t: 5, d: "2026-10-20" }, m), null);
});
