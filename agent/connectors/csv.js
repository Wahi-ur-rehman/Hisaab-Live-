"use strict";
// CSV files (an Excel sheet saved as CSV, or a POS that exports one). The file is read fresh each time.
const fs = require("fs");
const path = require("path");

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // The separator is the one that splits some early line into the most pieces (a title row above the
  // header must not decide it).
  const lines = text.split(/\r?\n/, 15);
  const widest = (c) => Math.max(...lines.map((l) => l.split(c).length));
  const sep = [",", ";", "\t"].map((c) => [c, widest(c)]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// array-of-arrays -> table with the header row at the top (shared with the Excel reader)
function toTable(name, rows) {
  let h = rows.findIndex((r) => r.filter((c) => c !== "" && c != null).length >= 2);
  if (h < 0) return { name, columns: [], sample: [], rowCount: 0, rows: [] };
  const head = rows[h].map((c, i) => String(c == null || c === "" ? "Column" + (i + 1) : c).trim());
  const out = rows.slice(h + 1).filter((r) => r.some((c) => c !== "" && c != null)).map((r) => {
    const o = {};
    head.forEach((k, i) => { o[k] = r[i] === undefined ? "" : r[i]; });
    return o;
  });
  return { name, columns: head.map((n) => ({ name: n })), rowCount: out.length, sample: out.slice(-30), rows: out };
}

function create({ path: file }) {
  const read = () => toTable(path.basename(file), parseCsv(fs.readFileSync(file, "utf8")));
  return {
    kind: "csv",
    pollMs: 15000,
    async listTables() { const t = read(); return [{ name: t.name, columns: t.columns, sample: t.sample, rowCount: t.rowCount }]; },
    async readRows() { return read().rows; },
    async fingerprint() { const s = fs.statSync(file); return s.size + ":" + s.mtimeMs; },
  };
}
module.exports = { create, parseCsv, toTable };
