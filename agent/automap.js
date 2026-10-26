"use strict";
// Finds the invoice / total / date columns of a shop's POS database by their NAMES, then checks the guess
// against real sample values (is the "total" column really numbers? is the "date" column really dates?).
// Input: tables = [{ name, columns: [{ name, type? }], sample: [ {col: value} ], rowCount? }]

const TZ_OFFSET_MS = 5 * 3600000; // Asia/Karachi (no daylight saving)
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const wall = (y, mo, d, h = 0, mi = 0, s = 0) => {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59 || y < 2000 || y > 2100) return NaN;
  return Date.UTC(y, mo - 1, d, h, mi, s) - TZ_OFFSET_MS; // wall-clock time in Pakistan -> real instant
};

// Value -> epoch ms (NaN if it is not a date). dayFirst: "05/06/2026" means 5 June (Pakistan style).
function parseDate(v, { dayFirst = true } = {}) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") {
    if (v > 25569 && v < 80000) return Math.round((v - 25569) * 86400000) - TZ_OFFSET_MS; // Excel serial day
    if (v > 1e12 && v < 4.2e12) return Math.round(v);                                       // epoch ms
    if (v > 9e8 && v < 4.2e9) return Math.round(v * 1000);                                  // epoch seconds
    return NaN;
  }
  if (typeof v !== "string") return NaN;
  const s = v.trim();
  if (!s) return NaN;
  let m = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(s);
  if (m) return Number(m[1]);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return Date.parse(s.replace(" ", "T"));
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(AM|PM)?$/i.exec(s);
  if (m) return wall(+m[1], +m[2], +m[3], hour12(+(m[4] || 0), m[7]), +(m[5] || 0), +(m[6] || 0));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(AM|PM)?$/i.exec(s);
  if (m) {
    let a = +m[1], b = +m[2];
    let d = dayFirst ? a : b, mo = dayFirst ? b : a;
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return wall(+m[3], mo, d, hour12(+(m[4] || 0), m[7]), +(m[5] || 0), +(m[6] || 0));
  }
  m = /^(\d{1,2})[-/ ]([A-Za-z]{3,4})[-/ ](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(AM|PM)?$/i.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return wall(+m[3], MONTHS[m[2].toLowerCase()], +m[1], hour12(+(m[4] || 0), m[7]), +(m[5] || 0), +(m[6] || 0));
  return NaN;
}
function hour12(h, ap) {
  if (!ap) return h;
  const pm = /pm/i.test(ap);
  return pm ? (h % 12) + 12 : h % 12;
}

function parseMoney(v) {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v !== "string") return NaN;
  const s = v.replace(/rs\.?|pkr|[,\s]/gi, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

// Do the day/month of the sample dates look day-first? (a "25/06/2026" proves it; "06/25/2026" disproves it)
function detectDayFirst(values) {
  let dayFirst = null;
  for (const v of values) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}/.exec(String(v || "").trim());
    if (!m) continue;
    if (+m[1] > 12) return true;
    if (+m[2] > 12) dayFirst = false;
  }
  return dayFirst === null ? true : dayFirst;
}

// ---- column names -------------------------------------------------------------------------------
const tokens = (name) => String(name).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const flat = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
const has = (f, words) => words.some((w) => f.includes(w));

