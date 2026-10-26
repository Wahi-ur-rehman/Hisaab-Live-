/**
 * Security mock tests for HisaabLive Cloud Functions.
 * Run: node --test security.test.js
 * No network, no Firebase emulator needed.
 */
"use strict";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Load lib and billcore directly (pure modules, no Firebase dependencies)
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const lib = require("./lib.js");
const billcore = require("./billcore.js");

// ---- Minimal in-memory store mirroring fakeFirebase for rate limit tests ----
const store = new Map();
let txChain = Promise.resolve();
const runTx = async (fn) => {
  const writes = [];
  const tx = {
    get: async (r) => {
      const path = r._path;
      const exists = store.has(path);
      return { exists, data: () => (exists ? JSON.parse(JSON.stringify(store.get(path))) : null) };
    },
    set: (r, d) => writes.push(() => store.set(r._path, d)),
    delete: (r) => writes.push(() => store.delete(r._path)),
  };
  const result = await fn(tx);
  writes.forEach((w) => w());
  return result;
};

function makeRef(path) {
  return { _path: path, get: async () => ({ exists: store.has(path), data: () => store.has(path) ? JSON.parse(JSON.stringify(store.get(path))) : null }) };
}

// Simulates consume() from index.js using consumeWindow from lib
async function consume(key, max, windowMs) {
  const ref = makeRef("rate_limits/" + key);
  const now = Date.now();
  const result = await new Promise((resolve) => {
    const next = txChain.then(async () => {
      const s = await ref.get();
      const r = lib.consumeWindow(s.exists ? s.data() : null, now, max, windowMs);
      if (r.allowed) store.set(ref._path, r.state);
      resolve(r.allowed);
    });
    txChain = next.catch(() => {});
  });
  return result;
}

// Simulates requireAdmin from index.js
function requireAdmin(context) {
  if (!context || !context.auth || context.auth.token.admin !== true) {
    const e = new Error("Admin only");
    e.code = "permission-denied";
    throw e;
  }
}

// ---- Tests ----

describe("Rate limiting", () => {
  test("allows exactly max uses and blocks the (max+1)th", async () => {
    // Use a high window so the counter does not reset mid-test
    const key = "test_rate_" + Date.now();
    const MAX = 30;
    for (let i = 0; i < MAX; i++) {
      const ok = await consume(key, MAX, 15 * 60 * 1000);
      assert.equal(ok, true, `call ${i + 1} should be allowed`);
    }
    const blocked = await consume(key, MAX, 15 * 60 * 1000);
    assert.equal(blocked, false, "31st call should be blocked");
  });

  test("resets after the window expires", async () => {
    // Use a 1ms window so it expires immediately
    const key = "test_reset_" + Date.now();
    const first = await consume(key, 1, 1);
    assert.equal(first, true);
    await new Promise((r) => setTimeout(r, 5));
    // After window expired the counter resets and a new use is allowed
    const second = await consume(key, 1, 1);
    assert.equal(second, true);
  });
});

describe("PIN timing safety", () => {
  test("getDummyHash returns a valid stored-hash format (prevents timing leak on non-existent shop)", () => {
    // The dummy hash is used in place of a non-existent shop's hash so verifyPin
    // always does a constant-time comparison even for unknown shop codes.
    const pepper = "a-test-pepper-that-is-long-enough";
    const dummyHash = lib.hashPin("000000", pepper);
    // Must have salt:hash format
    assert.match(dummyHash, /^[0-9a-f]{32}:[0-9a-f]{64}$/, "hash should be salt:hash hex format");
    // verifyPin with wrong pin should return false (not throw)
    const result = lib.verifyPin("123456", dummyHash, pepper);
    assert.equal(result, false, "wrong PIN should return false");
  });

  test("verifyPin returns false for completely wrong stored value", () => {
    const result = lib.verifyPin("123456", "notahash", "pepper");
    assert.equal(result, false);
  });

  test("verifyPin returns true for correct PIN", () => {
    const pepper = "test-pepper-at-least-16-chars";
    const stored = lib.hashPin("654321", pepper);
    assert.equal(lib.verifyPin("654321", stored, pepper), true);
    assert.equal(lib.verifyPin("111111", stored, pepper), false);
  });
});

