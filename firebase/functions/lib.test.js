"use strict";
const test = require("node:test");
const assert = require("node:assert");
const lib = require("./lib");

test("addMonthAnchored clamps month-end and keeps the anchor", () => {
  assert.strictEqual(lib.addMonthAnchored("2026-01-31", 31), "2026-02-28");
  assert.strictEqual(lib.addMonthAnchored("2026-02-28", 31), "2026-03-31");
  assert.strictEqual(lib.addMonthAnchored("2028-01-31", 31), "2028-02-29"); // leap year
  assert.strictEqual(lib.addMonthAnchored("2026-12-13", 13), "2027-01-13");
  assert.strictEqual(lib.addMonthAnchored("2026-10-13", 13), "2026-11-13");
});

test("nextExpiryAfterPayment: on time, early and lapsed", () => {
  assert.strictEqual(lib.nextExpiryAfterPayment("2026-01-13", "2026-11-13", "2026-11-10"), "2026-12-13");
  assert.strictEqual(lib.nextExpiryAfterPayment("2026-01-13", "2026-11-13", "2026-11-13"), "2026-12-13");
  assert.strictEqual(lib.nextExpiryAfterPayment("2026-01-13", "2026-10-13", "2026-10-22"), "2026-11-13");
  assert.strictEqual(lib.nextExpiryAfterPayment("2026-01-13", "2026-08-13", "2026-10-22"), "2026-11-13");
  assert.strictEqual(lib.nextExpiryAfterPayment("2026-01-31", "2026-02-28", "2026-02-20"), "2026-03-31");
});

test("todayPK follows Pakistan time, not UTC", () => {
  assert.strictEqual(lib.todayPK(new Date("2026-10-21T20:00:00Z")), "2026-10-22"); // 01:00 PKT
  assert.strictEqual(lib.todayPK(new Date("2026-10-21T18:59:00Z")), "2026-10-21"); // 23:59 PKT
});

test("daysBetween", () => {
  assert.strictEqual(lib.daysBetween("2026-10-22", "2026-10-25"), 3);
  assert.strictEqual(lib.daysBetween("2026-10-22", "2026-10-22"), 0);
  assert.strictEqual(lib.daysBetween("2026-10-22", "2026-10-20"), -2);
  assert.strictEqual(lib.daysBetween("2026-02-27", "2026-03-01"), 2);
});

test("PIN hashing", () => {
  const h = lib.hashPin("123456");
  assert.ok(lib.verifyPin("123456", h));
  assert.ok(!lib.verifyPin("123457", h));
  assert.ok(!lib.verifyPin("123456", ""));
  assert.notStrictEqual(lib.hashPin("123456"), h); // random salt
});

test("ids, phones and licenses", () => {
  assert.strictEqual(lib.slugId(" G10 "), "g10");
  assert.strictEqual(lib.slugId("Shop One"), "shop_one");
  assert.strictEqual(lib.slugId("a/b"), null);
  assert.strictEqual(lib.slugId("x"), null);
  assert.strictEqual(lib.digitsOnly("+92 300-1234567"), "923001234567");
  assert.match(lib.genLicense("G10"), /^HL-G10-[0-9A-F]{12}$/);
  assert.ok(lib.safeEqual("abc", "abc"));
  assert.ok(!lib.safeEqual("abc", "abd"));
  assert.ok(!lib.safeEqual("abc", "abcd"));
});

test("month helpers", () => {
  assert.strictEqual(lib.monthOf("2026-10-22"), "2026-10");
  assert.throws(() => lib.monthOf("22-10-2026"));
  assert.deepStrictEqual(lib.monthBounds("2026-02"), { start: "2026-02-01", end: "2026-02-31" });
  assert.ok("2026-02-28" >= "2026-02-01" && "2026-02-28" <= "2026-02-31");
  assert.ok(!("2026-03-01" <= "2026-02-31"));
  assert.strictEqual(lib.catKey("Bijli / Bills"), "Bijli_Bills");
  assert.strictEqual(lib.catKey("Transport / Rickshaw"), "Transport_Rickshaw");
});

test("validateExpense", () => {
  assert.deepStrictEqual(lib.validateExpense({ title: " Bijli ", amount: "100.456", category: "Bijli / Bills" }),
    { value: { title: "Bijli", amount: 100.46, category: "Bijli / Bills" } });
  assert.ok(lib.validateExpense({ title: "", amount: 5, category: "Other" }).error);
  assert.ok(lib.validateExpense({ title: "x", amount: 0, category: "Other" }).error);
  assert.ok(lib.validateExpense({ title: "x", amount: -1, category: "Other" }).error);
  assert.ok(lib.validateExpense({ title: "x", amount: "abc", category: "Other" }).error);
  assert.ok(lib.validateExpense({ title: "x", amount: 1e9, category: "Other" }).error);
  assert.ok(lib.validateExpense({ title: "x", amount: 5, category: "Made up" }).error);
  assert.ok(lib.validateExpense(null).error);
  assert.strictEqual(lib.validateExpense({ title: "y".repeat(500), amount: 5, category: "Other" }).value.title.length, 100);
});

