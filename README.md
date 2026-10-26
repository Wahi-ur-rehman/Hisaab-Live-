# HisaabLive

## How it works
- **Owner login:** the app calls the `shopLogin` Cloud Function. The server checks the 6-digit PIN and returns a Firebase Auth token carrying `shopId`. Login attempts are counted atomically *before* the PIN is checked: 5 per shop per network per 15 minutes, 30 per shop per hour overall, 30 per network per 15 minutes across all shops. Owners can sign out all devices from the app; a PIN reset signs out every device too.
- **Firestore rules:** owners can only read their own shop, and only while the subscription is active (the lock screen still reads the shop profile). Browsers can never write anything: expenses, Khata, month totals and sales are all written by Cloud Functions.
- **Secrets:** the PIN is hashed with scrypt *plus a server-side secret* (`PIN_PEPPER`, in `firebase/functions/.env`, not in the database). The agent license is stored only as a hash. `shops_private` is unreadable from any browser, including the admin panel.
- **Super Admin:** email/password login plus the `admin` claim. Every change goes through `createShop`, `markPaid`, `resetPin`, `createSetupCode`, `revokeLicense`.
- **Agent:** no Firebase credentials on the shop PC. It sends `shopId` + license to `agentPush`. The date is decided by the server in Pakistan time.

## One-time setup
1. Put your web API key in place of `YOUR_KEY` in `owner-app/src/App.jsx` and `super-admin/src/Admin.jsx`.
2. Firebase console -> Authentication: enable **Email/Password**, create your admin user (long, unique password), then under *Settings -> User actions* **turn off "Enable create (sign-up)"** so strangers can't register accounts. If your plan offers it, turn on 2-step verification for the admin.
3. IAM: give `hisaablive-final@appspot.gserviceaccount.com` the role **Service Account Token Creator** (without it `shopLogin` fails with `signBlob` errors).
4. Create the PIN secret, once, on your PC: `cd firebase/functions && npm install && node scripts/makeEnv.js`. **Keep a private backup of the `.env` it creates.** If you lose it or change it, every shop's PIN stops working and each needs a Reset PIN.
5. Make yourself admin (never deploy the key): `GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/setAdmin.js you@example.com`
6. Create two Hosting sites, put their IDs in `.firebaserc`, then run `firebase deploy --only firestore:rules,functions,hosting`.
7. Delete any old `serviceAccountKey.json` that was ever given to a shop, and rotate that key in the Google Cloud console.
8. **Before real shops:** run `firebase emulators:start` and test `firestore.rules` once. The demo below does not cover the rules.

### Optional but recommended: App Check
It makes the owner and admin functions accept only calls from your real apps.
1. Firebase console -> App Check -> register both web apps with **reCAPTCHA v3**; paste the site key into `APPCHECK_SITE_KEY` in both apps and redeploy them.
2. Once both apps send tokens (check App Check metrics), set `ENFORCE_APPCHECK=true` in `firebase/functions/.env` and redeploy functions.
The agent functions stay open on purpose (a shop PC has no browser to attest from); they rely on the license.

## Agent EXE
Build once: `cd agent && npx @yao-pkg/pkg . --output HisaabLiveAgent.exe` (`pkg` itself is archived; the target is Node 22 because SQLite support is built into Node 22). There is no `readTodaySale()` to fill in any more: the agent reads the shop's POS itself (see "Tamper protection").

**Installing at a shop:**
1. In the admin panel press **Generate Setup Code** for the shop (valid 48 hours, works once).
2. Copy `HisaabLiveAgent.exe` to the shop PC (anywhere, e.g. a USB stick or Downloads).
3. Open Command Prompt **as Administrator** there and run `HisaabLiveAgent.exe --install-startup`. Type the setup code, then answer the two questions about the POS data: **what kind of database** and **where it is** (file path, or SQL Server name). The program finds the invoice / total / date columns by itself and shows what it found; press Enter to accept. (Change it later with `HisaabLiveAgent.exe --setup` from `C:\Program Files\HisaabLive`.)
   - The EXE gets a **new license** from the server (any older license stops working).
   - It copies itself and its config into `C:\Program Files\HisaabLive`, a folder only SYSTEM and Administrators can change, and starts at every boot from there (hidden). Running a boot task from an ordinary user folder would let any user on that PC swap the EXE and gain SYSTEM rights, which is why the install location matters.
   - The copy you ran can then be deleted.
4. Logs: `C:\Program Files\HisaabLive\agent.log` (admins only).
5. Remove: `HisaabLiveAgent.exe --uninstall-startup` (also deletes the license from the PC).

**If a shop's license may have leaked** (PC stolen, config copied): admin panel -> **Revoke License**. It stops working at once. Then Generate Setup Code and reinstall. There is no way to read a license back from the server (only its hash is stored).

