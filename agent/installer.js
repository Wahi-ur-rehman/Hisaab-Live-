"use strict";
// Installs the agent so it starts at every boot, SAFELY.
//
// The boot task runs as SYSTEM. If it ran an EXE sitting in a folder a normal user can write to
// (Desktop, Downloads...), any user on that PC could swap the EXE and get SYSTEM rights at the
// next boot. So the installer copies the EXE and its config (which holds the license key) into
// a folder only SYSTEM and Administrators can touch, and runs it from there.
//
// All side effects go through the injected `fs`, `exec` and `pathMod`, so the logic is unit-tested
// on any OS (agent.test.js); on a real shop PC they are the real fs / schtasks / path.win32.
const EXE_NAME = "HisaabLiveAgent.exe";
const TASK_NAME = "HisaabLiveAgent";
// Well-known SIDs, so this works on any Windows language: SYSTEM and the Administrators group.
const SID_SYSTEM = "*S-1-5-18";
const SID_ADMINS = "*S-1-5-32-544";

// C:\Program Files\HisaabLive (64-bit Program Files even if this were a 32-bit process)
function defaultInstallDir(pathMod, env) {
  return pathMod.join(env.ProgramW6432 || env.ProgramFiles || "C:\\Program Files", "HisaabLive");
}

function install({ fs, exec, pathMod, execPath, srcDir, dir, cfg, log }) {
  const exeDest = pathMod.join(dir, EXE_NAME);
  const cfgDest = pathMod.join(dir, "config.json");

  fs.mkdirSync(dir, { recursive: true });
  // Lock the folder down BEFORE anything goes in it: no inherited access, admins and SYSTEM only.
  exec("icacls", [dir, "/inheritance:r", "/grant:r", `${SID_SYSTEM}:(OI)(CI)F`, `${SID_ADMINS}:(OI)(CI)F`]);

  try { exec("schtasks", ["/End", "/TN", TASK_NAME]); } catch (e) { /* not running: fine */ }
  if (pathMod.resolve(execPath) !== pathMod.resolve(exeDest)) fs.copyFileSync(execPath, exeDest);
  fs.writeFileSync(cfgDest, JSON.stringify({ shopId: cfg.shopId, license_key: cfg.license_key, source: cfg.source }) + "\n");

  // The license must not stay behind in the folder the user could read.
  const oldCfg = pathMod.join(srcDir, "config.json");
  if (pathMod.resolve(oldCfg) !== pathMod.resolve(cfgDest) && fs.existsSync(oldCfg)) fs.unlinkSync(oldCfg);

  exec("schtasks", ["/Create", "/TN", TASK_NAME, "/TR", `"${exeDest}"`, "/SC", "ONSTART", "/RU", "SYSTEM", "/F"]);
  exec("schtasks", ["/Run", "/TN", TASK_NAME]);
  log(`Installed in ${dir}. The agent now starts at every boot (hidden). You can close this window and delete this copy of the EXE.`);
  return { exeDest, cfgDest };
}

function uninstall({ fs, exec, pathMod, dir, log }) {
  try { exec("schtasks", ["/End", "/TN", TASK_NAME]); } catch (e) { /* not running */ }
  exec("schtasks", ["/Delete", "/TN", TASK_NAME, "/F"]);
  const cfgDest = pathMod.join(dir, "config.json");
  if (fs.existsSync(cfgDest)) fs.unlinkSync(cfgDest); // don't leave a license key behind
  log(`Automatic start removed and the license deleted. You can delete ${dir} yourself.`);
}

module.exports = { install, uninstall, defaultInstallDir, EXE_NAME, TASK_NAME, SID_SYSTEM, SID_ADMINS };
