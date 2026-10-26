"use strict";
// Run ONCE on your own computer to make an email/password user a Super Admin.
//   1. Firebase console -> Authentication -> create the user (your email + password)
//   2. Download a service account key to your PC (keep it private, never deploy it)
//   3. cd firebase/functions
//      GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/setAdmin.js you@example.com
const admin = require("firebase-admin");

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/setAdmin.js <email>");
  process.exit(1);
}

admin.initializeApp({ projectId: "hisaablive-final" });
admin.auth().getUserByEmail(email)
  .then((u) => admin.auth().setCustomUserClaims(u.uid, { admin: true }).then(() => u))
  .then((u) => { console.log("Admin claim set for", u.email, "- sign out and in again to refresh it."); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); });
