"use strict";
// SQLite POS databases (.db / .sqlite / .sqlite3). Opened READ-ONLY and only for the moment of reading,
// so the agent can never change the POS data and never holds a lock on it.
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';

function open(file) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try { db.exec("PRAGMA busy_timeout = 3000"); } catch (e) { /* older versions */ }
  return db;
}

function create({ path: file }) {
  const withDb = (fn) => { const db = open(file); try { return fn(db); } finally { db.close(); } };
  return {
    kind: "sqlite",
    pollMs: 10000,
    async listTables() {
      return withDb((db) => {
        const names = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
        return names.map((name) => {
          const columns = db.prepare(`PRAGMA table_info(${qi(name)})`).all().map((c) => ({ name: c.name, type: c.type }));
          let rowCount = 0, sample = [];
          try { rowCount = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${qi(name)}`).get().n); } catch (e) { /* view */ }
          try { sample = db.prepare(`SELECT * FROM ${qi(name)} ORDER BY rowid DESC LIMIT 30`).all(); }
          catch (e) { try { sample = db.prepare(`SELECT * FROM ${qi(name)} LIMIT 30`).all(); } catch (e2) { /* unreadable */ } }
          return { name, columns, rowCount, sample };
        });
      });
    },
    async readRows(table, cols, opts = {}) {
      // Only when the dates are stored as ISO text ("2026-10-20 ...") can the database skip old rows itself.
      const where = opts.dateIso && opts.since && opts.dateCol ? ` WHERE ${qi(opts.dateCol)} >= '${opts.since}'` : "";
      return withDb((db) => db.prepare(`SELECT ${cols.map(qi).join(",")} FROM ${qi(table)}${where}`).all());
    },
    async fingerprint() { return null; },
  };
}
module.exports = { create };
