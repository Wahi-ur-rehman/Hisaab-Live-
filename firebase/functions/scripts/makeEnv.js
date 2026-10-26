"use strict";
// Creates firebase/functions/.env with a fresh random PIN secret ("pepper"). Run once, on your PC:
//   cd firebase/functions && node scripts/makeEnv.js
// Refuses to overwrite an existing .env: changing the pepper later would make every shop's PIN
// stop working (you would have to Reset PIN for every shop). Back this file up somewhere private.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const target = path.join(process.argv[2] || path.join(__dirname, ".."), ".env");
if (fs.existsSync(target)) {
  console.error(target + " already exists. Not touching it.");
  process.exit(1);
}
fs.writeFileSync(target, `PIN_PEPPER=${crypto.randomBytes(32).toString("hex")}\nENFORCE_APPCHECK=false\n`, { mode: 0o600 });
console.log("Created " + target + ". Keep a private backup of it; never commit it.");
