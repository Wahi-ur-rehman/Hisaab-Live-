"use strict";
// Demo: the whole HisaabLive story, running the REAL Cloud Functions code against an in-memory fake.
//   node demo/run.js
process.env.PIN_PEPPER = "demo-only-pepper-0123456789abcdef"; // in real life: firebase/functions/.env
const assert = require("assert");
const { store, fcm, revoked } = require("./fakeFirebase");
const lib = require("../firebase/functions/lib");
const fns = require("../firebase/functions/index.js");

const ADMIN = { auth: { token: { admin: true } } };
const owner = (shopId, ip) => ({ auth: { token: { shopId } }, rawRequest: ip ? { ip } : undefined });
const from = (ip) => ({ rawRequest: { ip } });
const today = lib.todayPK();
const ym = lib.monthOf(today);
const addDays = (d, n) => { const { y, m, d: dd } = lib.parseYMD(d); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };

let passed = 0;
const title = (t) => console.log("\n=== " + t + " ===");
const ok = (msg, cond) => { assert.ok(cond, "FAILED: " + msg); passed++; console.log("  OK  " + msg); };
async function rejects(msg, p, code) {
  try { await p; } catch (e) { assert.strictEqual(e.code, code, `FAILED: ${msg} (got ${e.code}: ${e.message})`); passed++; console.log(`  OK  ${msg}  -> ${code}`); return e; }
  assert.fail("FAILED (no error thrown): " + msg);
}
const outcome = (p) => p.then(() => "LOGGED_IN", (e) => e.code);
const tally = (arr) => arr.reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {});
const doc = (p) => store.get(p);
const dropKeys = (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => store.delete(k));
const newShop = (code, phone, pin) => fns.createShop.run({ code, name: code + " Store", phone, pin, amount: 3000 }, ADMIN);
// admin makes a setup code, shop PC activates it -> returns the new license
const install = async (shopId, ip) => (await fns.agentActivate.run({ code: (await fns.createSetupCode.run({ shopId }, ADMIN)).code }, ip ? from(ip) : undefined)).license_key;