## Behaviour notes
- PINs can't be viewed. Use **Reset PIN**.
- If a shop pays after it has lapsed, the new expiry is the first anchor date (e.g. the 13th) after today.
- Owners cannot edit or delete expenses or Khata entries (add an opposite entry to fix a mistake).
- Daily caps per shop: 300 expenses, 100 new Khata customers, 1000 Khata entries, 20 device registrations; the agent may send at most 150 updates per 10 minutes.
- Only one agent runs per PC (a lock file next to the EXE; a crashed agent's lock is taken over automatically).

## Tamper protection (insider fraud)
Goal: if a cashier deletes or edits sales in the POS to pocket money, the owner finds out.

**How it works.** The agent reads the POS (read-only) every 10-30 seconds, turns each row into a standard bill (number, time, total, cancelled?, cashier, discount) and sends a fingerprint of every day to the server. Whenever a day's fingerprint differs from the server's record, the agent sends that day's bills, and the server compares them with its **permanent ledger** of every bill (`shops/{id}/bills`; nobody can write to it from a browser, and each bill keeps its first version). The agent re-checks the last 35 days every 15 minutes and everything again whenever it restarts, so edits made while it was switched off are still caught.

**What the owner is told** (Alerts tab, red banner on the Hisaab screen, push notification at most once per 5 minutes):
- a bill **deleted**, a bill's total **lowered** (or raised), a bill **cancelled after it was recorded**, a bill otherwise **edited** (time, user, discount)
- bills added to a **past day** after it was recorded, bills made at **odd hours** (00:00-05:00), **big discounts** (30% or more), bills that arrived already cancelled
- **missing bill numbers** in a clean running sequence, **many bills vanishing at once** (database restored from an old backup or wiped), rows with a **garbage date or amount** (a way to hide a bill), and a **silent agent** during shop hours (10:00-20:00)
- the home screen shows "Rs X of today's sales was removed or lowered" and the alerts stay on record: the owner can only mark them "seen", never delete them.

**Setup per shop is automatic.** `setup.js` lists the tables, scores column names (invoice/bill/receipt..., total/amount/net..., date/time...; optional cancelled/void, cashier, discount), and checks the guess against real values (is the "total" column really numbers? are the "date" values really dates?). It prefers the sales-header table over the detail/customer tables. If it is not confident, it shows the tables and columns and the person picks by number. If the database has **no invoice-number column**, it falls back to **totals-only** mode: the server keeps the highest total and row count of the day and alerts when either goes down.

**Supported databases**
| Database | How | Tested here |
|---|---|---|
| SQLite (.db/.sqlite) | built-in `node:sqlite`, opened read-only | yes |
| CSV | built-in parser | yes |
| Excel .xlsx | built-in zip/XML reader, reads a copy of the file | yes (one sample file) |
| SQL Server | Windows PowerShell + .NET SqlClient, SELECT only | **no** (script text and parsing are unit-tested only) |
| Access (.mdb/.accdb) | Windows PowerShell + OleDb (needs the free Access Database Engine) | **no** |

Notes for real shops: the agent runs as SYSTEM, so a SQL Server **Windows login will usually not work**; create a read-only SQL login (`db_datareader`) and give that in setup (it is stored in the locked `config.json`). Excel: only what has been *saved* is visible, and it works well only with a unique Bill No column. Old `.xls` files must be saved as `.xlsx`.

**Honest limits: what this cannot catch**
- Sales never entered into the POS at all (a cashier takes the cash and rings nothing). Only physical controls help: printed receipts, cash counts, stock counts.
- An administrator on the shop PC who stops or deletes the agent. The owner still gets the "agent silent" alert (during shop hours), and everything is re-checked when the agent runs again, but a determined admin can also change the PC's clock or block the internet. Keep POS cashier accounts non-admin.
- A bill created and removed between two checks (10-30 s) is only seen as a numbering gap, and only if the numbers are a clean running sequence.
- Bills older than 35 days are not re-checked. Gaps can also come from legitimate reasons (several tills sharing a number range); alerts say "check", they are not proof.
- Not tested here: SQL Server and Access readers, `firestore.rules` for the new collections (`bills`, `bill_days`, `alerts`), the owner app's new screen in a browser.

## Monthly Sum, Khata, Push notifications
- **Monthly Sum:** `shops/{id}/monthly_summary/{YYYY-MM}`. Sale is recomputed from the daily records inside a transaction on every agent push. Expense is added up atomically as each expense is saved. The owner app shows it under "This Month".
- **Khata:** customer credit ledger ("Udhaar Diya" +, "Payment Mili" -). Balances change only in a server transaction. Positive = the customer owes the shop.
- **Push notifications:** the app shows a "Notifications on karo" button; allowed devices are saved through `saveFcmToken` (5 per shop). The nightly check sends the 3-day, 1-day and expired reminders and removes dead devices. On iPhones the app must first be added to the Home Screen.
  1. Firebase console -> Project settings -> Cloud Messaging -> Web Push certificates -> generate a key pair; put it in `VAPID_KEY` in `owner-app/src/App.jsx`.
  2. Fill `messagingSenderId` and `appId` in `owner-app/src/App.jsx` and `owner-app/public/firebase-messaging-sw.js`.
  3. The Firebase version in `firebase-messaging-sw.js` (10.12.2) should match the major version of the `firebase` npm package.

## Known limits (honest list)
- A determined attacker using many networks can still try 30 PINs per shop per hour, and during that time the real owner can't log in either (an already-logged-in phone is unaffected). That is the price of capping guessing; 6-digit PINs are weak by nature, so keep the secret `.env` safe and consider longer PINs later.
- An already-issued sign-in token can work for up to about an hour after "log out all devices" or a PIN reset (only new tokens are refused).
- Anyone with Administrator rights on a shop PC can read that shop's license from `C:\Program Files\HisaabLive\config.json`. Revoke License is the answer if that PC is no longer trusted.
- Not tested here: `firestore.rules` (emulator needed) and the Windows installer's real `icacls`/`schtasks` calls (unit-tested with stand-ins; try it once on a spare Windows PC).

## Tests and demo (no internet, no Firebase needed)
- `cd firebase/functions && node --test` and `cd agent && node --test`: unit tests (28 each; `billcore.js` must stay identical in both folders and a test checks it).
- `node demo/run.js` runs the REAL Cloud Functions code against an in-memory fake Firebase and plays the whole story, including attacks (parallel PIN guessing, spraying, spam, flooding) and a fake cashier tampering with a real SQLite POS file (section 12). It does NOT test `firestore.rules`.