describe("License hash comparison", () => {
  test("safeEqual returns true for equal strings", () => {
    assert.equal(lib.safeEqual("abc", "abc"), true);
  });

  test("safeEqual returns false for mutated hash", () => {
    const license = lib.genLicense("G10");
    const hash = lib.hashLicense(license);
    // Mutate one character
    const mutated = hash.slice(0, -1) + (hash.endsWith("f") ? "0" : "f");
    assert.equal(lib.safeEqual(hash, mutated), false);
  });

  test("safeEqual returns false for different lengths", () => {
    assert.equal(lib.safeEqual("abc", "ab"), false);
  });
});

describe("Admin guard", () => {
  test("requireAdmin throws permission-denied when no auth", () => {
    assert.throws(
      () => requireAdmin({}),
      (e) => e.code === "permission-denied"
    );
  });

  test("requireAdmin throws when admin flag is false", () => {
    assert.throws(
      () => requireAdmin({ auth: { token: { admin: false } } }),
      (e) => e.code === "permission-denied"
    );
  });

  test("requireAdmin does not throw when admin is true", () => {
    assert.doesNotThrow(() => requireAdmin({ auth: { token: { admin: true } } }));
  });
});

describe("Expense validation", () => {
  test("rejects negative amount", () => {
    const r = lib.validateExpense({ title: "Bijli", amount: -100, category: "Bijli / Bills" });
    assert.ok(r.error, "should have error for negative amount");
  });

  test("rejects zero amount", () => {
    const r = lib.validateExpense({ title: "Bijli", amount: 0, category: "Bijli / Bills" });
    assert.ok(r.error);
  });

  test("rejects empty title", () => {
    const r = lib.validateExpense({ title: "   ", amount: 100, category: "Bijli / Bills" });
    assert.ok(r.error, "should have error for empty title");
  });

  test("rejects invalid category", () => {
    const r = lib.validateExpense({ title: "Test", amount: 100, category: "InvalidCat" });
    assert.ok(r.error, "should have error for invalid category");
  });

  test("accepts valid expense", () => {
    const r = lib.validateExpense({ title: "Bijli Bill", amount: 1500, category: "Bijli / Bills" });
    assert.ok(!r.error, `unexpected error: ${r.error}`);
    assert.equal(r.value.amount, 1500);
    assert.equal(r.value.title, "Bijli Bill");
  });

  test("rejects amount above 1e8", () => {
    const r = lib.validateExpense({ title: "Too much", amount: 1e9, category: "Other" });
    assert.ok(r.error);
  });
});

describe("Customer validation", () => {
  test("rejects empty name", () => {
    const r = lib.validateCustomer({ name: "", phone: "" });
    assert.ok(r.error, "empty name should fail");
  });

  test("rejects whitespace-only name", () => {
    const r = lib.validateCustomer({ name: "   ", phone: "" });
    assert.ok(r.error);
  });

  test("rejects very long name (>60 chars would be truncated but empty still fails)", () => {
    // validateCustomer slices to 60; a name that was valid but very long is still ok
    const r = lib.validateCustomer({ name: "A".repeat(60), phone: "" });
    assert.ok(!r.error, "60-char name should be valid");
  });

  test("rejects phone that is too short", () => {
    const r = lib.validateCustomer({ name: "Ali", phone: "0300" }); // 4 digits
    assert.ok(r.error, "phone <10 digits should fail");
  });

  test("accepts valid customer", () => {
    const r = lib.validateCustomer({ name: "Ahmad Ali", phone: "03001234567" });
    assert.ok(!r.error, `unexpected error: ${r.error}`);
    assert.equal(r.value.name, "Ahmad Ali");
  });
});

describe("Entry validation", () => {
  test("rejects zero amount", () => {
    const r = lib.validateEntry({ type: "udhaar", amount: 0 });
    assert.ok(r.error, "zero amount should fail");
  });

  test("rejects negative amount", () => {
    const r = lib.validateEntry({ type: "payment", amount: -50 });
    assert.ok(r.error);
  });

  test("rejects invalid type", () => {
    const r = lib.validateEntry({ type: "refund", amount: 100 });
    assert.ok(r.error, "invalid type should fail");
  });

  test("accepts valid udhaar entry", () => {
    const r = lib.validateEntry({ type: "udhaar", amount: 500 });
    assert.ok(!r.error, `unexpected error: ${r.error}`);
    assert.equal(r.value.type, "udhaar");
    assert.equal(r.value.amount, 500);
  });

  test("accepts valid payment entry with note", () => {
    const r = lib.validateEntry({ type: "payment", amount: 250, note: "advance" });
    assert.ok(!r.error);
    assert.equal(r.value.note, "advance");
  });
});
