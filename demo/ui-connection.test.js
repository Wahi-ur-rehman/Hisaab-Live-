"use strict";
// Test simulating all UI client actions from owner-app and super-admin against Cloud Functions.
process.env.PIN_PEPPER = "demo-only-pepper-0123456789abcdef";
const test = require("node:test");
const assert = require("node:assert/strict");
const { store } = require("./fakeFirebase");
const lib = require("../firebase/functions/lib");
const fns = require("../firebase/functions/index.js");

const ADMIN = { auth: { token: { admin: true } } };
const ownerContext = (shopId) => ({ auth: { token: { shopId } } });
const today = lib.todayPK();
const ym = lib.monthOf(today);

test("UI Flow: Super Admin creates shop, Owner logs in and performs all daily operations", async () => {
  // 1. Admin creates shop from Admin.jsx UI
  const shopCode = "T01";
  const shopPhone = "03339876543";
  const pin = "789123";
  const created = await fns.createShop.run({
    code: shopCode,
    name: "Target Superstore",
    phone: shopPhone,
    pin: pin,
    amount: 5000,
  }, ADMIN);

  assert.ok(created.shopId);
  const shopId = created.shopId;
  assert.strictEqual(shopId, "t01");

  // Verify shop doc created in Firestore
  const shopDoc = store.get(`shops/${shopId}`);
  assert.ok(shopDoc);
  assert.strictEqual(shopDoc.shop_name, "Target Superstore");
  assert.strictEqual(shopDoc.status, "active");

  // 2. Owner App Login UI: user enters shop code + 6-digit PIN
  const loginRes = await fns.shopLogin.run({ code: "t01", pin: pin });
  assert.ok(loginRes.token);

  // In App.jsx: signInWithCustomToken returns user with custom claims
  const tokenPayload = JSON.parse(loginRes.token.slice(6));
  assert.strictEqual(tokenPayload.shopId, shopId);

  // 3. Hisaab tab: Owner adds expense
  const expRes = await fns.addExpense.run({
    title: "Chai Biscuit",
    amount: 350,
    category: "Other",
  }, ownerContext(shopId));
  assert.strictEqual(expRes.ok, true);

  // Verify expense doc and monthly summary updated
  const monthDoc = store.get(`shops/${shopId}/monthly_summary/${ym}`);
  assert.ok(monthDoc);
  assert.strictEqual(monthDoc.expense, 350);

  // Add another expense in category "Bijli / Bills"
  await fns.addExpense.run({
    title: "Electricity Meter",
    amount: 4500,
    category: "Bijli / Bills",
  }, ownerContext(shopId));

  const monthDoc2 = store.get(`shops/${shopId}/monthly_summary/${ym}`);
  assert.strictEqual(monthDoc2.expense, 4850);
  assert.strictEqual(monthDoc2.expense_by_cat.Bijli_Bills, 4500);

  // 4. Khata tab: Owner adds customer
  const custRes = await fns.khataAddCustomer.run({
    name: "Muhammad Tariq",
    phone: "03451234567",
  }, ownerContext(shopId));
  assert.ok(custRes.id);
  const custId = custRes.id;

  const custDoc = store.get(`shops/${shopId}/khata_customers/${custId}`);
  assert.strictEqual(custDoc.name, "Muhammad Tariq");
  assert.strictEqual(custDoc.balance, 0);

  // Owner gives udhaar (credit) to customer
  const udhaarRes = await fns.khataAddEntry.run({
    customerId: custId,
    type: "udhaar",
    amount: 1200,
    note: "Pani and rashan",
  }, ownerContext(shopId));
  assert.strictEqual(udhaarRes.balance, 1200);

  // Customer makes partial payment
  const payRes = await fns.khataAddEntry.run({
    customerId: custId,
    type: "payment",
    amount: 500,
    note: "Cash received",
  }, ownerContext(shopId));
  assert.strictEqual(payRes.balance, 700);

  // 5. Alerts tab: Owner acknowledges alerts
  // Setup an alert in Firestore for this shop
  const alertId = `alert_test_${today}_1`;
  store.set(`shops/${shopId}/alerts/${alertId}`, {
    id: alertId,
    type: "deleted",
    severity: "high",
    day: today,
    amount: 1500,
    seen: false,
  });

  const ackRes = await fns.ackAlerts.run({ ids: [alertId] }, ownerContext(shopId));
  assert.strictEqual(ackRes.ok, true);
  const alertDoc = store.get(`shops/${shopId}/alerts/${alertId}`);
  assert.strictEqual(alertDoc.seen, true);

  // 6. Push notification registration: Owner enables notifications
  const token = "mock_fcm_registration_token_1234567890_abcdefghijklmnopqrstuvwxyz";
  const fcmRes = await fns.saveFcmToken.run({ token }, ownerContext(shopId));
  assert.strictEqual(fcmRes.ok, true);
  const updatedShop = store.get(`shops/${shopId}`);
  assert.ok(Array.isArray(updatedShop.fcm_tokens));
  assert.ok(updatedShop.fcm_tokens.includes(token));

  // 7. Lockout on expiration: simulate expired shop
  store.set(`shops/${shopId}`, {
    ...updatedShop,
    status: "expired",
  });

  // Attempting to add an expense while expired should throw failed-precondition
  await assert.rejects(
    async () => {
      await fns.addExpense.run({ title: "Petrol", amount: 200, category: "Other" }, ownerContext(shopId));
    },
    (err) => err.code === "failed-precondition"
  );

  // Admin marks paid (renews subscription)
  const paidRes = await fns.markPaid.run({ shopId }, ADMIN);
  assert.ok(paidRes.current_expiry);
  const renewedShop = store.get(`shops/${shopId}`);
  assert.strictEqual(renewedShop.status, "active");

  // After renewal, operations succeed again
  const newExp = await fns.addExpense.run({ title: "Petrol", amount: 200, category: "Other" }, ownerContext(shopId));
  assert.strictEqual(newExp.ok, true);
});
