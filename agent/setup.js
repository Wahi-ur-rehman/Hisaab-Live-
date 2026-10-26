"use strict";
// Shop setup: ask only WHERE the POS data is, then find the invoice / total / date columns by itself.
// A person is asked to choose only if the guess is not confident.
const { autoMap, describe, parseDate } = require("./automap");

const TYPES = [
  ["sqlite", "SQLite database file (.db, .sqlite)"],
  ["mssql", "SQL Server"],
  ["access", "Microsoft Access file (.mdb, .accdb)"],
  ["xlsx", "Excel file (.xlsx)"],
  ["csv", "CSV file (Excel 'Save as CSV')"],
];
const clean = (s) => String(s || "").trim().replace(/^"(.*)"$/, "$1");
const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';

async function askConf(type, ask) {
  if (type === "mssql") {
    const server = clean(await ask("SQL Server name (e.g. .\\SQLEXPRESS or localhost): "));
    const database = clean(await ask("Database name: "));
    const user = clean(await ask("SQL login name (leave empty for Windows login): "));
    let conn = `Server=${q(server)};Database=${q(database)};`;
    if (user) conn += `User Id=${q(user)};Password=${q(await ask("Password: "))};`;
    else conn += "Integrated Security=SSPI;";
    return { conn: conn + "Application Name=HisaabLive;ApplicationIntent=ReadOnly;" };
  }
  return { path: clean(await ask("Full path of the file (e.g. C:\\POS\\data.db): ")) };
}

const num = (s, max) => { const n = parseInt(String(s).trim(), 10); return n >= 0 && n <= max ? n : NaN; };

async function chooseColumns(table, ask) {
  const names = table.columns.map((c) => c.name);
  console.log("Columns:\n" + names.map((n, i) => `  ${i + 1}) ${n}`).join("\n"));
  const role = async (label, optional) => {
    for (;;) {
      const n = num(await ask(`Number of the ${label} column${optional ? " (0 = none)" : ""}: `), names.length);
      if (!Number.isNaN(n) && (n > 0 || optional)) return n > 0 ? names[n - 1] : undefined;
    }
  };
  const id = await role("INVOICE / BILL NUMBER", true);
  const total = await role("TOTAL", false);
  const date = await role("DATE (and time)", false);
  const status = await role("CANCELLED / VOID / STATUS", true);
  const cashier = await role("CASHIER / USER", true);
  const cols = { total, date };
  if (id) cols.id = id;
  if (status) { cols.status = status; cols.statusMode = /status|state|type/i.test(status) ? "text" : "flag"; }
  if (cashier) cols.cashier = cashier;
  return cols;
}

async function chooseSource({ ask, make, log = console.log, presetType }) {
  let type = presetType;
  while (!type) {
    console.log("Where does your billing / POS program keep its data?\n" + TYPES.map((t, i) => `  ${i + 1}) ${t[1]}`).join("\n"));
    const n = num(await ask("Number: "), TYPES.length);
    if (n >= 1) type = TYPES[n - 1][0];
  }
  const conf = await askConf(type, ask);
  const conn = make(type, conf);
  log("Reading the database to find the invoice, total and date columns...");
  const tables = await conn.listTables();
  if (!tables.length) throw new Error("No tables found in that database");
  let m = autoMap(tables);

  let table, cols, mode, dayFirst = true;
  if (m.ok) {
    log("Found: " + describe(m));
    if (m.confident) {
      const a = String(await ask("Use this? [Y/n]: ")).trim().toLowerCase();
      if (a !== "n" && a !== "no") { table = tables.find((t) => t.name === m.table); cols = m.cols; mode = m.mode; dayFirst = m.dayFirst; }
    } else {
      log(m.mode === "totals" ? "No invoice-number column was found, so only the daily total can be watched." : "Not fully sure about this guess.");
      const a = String(await ask("Use this anyway? [y/N]: ")).trim().toLowerCase();
      if (a === "y" || a === "yes") { table = tables.find((t) => t.name === m.table); cols = m.cols; mode = m.mode; dayFirst = m.dayFirst; }
    }
  } else log(m.reason);

  if (!table) {
    console.log("Tables:\n" + tables.map((t, i) => `  ${i + 1}) ${t.name}  (${t.rowCount || 0} rows)`).join("\n"));
    for (;;) {
      const n = num(await ask("Number of the table that holds the BILLS / SALES: "), tables.length);
      if (n >= 1) { table = tables[n - 1]; break; }
    }
    cols = await chooseColumns(table, ask);
    mode = cols.id ? "bills" : "totals";
    const { detectDayFirst } = require("./automap");
    dayFirst = detectDayFirst(table.sample.map((r) => r[cols.date]));
    const ok = table.sample.filter((r) => Number.isFinite(parseDate(r[cols.date], { dayFirst }))).length;
    if (table.sample.length && ok / table.sample.length < 0.8) log("Warning: most dates in that column could not be understood.");
  }
  const dateVals = table.sample.map((r) => r[cols.date]).filter((v) => typeof v === "string" && v);
  const col = table.columns.find((c) => c.name === cols.date) || {};
  const source = {
    type, ...conf, table: table.name, cols, mode, dayFirst,
    dateIso: dateVals.length > 0 && dateVals.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v)),
    dateType: col.type || "",
  };
  log(mode === "bills" ? "OK. Every bill will be watched." : "OK. Daily total will be watched (no invoice numbers available).");
  return source;
}

module.exports = { chooseSource };
