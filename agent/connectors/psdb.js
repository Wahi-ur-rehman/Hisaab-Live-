"use strict";
// SQL Server and Microsoft Access, read through Windows PowerShell (built into every Windows PC), so the
// EXE needs no database drivers of its own. Read-only SELECTs only.
//
// NOT TESTED against real databases (written on a Linux machine). The script text and the parsing of its
// output are unit-tested; the first run on a real shop PC is the real test.
const { execFile } = require("child_process");

const b = (s) => "[" + String(s).replace(/\]/g, "]]") + "]"; // quote an identifier for SQL Server / Access
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'"; // PowerShell single-quoted string

const PS_COMMON = `
$ErrorActionPreference = 'Stop'
function Conv($v) { if ($v -is [DBNull]) { return $null } if ($v -is [datetime]) { return $v.ToString('yyyy-MM-dd HH:mm:ss') } if ($v -is [byte[]]) { return $null } return $v }
function Run($conn, $sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 30
  $rd = $cmd.ExecuteReader(); $out = New-Object System.Collections.ArrayList
  while ($rd.Read()) { $o = [ordered]@{}; for ($i = 0; $i -lt $rd.FieldCount; $i++) { $o[$rd.GetName($i)] = Conv $rd.GetValue($i) }; [void]$out.Add($o) }
  $rd.Close(); return ,$out
}
`;

function sqlServerScript(conn, body) {
  return PS_COMMON + `
$c = New-Object System.Data.SqlClient.SqlConnection(${psq(conn)}); $c.Open()
try { ${body} } finally { $c.Close() }`;
}
function accessScript(file, body) {
  return PS_COMMON + `
$c = $null
foreach ($p in 'Microsoft.ACE.OLEDB.16.0','Microsoft.ACE.OLEDB.12.0','Microsoft.Jet.OLEDB.4.0') {
  try { $c = New-Object System.Data.OleDb.OleDbConnection(("Provider=" + $p + ";Data Source=" + ${psq(file)} + ";Mode=Read")); $c.Open(); break } catch { $c = $null }
}
if ($c -eq $null) { throw 'No Access driver found. Install the free "Microsoft Access Database Engine" (same bitness as this program).' }
try { ${body} } finally { $c.Close() }`;
}

const out = (expr) => `$r = ${expr}; ConvertTo-Json -InputObject @($r) -Depth 4 -Compress`;

function psRunner(file) {
  // 64-bit PowerShell first; Access with only the 32-bit driver is retried with the 32-bit PowerShell.
  return (script) => new Promise((resolve, reject) => {
    const enc = Buffer.from(script, "utf16le").toString("base64");
    const argv = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc];
    const attempt = (exe, fallback) => execFile(exe, argv, { maxBuffer: 256 * 1024 * 1024, timeout: 120000, windowsHide: true }, (err, so, se) => {
      if (err && fallback) return attempt(fallback);
      if (err) return reject(new Error(String(se || err.message).trim().split("\n")[0]));
      resolve(so);
    });
    attempt("powershell.exe", process.env.WINDIR ? process.env.WINDIR + "\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe" : null);
  });
}

const parse = (text) => {
  const t = String(text).trim();
  if (!t) return [];
  const j = JSON.parse(t);
  return Array.isArray(j) ? j : [j];
};

function create(kind, conf, run) {
  const sqlServer = kind === "mssql";
  const wrap = (body) => (sqlServer ? sqlServerScript(conf.conn, body) : accessScript(conf.path, body));
  const exec = run || psRunner();
  const dateType = /^(date|datetime|datetime2|smalldatetime|datetimeoffset)$/i;
  return {
    kind,
    pollMs: 30000,
    async listTables() {
      const listSql = sqlServer
        ? "SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS d FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION"
        : "";
      let cols;
      if (sqlServer) {
        cols = parse(await exec(wrap(out(`Run $c ${psq(listSql)}`))));
      } else {
        // Access: the table list comes from the schema; the column list from the same call
        cols = parse(await exec(wrap(`
$t = $c.GetSchema('Columns'); $r = @(); foreach ($row in $t) { if ($row['TABLE_NAME'] -notlike 'MSys*') { $r += [ordered]@{ s = ''; t = $row['TABLE_NAME']; c = $row['COLUMN_NAME']; d = [string]$row['DATA_TYPE'] } } }
ConvertTo-Json -InputObject @($r) -Depth 3 -Compress`)));
      }
      const tables = new Map();
      for (const r of cols) {
        const name = r.s ? r.s + "." + r.t : r.t;
        if (!tables.has(name)) tables.set(name, { name, columns: [], sample: [], rowCount: 0 });
        tables.get(name).columns.push({ name: r.c, type: String(r.d) });
      }
      for (const t of [...tables.values()].slice(0, 80)) {
        try {
          const sel = sqlServer ? `SELECT TOP 30 * FROM ${qname(t.name)}` : `SELECT TOP 30 * FROM ${b(t.name)}`;
          t.sample = parse(await exec(wrap(out(`Run $c ${psq(sel)}`))));
          const cnt = sqlServer ? `SELECT COUNT(*) AS n FROM ${qname(t.name)}` : `SELECT COUNT(*) AS n FROM ${b(t.name)}`;
          t.rowCount = Number((parse(await exec(wrap(out(`Run $c ${psq(cnt)}`))))[0] || {}).n) || 0;
        } catch (e) { /* unreadable table: skipped */ }
      }
      return [...tables.values()];
    },
    async readRows(table, cols, opts = {}) {
      const { since: sinceIso, dateCol, dateType: dateType_ } = opts;
      const sel = cols.map(b).join(",");
      let where = "";
      if (sinceIso && dateCol && dateType.test(String(dateType_ || ""))) {
        where = sqlServer ? ` WHERE ${b(dateCol)} >= '${sinceIso}'` : ` WHERE ${b(dateCol)} >= #${sinceIso.slice(5, 7)}/${sinceIso.slice(8, 10)}/${sinceIso.slice(0, 4)}#`;
      }
      const sql = `SELECT ${sel} FROM ${sqlServer ? qname(table) : b(table)}${where}`;
      return parse(await exec(wrap(out(`Run $c ${psq(sql)}`))));
    },
    async fingerprint() { return null; },
  };
}
// "dbo.Sales" -> [dbo].[Sales]
const qname = (n) => String(n).split(".").map(b).join(".");

module.exports = { create, sqlServerScript, accessScript, b, psq, parse, qname };