function scoreId(name) {
  const f = flat(name), t = tokens(name);
  if (has(f, ["customer", "cust", "product", "item", "supplier", "party", "vendor", "employee", "user", "category", "stock", "barcode", "branch", "store", "terminal", "counter", "shift", "table", "account"])) return -20;
  if (/(invoice|inv|bill|receipt|voucher|slip|docket)/.test(f) && /(no|num|number|id|code|ref|serial)$/.test(f)) return 10;
  if (/^(invoice|inv|bill|receipt|voucher|sale|sales|order|trans|transaction|txn|doc)$/.test(f)) return 9;
  if (/(invoice|bill|receipt|voucher)/.test(f)) return 8;
  if (/(sale|sales|order|trans|transaction|txn|doc|ticket)/.test(f) && /(no|num|number|id|code)$/.test(f)) return 7;
  if (t.length === 1 && ["id", "no", "num", "number", "sn", "srno"].includes(t[0])) return 2;
  if (/(^|[^a-z])(id|no|num)$/.test(String(name).toLowerCase())) return 1;
  return 0;
}
function scoreTotal(name) {
  const f = flat(name);
  if (has(f, ["sub", "tax", "gst", "vat", "disc", "paid", "receiv", "tender", "balance", "due", "change", "qty", "quantit", "price", "cost", "unit", "rate", "profit", "margin", "cash", "card", "return", "refund", "percent", "pct", "count", "weight"])) return -20;
  if (/(grandtotal|nettotal|netamount|netpay|payable|finaltotal|finalamount|billtotal|invoicetotal|billamount|invoiceamount|totalamount|totalbill|saletotal|totalsale)/.test(f)) return 10;
  if (/^(total|totals)$/.test(f)) return 9;
  if (/total/.test(f)) return 8;
  if (/^(amount|amt|net|value)$/.test(f) || /(amount|amt)$/.test(f)) return 6;
  if (/(gross|sale|sales|bill|invoice)/.test(f)) return 3;
  return 0;
}
function scoreDate(name) {
  const f = flat(name);
  if (has(f, ["due", "expir", "birth", "deliver", "modif", "updat", "edit", "print", "dob", "valid"])) return -20;
  if (/(billdate|invdate|invoicedate|saledate|transdate|orderdate|salesdate|datetime|billtime)/.test(f)) return 10;
  if (/date/.test(f)) return 8;
  if (/(timestamp|created|createdon|createdat|entered|entrydate)/.test(f)) return 6;
  if (/^(time|dt|datum|tarikh|on|at)$/.test(f)) return 4;
  return 0;
}
function scoreStatus(name) {
  const f = flat(name);
  if (/(isvoid|void|cancel|isdeleted|deleted|isdel|cancelled|canceled)/.test(f)) return 9;
  if (/^(status|state|billstatus|invoicestatus|salestatus|trantype|type)$/.test(f)) return 5;
  return 0;
}
function scoreCashier(name) {
  const f = flat(name);
  if (/(cashier|operator|salesman|salesperson|soldby|createdby|enteredby|clerk|staff|emp|username|userid|user)/.test(f)) return has(f, ["customer", "cust"]) ? 0 : 7;
  return 0;
}
function scoreDiscount(name) {
  const f = flat(name);
  if (has(f, ["percent", "pct", "perc", "rate"])) return 0;
  return /(discount|disc)/.test(f) ? 7 : 0;
}

const VOID_WORDS = /^(void|voided|cancel|cancelled|canceled|deleted|delete|removed|refund|refunded|returned|return|rejected|true|yes|y|t)$/i;
const isVoidValue = (v, mode) => {
  if (v === null || v === undefined || v === "") return false;
  if (mode === "flag") return v === 1 || v === true || v === "1" || VOID_WORDS.test(String(v).trim());
  return VOID_WORDS.test(String(v).trim());
};

const share = (values, ok) => (values.length ? values.filter(ok).length / values.length : 0);
const colValues = (rows, col) => rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== "");

function pick(table, scorer, validator) {
  let best = null;
  for (const c of table.columns) {
    const sc = scorer(c.name);
    if (sc <= 0) continue;
    const vals = colValues(table.sample, c.name);
    if (validator && !validator(vals, c)) continue;
    if (!best || sc > best.score) best = { name: c.name, score: sc };
  }
  return best;
}

const TABLE_GOOD = /(sale|sales|invoice|inv|bill|order|receipt|trans|txn|pos|master|header|hdr|voucher)/;
const TABLE_BAD = /(detail|item|line|product|stock|purchase|customer|supplier|vendor|temp|tmp|log|audit|history|backup|archive|return|expense|payment|ledger)/;

