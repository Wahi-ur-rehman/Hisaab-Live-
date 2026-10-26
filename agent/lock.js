"use strict";
// One agent per PC, using a lock file next to the EXE (instead of a TCP port, which any program
// on the PC could occupy to stop the agent from ever starting). The file holds the owner's PID
// and is touched every few seconds; a lock that is old, or whose process is gone, is taken over.
const STALE_MS = 120000;

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

function acquire(fs, lockPath, pid, alive = isAlive, now = Date.now()) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx"); // fails if it already exists, atomically
      fs.writeSync(fd, String(pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    let owner, mtime;
    try {
      owner = parseInt(fs.readFileSync(lockPath, "utf8"), 10);
      mtime = fs.statSync(lockPath).mtimeMs;
    } catch (e) { continue; } // vanished meanwhile: try to create it again
    if (owner === pid) return true;
    if (now - mtime < STALE_MS && alive(owner)) return false; // a live agent holds it
    try { fs.unlinkSync(lockPath); } catch (e) { /* someone else took it over first */ }
  }
  return false;
}

function touch(fs, lockPath, when = new Date()) {
  try { fs.utimesSync(lockPath, when, when); } catch (e) { /* lock vanished: nothing to refresh */ }
}

function release(fs, lockPath, pid) {
  try {
    if (parseInt(fs.readFileSync(lockPath, "utf8"), 10) === pid) fs.unlinkSync(lockPath);
  } catch (e) { /* already gone */ }
}

module.exports = { acquire, touch, release, isAlive, STALE_MS };