(async () => {
  console.log("Today (Pakistan time):", today);

  title("1. ADMIN CREATES SHOPS");
  await rejects("non-admin cannot create a shop", fns.createShop.run({}, owner("x")), "permission-denied");
  await rejects("bad PIN rejected", fns.createShop.run({ code: "G10", name: "Ali Mart", phone: "03001234567", pin: "123", amount: 3000 }, ADMIN), "invalid-argument");
  const created = await fns.createShop.run({ code: "G10", name: "Ali Mart", phone: "0300-1234567", pin: "123456", amount: 3000 }, ADMIN);
  ok("shop g10 created, no license exists yet", created.shopId === "g10" && doc("shops/g10").license_active === false && doc("shops_private/g10").license_hash === null);
  ok("PIN is stored hashed, not plain", !JSON.stringify(doc("shops_private/g10")).includes("123456"));
  ok("PIN hash is useless without the server secret (pepper)", lib.verifyPin("123456", doc("shops_private/g10").pin_hash, process.env.PIN_PEPPER) && !lib.verifyPin("123456", doc("shops_private/g10").pin_hash, "some-other-secret-value"));
  ok("expiry is exactly one month after start", doc("shops/g10").current_expiry === lib.addMonthAnchored(today, lib.parseYMD(today).d));
  await rejects("same shop code again is refused", fns.createShop.run({ code: "g10", name: "x", phone: "03009999999", pin: "111111", amount: 1 }, ADMIN), "already-exists");
  await rejects("same phone on another shop is refused", fns.createShop.run({ code: "F7", name: "x", phone: "03001234567", pin: "111111", amount: 1 }, ADMIN), "already-exists");
  await newShop("F7", "03217654321", "654321");

  title("2. OWNER LOGIN (PIN CHECKED ON SERVER)");
  const login = await fns.shopLogin.run({ code: "g10", pin: "123456" });
  ok("right code + PIN gives a token with the shopId claim", JSON.parse(login.token.slice(6)).shopId === "g10");
  ok("login by phone number works too", JSON.parse((await fns.shopLogin.run({ code: "0300-1234567", pin: "123456" })).token.slice(6)).shopId === "g10");
  const e1 = await rejects("wrong PIN refused", fns.shopLogin.run({ code: "g10", pin: "000000" }), "unauthenticated");
  const e2 = await rejects("unknown shop gives the SAME error (no clue which codes exist)", fns.shopLogin.run({ code: "nosuchshop", pin: "000000" }), "unauthenticated");
  ok("same message text for both", e1.message === e2.message);
  for (let i = 1; i <= 5; i++) await rejects("wrong PIN #" + i + " on F7", fns.shopLogin.run({ code: "f7", pin: "000000" }), "unauthenticated");
  await rejects("6th try on F7 is refused before the PIN is even looked at", fns.shopLogin.run({ code: "f7", pin: "654321" }), "resource-exhausted");
  dropKeys("rate_limits/login_shop_f7"); // pretend 15 minutes passed
  ok("after the wait the right PIN works", !!(await fns.shopLogin.run({ code: "f7", pin: "654321" })).token);

  title("3. SETUP CODE -> AGENT ACTIVATION (NEW LICENSE EACH TIME)");
  await rejects("non-admin cannot make a setup code", fns.createSetupCode.run({ shopId: "g10" }, owner("g10")), "permission-denied");
  const sc = await fns.createSetupCode.run({ shopId: "g10" }, ADMIN);
  console.log("  setup code shown in admin panel:", sc.code);
  ok("code looks like XXXX-XXXX", /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(sc.code));
  ok("server stores only a hash of the code", ![...store.keys()].some((k) => k.includes(sc.code.replace("-", ""))));
  await rejects("wrong code refused", fns.agentActivate.run({ code: "AAAA-BBBB" }), "not-found");
  const act = await fns.agentActivate.run({ code: sc.code.toLowerCase().replace("-", " ") });
  ok("right code (typed loosely) returns shopId + a license", act.shopId === "g10" && /^HL-G10-[0-9A-F]{12}$/.test(act.license_key));
  ok("server keeps only a HASH of the license", doc("shops_private/g10").license_hash === lib.hashLicense(act.license_key) && !JSON.stringify(store.get("shops_private/g10")).includes(act.license_key));
  ok("shop is flagged license_active for the admin panel", doc("shops/g10").license_active === true);
  await rejects("same code cannot be used twice", fns.agentActivate.run({ code: sc.code }), "not-found");
  const sc2 = await fns.createSetupCode.run({ shopId: "g10" }, ADMIN);
  store.get("setup_codes/" + lib.hashSetupCode(lib.normalizeSetupCode(sc2.code))).expires_at = Date.now() - 1000;
  await rejects("expired code refused", fns.agentActivate.run({ code: sc2.code }), "not-found");
  const LIC = await install("g10");
  ok("activating again issues a NEW license", LIC !== act.license_key);
  await rejects("the old license stops working at once", fns.agentPush.run({ shopId: "g10", license_key: act.license_key, total: 1 }), "unauthenticated");

  title("4. AGENT PUSHES SALES (SHOP PC)");
  await rejects("wrong license refused", fns.agentPush.run({ shopId: "g10", license_key: "HL-G10-FAKE", total: 500 }), "unauthenticated");
  await rejects("no license at all refused", fns.agentPush.run({ shopId: "f7", license_key: "HL-F7-FAKE", total: 500 }), "unauthenticated");
  await rejects("negative total refused", fns.agentPush.run({ shopId: "g10", license_key: LIC, total: -5 }), "invalid-argument");
  await fns.agentPush.run({ shopId: "g10", license_key: LIC, total: 12000 });
  ok("shop shows today's sale = 12000", doc("shops/g10").today_sale === 12000 && doc("shops/g10").today_sale_date === today);
  await fns.agentPush.run({ shopId: "g10", license_key: LIC, total: 15500 });
  ok("sale updated to 15500 (replaced, not added)", doc("shops/g10").today_sale === 15500);
  ok("monthly sale = 15500 (not double counted)", doc(`shops/g10/monthly_summary/${ym}`).sale === 15500);
  store.set(`shops/g10/daily_sales/${ym}-01`, { total: 9000, date: `${ym}-01` });
  await fns.agentPush.run({ shopId: "g10", license_key: LIC, total: 15500 });
  ok("monthly sale = today + earlier days = 24500", doc(`shops/g10/monthly_summary/${ym}`).sale === 24500);
  await Promise.all([1, 2, 3, 4, 5, 6].map(() => fns.agentPush.run({ shopId: "g10", license_key: LIC, total: 15500 })));
  ok("6 pushes at the same moment: month sale still exactly 24500", doc(`shops/g10/monthly_summary/${ym}`).sale === 24500);

  title("5. EXPENSES (SERVER-SIDE) -> MONTHLY SUMMARY");
  const exp = (title, amount, category, extra = {}) => fns.addExpense.run({ title, amount, category, ...extra }, owner("g10"));
  await rejects("not logged in -> refused", fns.addExpense.run({ title: "x", amount: 5, category: "Other" }, {}), "unauthenticated");
  await rejects("unknown category refused", exp("x", 5, "Hacking"), "invalid-argument");
  await rejects("negative amount refused", exp("x", -5, "Other"), "invalid-argument");
  await rejects("empty title refused", exp(" ", 5, "Other"), "invalid-argument");
  await exp("Bijli bill", 4000, "Bijli / Bills", { date: "2020-01-01" }); // a forged date must be ignored
  await exp("Rickshaw", 500.5, "Transport / Rickshaw");
  await exp("Staff", 6000, "Staff / Tankhwa");
  const expenses = [...store.entries()].filter(([k]) => k.startsWith("shops/g10/expenses/")).map(([, v]) => v);
  ok("3 expenses saved, all dated TODAY (the forged date was ignored)", expenses.length === 3 && expenses.every((e) => e.date === today && e.source === "app"));
  let m = doc(`shops/g10/monthly_summary/${ym}`);
  ok("month expense = 10500.5", m.expense === 10500.5);
  ok("by category is right", m.expense_by_cat.Bijli_Bills === 4000 && m.expense_by_cat.Transport_Rickshaw === 500.5 && m.expense_by_cat.Staff_Tankhwa === 6000);
  ok("sale survived the expense updates (month profit = " + (m.sale - m.expense) + ")", m.sale === 24500);
  await Promise.all(Array.from({ length: 10 }, () => exp("Chai", 100, "Other")));
  m = doc(`shops/g10/monthly_summary/${ym}`);
  ok("10 expenses saved at the same moment: total exact (11500.5), none lost", m.expense === 11500.5 && m.expense_by_cat.Other === 1000);

  title("6. KHATA (CUSTOMER CREDIT)");
  await rejects("not logged in -> refused", fns.khataAddCustomer.run({ name: "Usman" }, {}), "unauthenticated");
  await rejects("empty name refused", fns.khataAddCustomer.run({ name: " " }, owner("g10")), "invalid-argument");
  const cust = await fns.khataAddCustomer.run({ name: "Usman", phone: "0333-1112223" }, owner("g10"));
  const cp = `shops/g10/khata_customers/${cust.id}`;
  ok("customer saved with balance 0", doc(cp).balance === 0 && doc(cp).phone === "03331112223");
  ok("udhaar 500 -> balance 500", (await fns.khataAddEntry.run({ customerId: cust.id, type: "udhaar", amount: 500, note: "chawal" }, owner("g10"))).balance === 500);
  ok("payment 200 -> balance 300", (await fns.khataAddEntry.run({ customerId: cust.id, type: "payment", amount: 200 }, owner("g10"))).balance === 300);
  ok("payment 500 -> balance -200 (advance)", (await fns.khataAddEntry.run({ customerId: cust.id, type: "payment", amount: 500 }, owner("g10"))).balance === -200);
  ok("3 entries on record", [...store.keys()].filter((k) => k.startsWith(cp + "/entries/")).length === 3);
  await rejects("bad amount refused", fns.khataAddEntry.run({ customerId: cust.id, type: "udhaar", amount: -5 }, owner("g10")), "invalid-argument");
  await rejects("unknown customer refused", fns.khataAddEntry.run({ customerId: "doesnotexist1", type: "udhaar", amount: 5 }, owner("g10")), "not-found");
  await rejects("other shop cannot touch this customer", fns.khataAddEntry.run({ customerId: cust.id, type: "udhaar", amount: 5 }, owner("f7")), "not-found");

  title("7. PUSH NOTIFICATION TOKENS");
  const longTok = (n) => "tok" + String(n) + "x".repeat(60);
  await rejects("junk token refused", fns.saveFcmToken.run({ token: "abc" }, owner("g10")), "invalid-argument");
  for (let i = 1; i <= 7; i++) await fns.saveFcmToken.run({ token: longTok(i) }, owner("g10"));
  ok("keeps newest 5 devices only", doc("shops/g10").fcm_tokens.length === 5 && doc("shops/g10").fcm_tokens[4] === longTok(7));
  await fns.saveFcmToken.run({ token: longTok(7) }, owner("g10"));
  ok("same device twice is not duplicated", doc("shops/g10").fcm_tokens.length === 5);

  title("8. NIGHTLY CHECK: WARNINGS AND LOCK");
  const setExpiry = (id, d, extra = {}) => Object.assign(doc("shops/" + id), { current_expiry: d, status: "active", live_banner: false }, extra);
  setExpiry("g10", addDays(today, 3));
  fcm.deadTokens.add(longTok(3)); // one phone uninstalled the app
  fcm.sent.length = 0;
  await fns.dailySubscriptionCheck.run();
  ok("3 days left -> warning banner", doc("shops/g10").live_banner_type === "warning_3day" && doc("shops/g10").status === "active");
  ok("push sent to all live devices (4 of 5, 1 was dead)", fcm.sent.length === 4);
  ok("dead device token removed", !doc("shops/g10").fcm_tokens.includes(longTok(3)) && doc("shops/g10").fcm_tokens.length === 4);
  ok("message has no date and no 'agent' word", fcm.sent.every((s) => !/\d{4}|agent/i.test(s.body)));
  setExpiry("g10", addDays(today, 1));
  await fns.dailySubscriptionCheck.run();
  ok("1 day left -> final reminder", doc("shops/g10").live_banner_type === "warning_1day");
  setExpiry("g10", addDays(today, 0));
  await fns.dailySubscriptionCheck.run();
  ok("expiry day -> status expired + red banner", doc("shops/g10").status === "expired" && doc("shops/g10").live_banner_type === "expired");
  await fns.dailySubscriptionCheck.run();
  ok("running again does not re-notify an expired shop", fcm.sent.length > 0 && doc("shops/g10").status === "expired");

  title("9. EXPIRED SHOP: APP LOCKS, AGENT NEVER LOCKS");
  await rejects("khata blocked while expired", fns.khataAddEntry.run({ customerId: cust.id, type: "udhaar", amount: 5 }, owner("g10")), "failed-precondition");
  await rejects("new expense blocked while expired", exp("x", 5, "Other"), "failed-precondition");
  await fns.agentPush.run({ shopId: "g10", license_key: LIC, total: 16000 });
  ok("agent still pushes sales while shop is expired", doc("shops/g10").today_sale === 16000);

  title("10. ADMIN: RENEW, RESET PIN, REVOKE LICENSE, SIGN OUT");
  const startDay = lib.parseYMD(doc("shops/g10").start_date).d;
  setExpiry("g10", addDays(today, -40), { status: "expired" });
  const r = await fns.markPaid.run({ shopId: "g10" }, ADMIN);
  ok("late payment: new expiry is in the FUTURE (" + r.current_expiry + ")", r.current_expiry > today);
  ok("renewal keeps the same day-of-month anchor (" + startDay + ")", lib.parseYMD(r.current_expiry).d === Math.min(startDay, new Date(Date.UTC(+r.current_expiry.slice(0, 4), +r.current_expiry.slice(5, 7), 0)).getUTCDate()));
  ok("shop is active again, banner cleared", doc("shops/g10").status === "active" && doc("shops/g10").live_banner === false);
  await fns.dailySubscriptionCheck.run();
  ok("nightly check leaves the renewed shop alone", doc("shops/g10").status === "active");
  await rejects("non-admin cannot mark paid", fns.markPaid.run({ shopId: "g10" }, owner("g10")), "permission-denied");

  await fns.resetPin.run({ shopId: "g10", pin: "999999" }, ADMIN);
  ok("PIN reset signs the shop out on every device", revoked.includes("shop_g10"));
  await newShop("N1", "03111111111", "111222"); // never logged in anywhere
  await fns.resetPin.run({ shopId: "n1", pin: "222111" }, ADMIN);
  ok("PIN reset also works for a shop that never signed in", !revoked.includes("shop_n1"));
  await rejects("old PIN no longer works after reset", fns.shopLogin.run({ code: "g10", pin: "123456" }), "unauthenticated");
  ok("new PIN works", !!(await fns.shopLogin.run({ code: "g10", pin: "999999" })).token);
  const before = revoked.filter((x) => x === "shop_g10").length;
  await rejects("logout-everywhere needs a login", fns.logoutEverywhere.run({}, {}), "unauthenticated");
  await fns.logoutEverywhere.run({}, owner("g10"));
  ok("owner can sign out all their devices", revoked.filter((x) => x === "shop_g10").length === before + 1);

  await rejects("non-admin cannot revoke a license", fns.revokeLicense.run({ shopId: "g10" }, owner("g10")), "permission-denied");
  await fns.revokeLicense.run({ shopId: "g10" }, ADMIN);
  await rejects("revoked license is dead at once", fns.agentPush.run({ shopId: "g10", license_key: LIC, total: 1 }), "unauthenticated");
  ok("admin panel flag shows license_active = false", doc("shops/g10").license_active === false && doc("shops_private/g10").license_hash === null);
  const LIC2 = await install("g10");
  await fns.agentPush.run({ shopId: "g10", license_key: LIC2, total: 17000 });
  ok("a fresh setup code brings the shop back with a new license", LIC2 !== LIC && doc("shops/g10").today_sale === 17000);

  title("11. ATTACKS: GUESSING, SPAM, FLOODING");
  await newShop("T1", "03222222222", "424242");
  const burst = ["111111", "222222", "333333", "444444", "555555", ...Array.from({ length: 34 }, (_, i) => String(100000 + i)), "424242"];
  const res1 = await Promise.all(burst.map((pin) => outcome(fns.shopLogin.run({ code: "t1", pin }, from("203.0.113.50")))));
  console.log("  40 parallel guesses from ONE network:", JSON.stringify(tally(res1)));
  ok("only 5 guesses were even evaluated, the right PIN (last) never got in", tally(res1).unauthenticated === 5 && tally(res1).resource_exhausted === undefined && !res1.includes("LOGGED_IN") && res1.filter((x) => x === "resource-exhausted").length === 35);
  ok("the real owner, on another network, is NOT locked out by the stranger", (await outcome(fns.shopLogin.run({ code: "t1", pin: "424242" }, from("198.51.100.8")))) === "LOGGED_IN");

  await newShop("T2", "03333333333", "515151");
  const res2 = await Promise.all(Array.from({ length: 40 }, (_, i) => outcome(fns.shopLogin.run({ code: "t2", pin: i === 39 ? "515151" : String(100000 + i) }, from("10.1.1." + i)))));
  console.log("  40 guesses spread over 40 different networks:", JSON.stringify(tally(res2)));
  ok("guessing spread over many networks is capped at 30 per hour per shop (right PIN last: blocked)", tally(res2).unauthenticated === 30 && res2[39] === "resource-exhausted");
  ok("(known limit) the owner is also held up until the hour passes", (await outcome(fns.shopLogin.run({ code: "t2", pin: "515151" }, from("198.51.100.9")))) === "resource-exhausted");
  dropKeys("rate_limits/login_shop_t2");
  ok("...and gets in after it", (await outcome(fns.shopLogin.run({ code: "t2", pin: "515151" }, from("198.51.100.9")))) === "LOGGED_IN");

  const res3 = await Promise.all(Array.from({ length: 40 }, (_, i) => outcome(fns.shopLogin.run({ code: "nosuch" + i, pin: "000000" }, from("192.0.2.77")))));
  ok("one network spraying 40 different shop codes: stopped after 30", tally(res3).unauthenticated === 30 && tally(res3)["resource-exhausted"] === 10);

  const res4 = [];
  for (let i = 0; i < 25; i++) res4.push(await outcome(fns.agentActivate.run({ code: "AAAA-BBB" + (i % 8 + 2) }, from("192.0.2.99"))));
  ok("setup-code guessing: 20 tries per network, then blocked", res4.filter((x) => x === "not-found").length === 20 && res4.filter((x) => x === "resource-exhausted").length === 5);
  const LICF7 = await install("f7", "192.0.2.100");
  ok("...and that attacker cannot block a real install from another network", /^HL-F7-/.test(LICF7));

  let pushOk = 0;
  for (let i = 0; i < 150; i++) { await fns.agentPush.run({ shopId: "f7", license_key: LICF7, total: i }); pushOk++; }
  await rejects("flooding with a valid license: 151st push in 10 minutes refused", fns.agentPush.run({ shopId: "f7", license_key: LICF7, total: 1 }), "resource-exhausted");

  for (let i = 0; i < 300; i++) await fns.addExpense.run({ title: "spam", amount: 1, category: "Other" }, owner("f7"));
  await rejects("expense spam: 301st expense in one day refused", fns.addExpense.run({ title: "spam", amount: 1, category: "Other" }, owner("f7")), "resource-exhausted");
  ok("month expense matches the 300 saved (no runaway reads/writes)", doc(`shops/f7/monthly_summary/${ym}`).expense === 300);

  for (let i = 0; i < 100; i++) await fns.khataAddCustomer.run({ name: "c" + i }, owner("f7"));
  await rejects("khata spam: 101st customer in one day refused", fns.khataAddCustomer.run({ name: "one too many" }, owner("f7")), "resource-exhausted");

  store.set("rate_limits/old_counter", { n: 3, start: Date.now() - 3 * 86400000 });
  await fns.dailySubscriptionCheck.run();
  ok("nightly housekeeping deletes old rate-limit counters", !store.has("rate_limits/old_counter") && [...store.keys()].some((k) => k.startsWith("rate_limits/")));


  // =====================================================================================
  title("12. INSIDER FRAUD: A CASHIER EDITS THE POS DATABASE (real agent + real SQLite POS + real server code)");
  // =====================================================================================
  const fs = require("fs"), os = require("os"), path = require("path");
  const { DatabaseSync } = require("node:sqlite");
  const { createSync } = require("../agent/sync");
  const sqliteConn = require("../agent/connectors/sqlite");
  const { chooseSource } = require("../agent/setup");

  await newShop("TM1", "03001110001", "246810");
  const LICT = await install("tm1", "203.0.113.50");
  await fns.saveFcmToken.run({ token: "x".repeat(60) + "-owner-phone" }, owner("tm1"));

  // A real POS database (file) with 12 honest bills for today, written by "the POS program".
  const posFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hl-demo-")), "mystore.db");
  const pos = new DatabaseSync(posFile);
  pos.exec(`CREATE TABLE Customers(CustomerID INTEGER PRIMARY KEY, Name TEXT);
    CREATE TABLE SaleDetail(InvoiceNo TEXT, Item TEXT, Qty INT, Amount REAL);
    CREATE TABLE Sales(SaleID INTEGER PRIMARY KEY, InvoiceNo TEXT, InvDate TEXT, NetAmount REAL, CashierName TEXT, IsDeleted INTEGER DEFAULT 0)`);
  const addBill = pos.prepare("INSERT INTO Sales(InvoiceNo, InvDate, NetAmount, CashierName) VALUES (?,?,?,?)");
  const inv = (n) => "INV-" + String(n).padStart(4, "0");
  const when = (n) => `${today} ${String(11 + Math.floor(n / 6)).padStart(2, "0")}:${String((n * 7) % 60).padStart(2, "0")}:00`;
  for (let n = 1; n <= 12; n++) addBill.run(inv(n), when(n), n * 1000, n % 2 ? "ali" : "zain");
  const HONEST = 78000; // 1000+2000+...+12000

  // Setup per shop: the person gives only the file; the invoice / total / date columns are found by themselves.
  const answers = ["1", posFile, "y"];
  const source = await chooseSource({ ask: async () => answers.shift(), make: (t, c) => sqliteConn.create(c), log: () => {} });
  ok("AUTO-SETUP found the right table and columns (Sales: InvoiceNo / NetAmount / InvDate)", source.table === "Sales" && source.cols.id === "InvoiceNo" && source.cols.total === "NetAmount" && source.cols.date === "InvDate" && source.mode === "bills");
  ok("...and noticed the cancel flag and the cashier column", source.cols.status === "IsDeleted" && source.cols.cashier === "CashierName");

  const callFn = (name, data) => fns[name].run(data);
  const newAgent = () => createSync({ connector: sqliteConn.create(source), source, callFn, cfg: { shopId: "tm1", license_key: LICT }, log: () => {} });
  let agent = newAgent();
  await agent.tick();
  ok("honest day: today's sale on the owner's screen = Rs 78,000", doc("shops/tm1").today_sale === HONEST);
  ok("honest day: no alerts, nothing missing", ![...store.keys()].some((k) => k.startsWith("shops/tm1/alerts/")) && !doc("shops/tm1").today_missing);
  ok("every bill is now kept in the server's permanent record (12)", [...store.keys()].filter((k) => k.startsWith("shops/tm1/bills/")).length === 12);
  ok("month sale includes today", doc(`shops/tm1/monthly_summary/${ym}`).sale === HONEST);

  // The cashier goes to work on the database.
  pos.exec("DELETE FROM Sales WHERE InvoiceNo = 'INV-0004'");                       // 1. delete a bill (Rs 4,000)
  pos.exec("UPDATE Sales SET NetAmount = 700 WHERE InvoiceNo = 'INV-0007'");        // 2. lower a bill 7,000 -> 700
  pos.exec("UPDATE Sales SET IsDeleted = 1 WHERE InvoiceNo = 'INV-0009'");          // 3. cancel a bill (Rs 9,000)
  fcm.sent.length = 0;
  await agent.tick();
  const alertsOf = (shop) => [...store.entries()].filter(([k]) => k.startsWith(`shops/${shop}/alerts/`)).map(([, v]) => v);
  const byType = (shop, ty) => alertsOf(shop).filter((a) => a.type === ty);
  ok("DELETED bill caught: INV-0004, Rs 4,000", byType("tm1", "deleted").length === 1 && byType("tm1", "deleted")[0].bill_id === "INV-0004" && byType("tm1", "deleted")[0].amount === 4000);
  ok("LOWERED bill caught: INV-0007 from 7,000 to 700", byType("tm1", "total_lowered")[0].from === 7000 && byType("tm1", "total_lowered")[0].to === 700);
  ok("CANCELLED-after-recording caught: INV-0009, Rs 9,000", byType("tm1", "voided")[0].amount === 9000);
  ok("the owner's screen shows the hole: Rs 19,300 removed today", doc("shops/tm1").today_missing === 19300 && doc(`shops/tm1/daily_sales/${today}`).recorded_total === HONEST);
  ok("the server still remembers INV-0007's ORIGINAL amount (7,000)", [...store.entries()].some(([k, v]) => k.startsWith("shops/tm1/bills/") && v.id === "INV-0007" && v.first_total === 7000 && v.total === 700));
  ok("the owner's phone got ONE push about it", fcm.sent.filter((m) => /suspicious/.test(m.body)).length === 1);
  const sev = alertsOf("tm1").map((a) => a.severity);
  ok("alerts are HIGH severity", sev.length >= 3 && sev.every((x) => x === "high"));

  // The cashier tries to cover up.
  pos.exec("INSERT INTO Sales(InvoiceNo, InvDate, NetAmount, CashierName) VALUES ('INV-0004', '" + when(4) + "', 4000, 'zain')"); // puts the deleted bill back, exactly as it was
  const nAlerts = alertsOf("tm1").length;
  fcm.sent.length = 0;
  await agent.tick();
  ok("putting a bill back does NOT erase the alert (the history stays)", alertsOf("tm1").length === nAlerts && byType("tm1", "deleted").length === 1);

  // Agent switched off (PC restarted / process killed); edits are made while it is off; it starts again.
  pos.exec("UPDATE Sales SET NetAmount = 300 WHERE InvoiceNo = 'INV-0003'");
  agent = newAgent(); // a brand-new agent knows nothing: it re-checks everything on its first step
  await agent.tick();
  ok("edit made while the agent was OFF is still caught after restart (INV-0003: 3,000 -> 300)", byType("tm1", "total_lowered").some((a) => a.bill_id === "INV-0003" && a.to === 300));
  ok("no second push within 5 minutes (not spammy)", fcm.sent.filter((m) => /suspicious/.test(m.body)).length === 0);

  // Garbage in the date column to hide a bill.
  pos.exec("INSERT INTO Sales(InvoiceNo, InvDate, NetAmount, CashierName) VALUES ('INV-0050', 'tomorrow-ish', 25000, 'ali')");
  await agent.tick();
  ok("a bill hidden behind an unreadable date is reported", byType("tm1", "unreadable").length === 1);

  // Database wiped / restored from an old backup.
  pos.exec("DELETE FROM Sales WHERE SaleID > 4");
  await agent.tick();
  ok("database restored from an old backup / wiped: ONE big alert, not 40", byType("tm1", "mass_missing").length === 1);

  // Owner side.
  const unseen = () => alertsOf("tm1").filter((a) => !a.seen).length;
  ok("owner has unseen alerts", unseen() > 5);
  const ids = [...store.keys()].filter((k) => k.startsWith("shops/tm1/alerts/")).map((k) => k.split("/").pop());
  await rejects("another shop's owner cannot mark these alerts (they do not exist in his shop)", fns.ackAlerts.run({ ids }, owner("g10")), "not-found");
  ok("...and they are still unseen", unseen() > 5);
  await fns.ackAlerts.run({ ids }, owner("tm1"));
  ok("the real owner can mark alerts as seen", unseen() === 0);
  ok("...but they stay on record (nothing deleted)", alertsOf("tm1").length === ids.length);
  await rejects("a caller with no PIN session cannot use ackAlerts", fns.ackAlerts.run({ ids: [] }, {}), "unauthenticated");

  // Attacks on the new calls.
  await rejects("sync with a wrong license is refused", fns.agentSync.run({ shopId: "tm1", license_key: "HL-TM1-WRONG", days: [] }), "unauthenticated");
  await rejects("a license of another shop cannot write into this shop", fns.agentSync.run({ shopId: "tm1", license_key: LICF7, days: [] }), "unauthenticated");
  const big = { shopId: "tm1", license_key: LICT, days: [{ date: today, digest: "x" }], bills: { [today]: Array.from({ length: 3001 }, (_, i) => ({ id: "Z" + i, ts: Date.now(), total: 1 })) } };
  await rejects("more than 3,000 bills in one call is refused", fns.agentSync.run(big), "invalid-argument");
  const rf = await fns.agentSync.run({ shopId: "tm1", license_key: LICT, days: [{ date: addDays(today, 5), digest: "x" }] });
  ok("a future day is ignored", rf.need.length === 0);

  // Totals-only mode: a database with no invoice numbers.
  await newShop("TM2", "03001110002", "135791");
  const LICT2 = await install("tm2", "203.0.113.51");
  await fns.agentPush.run({ shopId: "tm2", license_key: LICT2, total: 10000, count: 40 });
  await fns.agentPush.run({ shopId: "tm2", license_key: LICT2, total: 12000, count: 44 });
  ok("totals-only: a rising total raises nothing", alertsOf("tm2").length === 0);
  await fns.agentPush.run({ shopId: "tm2", license_key: LICT2, total: 8000, count: 41 });
  ok("totals-only: total falling from 12,000 to 8,000 is caught", byType("tm2", "total_dropped")[0].amount === 4000);
  ok("totals-only: fewer sales than before is caught", byType("tm2", "bills_fewer").length === 1);
  ok("totals-only: owner sees Rs 4,000 missing today", doc("shops/tm2").today_missing === 4000);

  // Agent silent during shop hours.
  const realNow = Date.now;
  const at = Date.parse(`${today}T14:00:00+05:00`);
  Date.now = () => at;
  store.get("shops/tm2").agent_last_seen = new Date(at - 3 * 3600000).toISOString();
  await fns.agentOfflineCheck.run();
  Date.now = realNow;
  ok("agent silent for 3 hours at 2 pm: owner is warned", byType("tm2", "agent_offline").length === 1);

  console.log(`\nALL GOOD: ${passed} checks passed.`);
})().catch((e) => { console.error("\n" + (e.stack || e)); process.exit(1); });