test("PIN pepper: a database leak alone cannot verify PINs", () => {
  const h = lib.hashPin("123456", "pepper-A");
  assert.ok(lib.verifyPin("123456", h, "pepper-A"));
  assert.ok(!lib.verifyPin("123456", h, "pepper-B"));
  assert.ok(!lib.verifyPin("123456", h)); // no pepper
  assert.ok(!lib.verifyPin("123457", h, "pepper-A"));
});

test("license hashing", () => {
  const l = lib.genLicense("G10");
  assert.strictEqual(lib.hashLicense(l).length, 64);
  assert.strictEqual(lib.hashLicense(l), lib.hashLicense(l));
  assert.notStrictEqual(lib.hashLicense(l), lib.hashLicense(l + "x"));
  assert.ok(!lib.hashLicense(l).includes(l));
});

test("consumeWindow: limit per window, then reopens", () => {
  const W = 15 * 60000;
  let s = null;
  for (let i = 1; i <= 5; i++) {
    const r = lib.consumeWindow(s, 1000 + i, 5, W);
    assert.ok(r.allowed, "use " + i); s = r.state;
  }
  assert.strictEqual(s.n, 5);
  const blocked = lib.consumeWindow(s, 5000, 5, W);
  assert.ok(!blocked.allowed);
  assert.strictEqual(blocked.state.n, 5);               // refused use is not counted
  assert.ok(!lib.consumeWindow(s, 1001 + W - 1, 5, W).allowed); // still closed just before the window ends
  const reopened = lib.consumeWindow(s, 1001 + W, 5, W);       // window measured from the first use
  assert.ok(reopened.allowed && reopened.state.n === 1);
  assert.ok(!lib.consumeWindow(null, 0, 0, W).allowed);
});

test("ipKey", () => {
  assert.strictEqual(lib.ipKey(undefined), "unknown");
  assert.strictEqual(lib.ipKey({}), "unknown");
  const k = lib.ipKey({ ip: "203.0.113.9" });
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.notStrictEqual(k, lib.ipKey({ ip: "203.0.113.10" }));
  assert.ok(!k.includes("203"));
});

test("khata balance and validation", () => {
  assert.strictEqual(lib.applyEntry(0, "udhaar", 500), 500);
  assert.strictEqual(lib.applyEntry(500, "payment", 200), 300);
  assert.strictEqual(lib.applyEntry(300, "payment", 500), -200); // advance
  assert.strictEqual(lib.applyEntry(0.1, "udhaar", 0.2), 0.3);   // no float drift
  assert.deepStrictEqual(lib.validateEntry({ type: "udhaar", amount: "250", note: " chai " }),
    { value: { type: "udhaar", amount: 250, note: "chai" } });
  assert.ok(lib.validateEntry({ type: "gift", amount: 5 }).error);
  assert.ok(lib.validateEntry({ type: "payment", amount: 0 }).error);
  assert.ok(lib.validateEntry({ type: "payment", amount: -5 }).error);
  assert.ok(lib.validateEntry({ type: "payment", amount: "x" }).error);
  assert.ok(lib.validateCustomer({ name: "  " }).error);
  assert.ok(lib.validateCustomer({ name: "Ali", phone: "123" }).error);
  assert.deepStrictEqual(lib.validateCustomer({ name: " Ali ", phone: "0300-1234567" }),
    { value: { name: "Ali", phone: "03001234567" } });
  assert.deepStrictEqual(lib.validateCustomer({ name: "Ali" }), { value: { name: "Ali", phone: "" } });
});

test("setup codes", () => {
  const code = lib.genSetupCode();
  assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.ok(!/[01OIL]/.test(code));
  assert.notStrictEqual(lib.genSetupCode(), lib.genSetupCode());
  const n = lib.normalizeSetupCode(code);
  assert.strictEqual(n, code.replace("-", ""));
  assert.strictEqual(lib.normalizeSetupCode(" " + code.toLowerCase().replace("-", " ") + " "), n); // typed loosely
  assert.strictEqual(lib.normalizeSetupCode("K7M2-9QX"), null);   // too short
  assert.strictEqual(lib.normalizeSetupCode("K7M2-9QX0"), null);  // 0 not in alphabet
  assert.strictEqual(lib.normalizeSetupCode(""), null);
  assert.strictEqual(lib.hashSetupCode(n), lib.hashSetupCode(n));
  assert.strictEqual(lib.hashSetupCode(n).length, 64);
});