function analyseTable(t) {
  const sample = t.sample || [];
  if (!sample.length) return null;
  const dayFirst = detectDayFirst([].concat(...t.columns.map((c) => colValues(sample, c.name).slice(0, 30))));
  const id = pick(t, scoreId, (vals) => vals.length >= 1 && new Set(vals.map(String)).size >= Math.min(vals.length, 3));
  const total = pick(t, scoreTotal, (vals) => vals.length >= 1 && share(vals, (v) => Number.isFinite(parseMoney(v))) >= 0.8);
  const date = pick(t, scoreDate, (vals) => vals.length >= 1 && share(vals, (v) => Number.isFinite(parseDate(v, { dayFirst }))) >= 0.8);
  if (!total || !date) return null;
  const name = t.name.toLowerCase().replace(/[^a-z]/g, "");
  let score = total.score + date.score + (id ? id.score : 0) + (TABLE_GOOD.test(name) ? 5 : 0) - (TABLE_BAD.test(name) ? 12 : 0);
  score += Math.min(3, Math.log10(Math.max(t.rowCount || 1, 1)));
  const status = pick(t, scoreStatus);
  const used = new Set([id && id.name, total.name, date.name]);
  const cashier = pick(t, (n) => (used.has(n) ? 0 : scoreCashier(n)));
  const discount = pick(t, (n) => (used.has(n) ? 0 : scoreDiscount(n)), (vals) => share(vals, (v) => Number.isFinite(parseMoney(v))) >= 0.8);
  const cols = { total: total.name, date: date.name };
  if (id) cols.id = id.name;
  if (status) { cols.status = status.name; cols.statusMode = status.score >= 9 ? "flag" : "text"; }
  if (cashier) cols.cashier = cashier.name;
  if (discount) cols.discount = discount.name;
  return { table: t.name, cols, dayFirst, score, mode: id ? "bills" : "totals" };
}

// Best guess for the whole database. confident=false -> the setup asks the person to confirm or pick.
function autoMap(tables) {
  const found = tables.map(analyseTable).filter(Boolean).sort((a, b) => b.score - a.score);
  if (!found.length) return { ok: false, reason: "No table with a total and a date column was found", candidates: [] };
  const best = found[0], second = found[1];
  const confident = best.mode === "bills" && best.score >= 16 && (!second || best.score - second.score >= 3);
  return { ok: true, confident, ...best, candidates: found.slice(0, 5).map((f) => ({ table: f.table, score: f.score, mode: f.mode })) };
}

function describe(m) {
  const c = m.cols;
  const bits = [m.mode === "bills" ? `invoice = ${c.id}` : "invoice = (none found: totals only)", `total = ${c.total}`, `date = ${c.date}`];
  if (c.status) bits.push(`cancelled = ${c.status}`);
  if (c.cashier) bits.push(`cashier = ${c.cashier}`);
  if (c.discount) bits.push(`discount = ${c.discount}`);
  return `table "${m.table}": ` + bits.join(", ");
}

// One database row -> the standard bill (or null when unreadable).
function rowToBill(row, m) {
  const c = m.cols;
  const ts = parseDate(row[c.date], { dayFirst: m.dayFirst });
  const total = parseMoney(row[c.total]);
  const id = c.id ? String(row[c.id] == null ? "" : row[c.id]).trim() : "";
  if (!Number.isFinite(ts) || !Number.isFinite(total) || (c.id && !id)) return null;
  const d = c.discount ? parseMoney(row[c.discount]) : 0;
  return {
    id, ts, total,
    status: c.status && isVoidValue(row[c.status], c.statusMode) ? "void" : "ok",
    cashier: c.cashier ? String(row[c.cashier] == null ? "" : row[c.cashier]) : "",
    discount: Number.isFinite(d) ? d : 0,
  };
}

module.exports = { autoMap, describe, rowToBill, parseDate, parseMoney, detectDayFirst, isVoidValue, tokens };
