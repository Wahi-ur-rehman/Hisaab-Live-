"use strict";
// Excel .xlsx files, with no extra libraries (an .xlsx is a zip of XML files). Excel locks a file that is
// open, so a COPY is read. Only what has been SAVED in Excel is visible (unsaved edits are not).
// Old .xls files are not supported: save as .xlsx.
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { toTable } = require("./csv");

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a valid .xlsx file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad zip");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lh = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(lh + 26), lelen = buf.readUInt16LE(lh + 28);
    const data = buf.subarray(lh + 30 + lnlen + lelen, lh + 30 + lnlen + lelen + csize);
    files[name] = () => (method === 0 ? data : zlib.inflateRawSync(data));
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");
const colIndex = (ref) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

function parseShared(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
}

function parseSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs);
      if (!ref) continue;
      const t = (/t="(\w+)"/.exec(attrs) || [])[1];
      const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
      let val = "";
      if (t === "s") val = shared[Number(v)] === undefined ? "" : shared[Number(v)];
      else if (t === "inlineStr") val = unesc([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else if (t === "str" || t === "e") val = v === undefined ? "" : unesc(v);
      else if (t === "b") val = v === "1" ? 1 : 0;
      else if (v !== undefined && v !== "") val = Number(v);
      row[colIndex(ref[1])] = val;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = "";
    rows.push(row);
  }
  return rows;
}

function readWorkbook(buf) {
  const z = unzip(buf);
  const get = (n) => (z[n] ? z[n]().toString("utf8") : "");
  const shared = parseShared(get("xl/sharedStrings.xml"));
  const rels = {};
  for (const m of get("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0]), target = /Target="([^"]+)"/.exec(m[0]);
    if (id && target) rels[id[1]] = target[1].replace(/^\/?(xl\/)?/, "xl/");
  }
  const out = [];
  for (const m of get("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(m[0]), rid = /r:id="([^"]+)"/.exec(m[0]);
    if (!name || !rid || !rels[rid[1]] || !z[rels[rid[1]]]) continue;
    out.push(toTable(unesc(name[1]), parseSheet(z[rels[rid[1]]]().toString("utf8"), shared)));
  }
  return out;
}

function create({ path: file }) {
  const load = () => {
    const tmp = path.join(os.tmpdir(), "hl-xlsx-" + process.pid + "-" + Date.now() + ".tmp");
    fs.copyFileSync(file, tmp);
    try { return readWorkbook(fs.readFileSync(tmp)); } finally { try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } }
  };
  return {
    kind: "xlsx",
    pollMs: 15000,
    async listTables() { return load().map((t) => ({ name: t.name, columns: t.columns, sample: t.sample, rowCount: t.rowCount })); },
    async readRows(table) { const t = load().find((x) => x.name === table); if (!t) throw new Error("Sheet not found: " + table); return t.rows; },
    async fingerprint() { const s = fs.statSync(file); return s.size + ":" + s.mtimeMs; },
  };
}
module.exports = { create, readWorkbook };
