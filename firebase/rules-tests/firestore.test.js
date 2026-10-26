import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8");

let testEnv;

describe("Firestore Security Rules Tests", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "hisaablive-test-rules",
      firestore: {
        rules,
        host: process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0] || "127.0.0.1",
        port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] || 8080),
      },
    });
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    if (testEnv) await testEnv.clearFirestore();
  });

  test("Anonymous (unauthenticated) users cannot read or write anything", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthedDb.doc("shops/g10").get());
    await assertFails(unauthedDb.doc("shops/g10").set({ shop_name: "Hacked" }));
    await assertFails(unauthedDb.doc("shops_private/g10").get());
    await assertFails(unauthedDb.collection("setup_codes").get());
    await assertFails(unauthedDb.collection("rate_limits").get());
  });

  test("Shops Private and Setup Codes are blocked from ALL clients (even Admin and Owner)", async () => {
    const adminDb = testEnv.authenticatedContext("admin_uid", { admin: true }).firestore();
    const ownerDb = testEnv.authenticatedContext("owner_uid", { shopId: "g10" }).firestore();

    await assertFails(adminDb.doc("shops_private/g10").get());
    await assertFails(adminDb.doc("shops_private/g10").set({ pin_hash: "123" }));
    await assertFails(ownerDb.doc("shops_private/g10").get());
    await assertFails(ownerDb.doc("shops_private/g10").set({ pin_hash: "123" }));

    await assertFails(adminDb.doc("setup_codes/code1").get());
    await assertFails(ownerDb.doc("setup_codes/code1").get());
    await assertFails(adminDb.doc("rate_limits/rl1").get());
    await assertFails(ownerDb.doc("rate_limits/rl1").get());
  });

  test("Owner can read their own shop document, but stranger owner cannot", async () => {
    // Seed shop data via admin context (bypassing rules)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("shops/g10").set({
        shop_name: "Ali Mart",
        status: "active",
      });
    });

    const ownerG10 = testEnv.authenticatedContext("owner1", { shopId: "g10" }).firestore();
    const ownerF7 = testEnv.authenticatedContext("owner2", { shopId: "f7" }).firestore();
    const admin = testEnv.authenticatedContext("admin1", { admin: true }).firestore();

    await assertSucceeds(ownerG10.doc("shops/g10").get());
    await assertSucceeds(admin.doc("shops/g10").get());
    await assertFails(ownerF7.doc("shops/g10").get());

    // Browsers can NEVER write to shop document directly
    await assertFails(ownerG10.doc("shops/g10").update({ today_sale: 999999 }));
    await assertFails(admin.doc("shops/g10").update({ status: "active" }));
  });

  test("Active owner can read expenses and bills, but expired owner is blocked", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("shops/g10").set({ status: "active" });
      await context.firestore().doc("shops/g10/expenses/exp1").set({ amount: 500 });
      await context.firestore().doc("shops/g10/bills/bill1").set({ total: 1200 });
      await context.firestore().doc("shops/g10/alerts/alert1").set({ type: "deleted" });

      await context.firestore().doc("shops/expired_shop").set({ status: "expired" });
      await context.firestore().doc("shops/expired_shop/expenses/exp2").set({ amount: 300 });
    });

    const activeOwner = testEnv.authenticatedContext("owner_active", { shopId: "g10" }).firestore();
    const expiredOwner = testEnv.authenticatedContext("owner_exp", { shopId: "expired_shop" }).firestore();
    const admin = testEnv.authenticatedContext("admin1", { admin: true }).firestore();

    // Active owner can read
    await assertSucceeds(activeOwner.doc("shops/g10/expenses/exp1").get());
    await assertSucceeds(activeOwner.doc("shops/g10/bills/bill1").get());
    await assertSucceeds(activeOwner.doc("shops/g10/alerts/alert1").get());

    // Expired owner is blocked from reading expenses (lock screen)
    await assertFails(expiredOwner.doc("shops/expired_shop/expenses/exp2").get());

    // But expired owner CAN still read their root shop profile for the lock screen
    await assertSucceeds(expiredOwner.doc("shops/expired_shop").get());

    // Admin can always read even expired shop data
    await assertSucceeds(admin.doc("shops/expired_shop/expenses/exp2").get());

    // No client can write to bills, expenses or alerts directly
    await assertFails(activeOwner.doc("shops/g10/expenses/exp1").delete());
    await assertFails(activeOwner.doc("shops/g10/bills/bill1").update({ total: 0 }));
    await assertFails(activeOwner.doc("shops/g10/alerts/alert1").delete());
  });

  test("Khata collections are readable only by active owner, no direct client writes", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("shops/g10").set({ status: "active" });
      await context.firestore().doc("shops/g10/khata_customers/cust1").set({ name: "Aslam", balance: 100 });
      await context.firestore().doc("shops/g10/khata_customers/cust1/entries/ent1").set({ amount: 100, type: "udhaar" });
    });

    const activeOwner = testEnv.authenticatedContext("owner_g10", { shopId: "g10" }).firestore();

    await assertSucceeds(activeOwner.doc("shops/g10/khata_customers/cust1").get());
    await assertSucceeds(activeOwner.doc("shops/g10/khata_customers/cust1/entries/ent1").get());

    // Balance cannot be manipulated directly by client
    await assertFails(activeOwner.doc("shops/g10/khata_customers/cust1").update({ balance: 0 }));
    await assertFails(activeOwner.doc("shops/g10/khata_customers/cust1/entries/ent1").delete());
  });
});
