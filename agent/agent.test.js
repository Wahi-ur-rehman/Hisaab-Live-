"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const installer = require("./installer");
const lock = require("./lock");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hl-agent-"));

test("install: protected folder, license moved out of the user folder, boot task from the protected folder", () => {
  const src = tmp(), dir = path.join(tmp(), "HisaabLive");
  const exe = path.join(src, "HisaabLiveAgent.exe");
  fs.writeFileSync(exe, "EXE-BYTES");
  fs.writeFileSync(path.join(src, "config.json"), '{"shopId":"old","license_key":"OLD"}');
  const calls = [];
  const order = [];
  const exec = (cmd, args) => { calls.push([cmd, ...args]); order.push(cmd + " " + args[0]); };
  // the real fs, but note when files appear so we can check the ACL step came first
  const spyFs = Object.assign({}, fs, {
    copyFileSync: (...a) => { order.push("copy"); return fs.copyFileSync(...a); },
    writeFileSync: (...a) => { order.push("write " + path.basename(a[0])); return fs.writeFileSync(...a); },
  });
  const res = installer.install({ fs: spyFs, exec, pathMod: path, execPath: exe, srcDir: src, dir, cfg: { shopId: "g10", license_key: "HL-G10-NEW" }, log: () => {} });

  assert.strictEqual(fs.readFileSync(res.exeDest, "utf8"), "EXE-BYTES");
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(res.cfgDest, "utf8")), { shopId: "g10", license_key: "HL-G10-NEW" });
  assert.ok(!fs.existsSync(path.join(src, "config.json")), "old config with the license must be deleted from the user folder");

  const icacls = calls.find((c) => c[0] === "icacls");
  assert.ok(icacls, "icacls must run");
  assert.strictEqual(icacls[1], dir);
  assert.ok(icacls.includes("/inheritance:r"), "inherited permissions must be removed");
  assert.ok(icacls.includes("*S-1-5-18:(OI)(CI)F") && icacls.includes("*S-1-5-32-544:(OI)(CI)F"), "SYSTEM + Administrators only");
  assert.ok(!icacls.slice(2).some((a) => /Users|Everyone|S-1-1-0|S-1-5-32-545|Authenticated/i.test(a)), "no access for ordinary users");
  assert.ok(order.indexOf("icacls " + dir) < order.indexOf("copy"), "folder is locked BEFORE the EXE is copied in");
  assert.ok(order.indexOf("icacls " + dir) < order.indexOf("write config.json"), "folder is locked BEFORE the license is written");

  const create = calls.find((c) => c[0] === "schtasks" && c[1] === "/Create");
  const tr = create[create.indexOf("/TR") + 1];
  assert.strictEqual(tr, `"${res.exeDest}"`, "the boot task runs the EXE from the protected folder, quoted");
  assert.ok(!tr.includes(src), "never from the user's folder");
  assert.strictEqual(create[create.indexOf("/RU") + 1], "SYSTEM");
  assert.ok(calls.some((c) => c[0] === "schtasks" && c[1] === "/Run"));
});

test("install: re-running from the installed copy works and a failing /End (not running) is fine", () => {
  const dir = path.join(tmp(), "HisaabLive");
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, "HisaabLiveAgent.exe");
  fs.writeFileSync(exe, "X");
  const exec = (cmd, args) => { if (args[0] === "/End") throw new Error("not running"); };
  installer.install({ fs, exec, pathMod: path, execPath: exe, srcDir: dir, dir, cfg: { shopId: "a", license_key: "b" }, log: () => {} });
  assert.strictEqual(fs.readFileSync(exe, "utf8"), "X"); // not copied onto itself
  assert.ok(fs.existsSync(path.join(dir, "config.json"))); // and its own config was not deleted
});

test("install: if the admin rights are missing it stops (and nothing runs as SYSTEM)", () => {
  const src = tmp(), dir = path.join(tmp(), "H");
  const exe = path.join(src, "a.exe"); fs.writeFileSync(exe, "X");
  const calls = [];
  const exec = (cmd, args) => { calls.push(cmd + " " + args[0]); if (cmd === "icacls") throw new Error("Access is denied"); };
  assert.throws(() => installer.install({ fs, exec, pathMod: path, execPath: exe, srcDir: src, dir, cfg: { shopId: "a", license_key: "b" }, log: () => {} }), /denied/);
  assert.ok(!calls.some((c) => c.startsWith("schtasks /Create")));
  assert.ok(!fs.existsSync(path.join(dir, "config.json")), "no license written into an unprotected folder");
});

test("uninstall removes the task and the license", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "config.json"), "{}");
  const calls = [];
  installer.uninstall({ fs, exec: (c, a) => calls.push(a[0]), pathMod: path, dir, log: () => {} });
  assert.ok(calls.includes("/Delete"));
  assert.ok(!fs.existsSync(path.join(dir, "config.json")));
});

test("defaultInstallDir uses Program Files", () => {
  assert.strictEqual(installer.defaultInstallDir(path.win32, { ProgramW6432: "C:\\Program Files" }), "C:\\Program Files\\HisaabLive");
  assert.strictEqual(installer.defaultInstallDir(path.win32, {}), "C:\\Program Files\\HisaabLive");
});

test("lock: only one agent; stale and dead-owner locks are taken over", () => {
  const p = path.join(tmp(), "agent.lock");
  assert.ok(lock.acquire(fs, p, 111, () => true));
  assert.ok(!lock.acquire(fs, p, 222, () => true), "a live agent holds it");
  assert.ok(lock.acquire(fs, p, 111, () => true), "same process may re-acquire");
  assert.ok(lock.acquire(fs, p, 222, () => false), "owner process is gone -> take over");
  assert.strictEqual(fs.readFileSync(p, "utf8"), "222");
  const old = new Date(Date.now() - 10 * 60000);
  fs.utimesSync(p, old, old);
  assert.ok(lock.acquire(fs, p, 333, () => true), "lock not touched for minutes -> stale -> take over");
  lock.touch(fs, p);
  assert.ok(!lock.acquire(fs, p, 444, () => true), "a touched lock is fresh again");
  lock.release(fs, p, 444);
  assert.ok(fs.existsSync(p), "cannot release someone else's lock");
  lock.release(fs, p, 333);
  assert.ok(!fs.existsSync(p));
});

test("lock: a program that grabs a TCP port can no longer stop the agent (no port is used)", () => {
  assert.ok(!/\.listen\(|net\.createServer/.test(fs.readFileSync(path.join(__dirname, "agent.js"), "utf8")));
});
