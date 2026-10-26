"use strict";
// HisaabLive shop agent. Holds NO Firebase credentials: it only knows shopId + license key
// and talks to Cloud Functions over HTTPS. It never locks, even if the shop is expired.
//
//   HisaabLiveAgent.exe --install-startup    (run as Administrator) ask for the setup code, install into
//                                            C:\Program Files\HisaabLive and start at every boot
//   HisaabLiveAgent.exe --setup              choose / change the POS database (columns are found automatically)
//   HisaabLiveAgent.exe --uninstall-startup  (run as Administrator) remove the automatic start + license
//   HisaabLiveAgent.exe                      run in this window (asks for the setup code on first run)
//   add --code K7M2-9QXP to skip the prompt
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");
const installer = require("./installer");
const lock = require("./lock");
const { createSync } = require("./sync");
const { make } = require("./connectors");
const { chooseSource } = require("./setup");

// Inside a pkg-built EXE, files live next to the EXE (not in the virtual filesystem).
const BASE = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(BASE, "config.json");
const LOG_PATH = path.join(BASE, "agent.log");
const LOCK_PATH = path.join(BASE, "agent.lock");
const BAD_LICENSE_RETRY_MS = 5 * 60000;

// The server address can be overridden for testing, but only with an https:// address, so a license
// key can never be sent over plain HTTP.
const FUNCTIONS_URL = process.env.HL_FUNCTIONS_URL || "https://us-central1-hissab-live.cloudfunctions.net";
const isLocalTest = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(FUNCTIONS_URL) && process.env.HL_ALLOW_LOCAL_HTTP === "1";
if (!/^https:\/\//.test(FUNCTIONS_URL) && !isLocalTest) {
  console.error("HL_FUNCTIONS_URL must start with https://. Refusing to start.");
  process.exit(1);
}

const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

// Console + agent.log (kept under ~1 MB). The log matters because at boot there is no console window.
function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.join(" ")}`;
  console.log(line);
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 1e6) {
      fs.writeFileSync(LOG_PATH, fs.readFileSync(LOG_PATH).subarray(-200000));
    }
    fs.appendFileSync(LOG_PATH, line + "\n");
  } catch (e) { /* logging must never crash the agent */ }
}

async function callFn(name, data) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error((body.error && body.error.message) || "HTTP " + res.status);
  return body.result;
}

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return c && c.shopId && c.license_key ? c : null;
  } catch (e) {
    return null;
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

// Exchange the one-time setup code for shopId + a new license. With save=false (installing) nothing
// is written here: the installer puts the license straight into the protected folder.
async function activate({ save }) {
  let code = argValue("--code");
  if (!code && !process.stdin.isTTY) {
    log("No config.json and no console to ask for a setup code. Run the EXE once by hand (or with --code).");
    process.exit(1);
  }
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (!code) code = await ask("Setup code (e.g. K7M2-9QXP): ");
    try {
      const r = await callFn("agentActivate", { code });
      const cfg = { shopId: r.shopId, license_key: r.license_key };
      if (save) fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg) + "\n");
      log("Activated for shop:", r.shopName);
      return cfg;
    } catch (e) {
      log("Activation failed:", e.message);
      code = ""; // ask again (or give up after 5 tries)
      if (args.includes("--code") || !process.stdin.isTTY) break;
    }
  }
  process.exit(1);
}

function requireWindowsExe() {
  if (process.platform !== "win32" || !process.pkg) {
    console.error("Automatic start works only from the built HisaabLiveAgent.exe on Windows.");
    process.exit(1);
  }
}

const exec = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { stdio: "pipe" });
const installDir = () => installer.defaultInstallDir(path.win32, process.env);

function failAdmin(e) {
  console.error("Could not finish. Right-click Command Prompt, choose 'Run as administrator', and try again.");
  console.error(String((e.stderr || e.message)).trim());
  process.exit(1);
}

// Asks where the POS data lives and finds the columns by itself (see setup.js).
async function pickSource() {
  if (!process.stdin.isTTY) { log("Cannot ask about the POS database: no console. Run the EXE by hand with --setup."); process.exit(1); }
  try {
    return await chooseSource({ ask, make, log });
  } catch (e) {
    console.error("Could not read that database: " + e.message);
    process.exit(1);
  }
}

function run(cfg) {
  log("HisaabLive Agent started for", cfg.shopId);
  if (!cfg.source) {
    log("No POS database is set up yet. Run HisaabLiveAgent.exe --setup (as Administrator) to choose it.");
    return setTimeout(() => process.exit(0), 100);
  }
  const sync = createSync({ connector: make(cfg.source.type, cfg.source), source: cfg.source, callFn, cfg, log });

  async function tick() {
    lock.touch(fs, LOCK_PATH);
    let delay = 10000;
    try {
      delay = await sync.tick();
    } catch (e) {
      log("agent error:", e.message); // keep running, retry on the next tick
      if (/invalid license/i.test(e.message)) {
        log("This license is no longer valid. Ask support for a new setup code, then run HisaabLiveAgent.exe --install-startup again.");
        delay = BAD_LICENSE_RETRY_MS;
      }
    }
    setTimeout(tick, delay); // sequential, so slow requests can never overlap
  }
  tick();
}

async function main() {
  if (args.includes("--uninstall-startup")) {
    requireWindowsExe();
    try { installer.uninstall({ fs, exec, pathMod: path.win32, dir: installDir(), log }); } catch (e) { failAdmin(e); }
    return;
  }

  const installing = args.includes("--install-startup");
  if (installing) requireWindowsExe();
  const cfg = loadConfig() || (await activate({ save: !installing }));

  if (args.includes("--setup")) { // change the POS database of an installed agent (run from its folder, as Administrator)
    cfg.source = await pickSource();
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg) + "\n"); } catch (e) { failAdmin(e); }
    log("Saved. Restart the PC (or the HisaabLive task) to apply.");
    return;
  }

  if (installing) {
    if (!cfg.source) cfg.source = await pickSource();
    try {
      installer.install({ fs, exec, pathMod: path.win32, execPath: process.execPath, srcDir: BASE, dir: installDir(), cfg, log });
    } catch (e) { failAdmin(e); }
    return;
  }

  if (!cfg.source && process.stdin.isTTY) { // plain run by hand with no POS chosen yet
    cfg.source = await pickSource();
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg) + "\n"); } catch (e) { log("Could not save the choice:", e.message); }
  }
  if (!lock.acquire(fs, LOCK_PATH, process.pid)) { log("Agent is already running on this PC. Exiting."); process.exit(0); }
  process.on("exit", () => lock.release(fs, LOCK_PATH, process.pid));
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
  run(cfg);
}

process.on("unhandledRejection", (e) => log("unhandled:", e && e.message ? e.message : e));
main().catch((e) => { log("fatal:", e.message); process.exit(1); });
