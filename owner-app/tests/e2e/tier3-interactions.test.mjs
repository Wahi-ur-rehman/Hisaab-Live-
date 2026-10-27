/**
 * Tier 3: Cross-Feature Interactions
 * Tests dynamic state coupling between features:
 * - Adding/deleting expenses updating Today's Net Profit
 * - Recording Khata entries/payments altering receivables balance
 * - Language switching cascading across tabs, modals, and text direction
 * - Theme mode synchronization across components
 * - Tamper alerts mutating Hisaab KPI cards and resolution flows
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTING_CONTRACT, NAVIGATION_CONTRACT } from './helpers/contracts.mjs';
import { HisaabStateEngine } from './helpers/state-engine.mjs';
import { StaticAuditor } from './helpers/static-auditor.mjs';

describe('Tier 3: Cross-Feature Interactions', () => {

  // --- T3.1 & T3.2: Expenses Mutation Dynamic Net Profit Coupling ---
  describe('Expenses Mutation and Net Profit Coupling', () => {
    test('Sequential expense additions immediately decrease Today Net Profit in lockstep', () => {
      const initialSale = 100000;
      const engine = new HisaabStateEngine({
        shopOverrides: { today_sale: initialSale },
        expenses: [],
      });

      assert.equal(engine.todayNetProfit, 100000, 'Initial net profit equals gross sales');

      // Add Expense 1 (Chai / Pani)
      const exp1 = engine.addExpense({ title: 'Morning Tea', amount: 450, category: 'Chai / Pani' });
      assert.equal(engine.todayTotalExpenses, 450);
      assert.equal(engine.todayNetProfit, 99550, 'Net profit should decrease by 450');

      // Add Expense 2 (Maintenance)
      const exp2 = engine.addExpense({ title: 'Generator Repair', amount: 2550, category: 'Maintenance' });
      assert.equal(engine.todayTotalExpenses, 3000);
      assert.equal(engine.todayNetProfit, 97000, 'Net profit should decrease by 2550');

      // Add Expense 3 (Rent)
      const exp3 = engine.addExpense({ title: 'Shop Advance Rent', amount: 35000, category: 'Dukaan Kiraya' });
      assert.equal(engine.todayTotalExpenses, 38000);
      assert.equal(engine.todayNetProfit, 62000, 'Net profit should decrease by 35000');
    });

    test('Deleting an expense restores Today Net Profit by the exact deleted amount', () => {
      const engine = new HisaabStateEngine({
        shopOverrides: { today_sale: 85000 },
        expenses: [],
      });

      const exp1 = engine.addExpense({ title: 'Electric Bill', amount: 15000, category: 'Bijli / Bills' });
      const exp2 = engine.addExpense({ title: 'Delivery Rickshaw', amount: 2000, category: 'Transport / Rickshaw' });

      assert.equal(engine.todayTotalExpenses, 17000);
      assert.equal(engine.todayNetProfit, 68000);

      // Delete the 15,000 electricity expense
      const deleted = engine.deleteExpense(exp1.id);
      assert.equal(deleted.amount, 15000);

      // Net profit must immediately restore to 83,000 (85,000 - 2,000)
      assert.equal(engine.todayTotalExpenses, 2000);
      assert.equal(engine.todayNetProfit, 83000);
    });

    test('Category breakdown table updates dynamically when expenses are added and removed', () => {
      const engine = new HisaabStateEngine({ expenses: [] });

      const expA = engine.addExpense({ title: 'Chai 1', amount: 300, category: 'Chai / Pani' });
      const expB = engine.addExpense({ title: 'Chai 2', amount: 200, category: 'Chai / Pani' });
      const expC = engine.addExpense({ title: 'Bulb', amount: 500, category: 'Maintenance' });

      let breakdown = engine.getExpensesByCategory();
      assert.equal(breakdown['Chai / Pani'], 500);
      assert.equal(breakdown['Maintenance'], 500);

      engine.deleteExpense(expA.id);
      breakdown = engine.getExpensesByCategory();
      assert.equal(breakdown['Chai / Pani'], 200);
    });
  });

  // --- T3.3: Khata Multi-Customer Lifecycle & Live Receivables Tracking ---
  describe('Khata Multi-Customer Lifecycle & Live Receivables Tracking', () => {
    test('End-to-end multi-customer credit and payment sequence maintains accurate positive receivables', () => {
      const engine = new HisaabStateEngine({ customers: [], entries: {} });

      // Step 1: Add Customer A & Customer B
      const custA = engine.addCustomer({ name: 'Muhammad Tariq', phone: '0345-1234567' });
      const custB = engine.addCustomer({ name: 'Haji Rasheed', phone: '0300-7654321' });
      assert.equal(engine.totalKhataReceivables, 0, 'No debt yet');

      // Step 2: Customer A takes Udhaar of Rs. 6,000
      engine.addKhataEntry({ customerId: custA.id, type: 'udhaar', amount: 6000, note: 'Ration' });
      assert.equal(custA.balance, 6000);
      assert.equal(engine.totalKhataReceivables, 6000);

      // Step 3: Customer B takes Udhaar of Rs. 10,000
      engine.addKhataEntry({ customerId: custB.id, type: 'udhaar', amount: 10000, note: 'Sugar sack' });
      assert.equal(custB.balance, 10000);
      assert.equal(engine.totalKhataReceivables, 16000);

      // Step 4: Customer A pays partial cash of Rs. 2,500
      engine.addKhataEntry({ customerId: custA.id, type: 'payment', amount: 2500, note: 'Partial Cash' });
      assert.equal(custA.balance, 3500);
      assert.equal(engine.totalKhataReceivables, 13500); // 3500 + 10000

      // Step 5: Customer B settles in full (Rs. 10,000)
      engine.addKhataEntry({ customerId: custB.id, type: 'payment', amount: 10000, note: 'Full settlement' });
      assert.equal(custB.balance, 0);
      assert.equal(engine.totalKhataReceivables, 3500); // Only Customer A's 3500 remains

      // Step 6: Customer A overpays by Rs. 5,000 (Advance)
      const advanceEntry = engine.addKhataEntry({ customerId: custA.id, type: 'payment', amount: 5000, note: 'Advance' });
      assert.equal(custA.balance, -1500, 'Customer A now has advance credit of Rs. 1500');
      assert.equal(engine.totalKhataReceivables, 0, 'No receivables left because all debts cleared');

      // Step 7: Deleting the advance payment entry restores Customer A balance to 3,500
      engine.deleteKhataEntry(custA.id, advanceEntry.entry.id);
      assert.equal(custA.balance, 3500);
      assert.equal(engine.totalKhataReceivables, 3500);
    });
  });

  // --- T3.4: Bilingual Switching & RTL Integration Across Modals ---
  describe('Bilingual Switching & Dynamic RTL Synchronization', () => {
    test('Language toggle updates text direction, active tab translations, and modal labels', () => {
      const engine = new HisaabStateEngine({ initialLang: 'en' });

      // English verification
      assert.equal(engine.lang, 'en');
      assert.equal(engine.isRtl, false);
      assert.equal(engine.textDirection, 'ltr');
      assert.equal(NAVIGATION_CONTRACT.tabLabelsEn.hisaab, 'Live Hisaab');
      assert.equal(NAVIGATION_CONTRACT.tabLabelsEn.khata, 'Khata Ledger');

      // Switch to Urdu
      engine.toggleLanguage();
      assert.equal(engine.lang, 'ur');
      assert.equal(engine.isRtl, true);
      assert.equal(engine.textDirection, 'rtl');
      assert.equal(NAVIGATION_CONTRACT.tabLabelsUr.hisaab, 'لائیو حساب');
      assert.equal(NAVIGATION_CONTRACT.tabLabelsUr.expenses, 'اخراجات');
      assert.equal(NAVIGATION_CONTRACT.tabLabelsUr.khata, 'کھاتہ لیجر');
      assert.equal(NAVIGATION_CONTRACT.tabLabelsUr.reports, 'ماہانہ رپورٹ');

      // Switch back to English
      engine.toggleLanguage();
      assert.equal(engine.lang, 'en');
      assert.equal(engine.textDirection, 'ltr');
    });

    test('All 4 navigation tabs maintain bidirectional English/Urdu mapping', () => {
      for (const tab of NAVIGATION_CONTRACT.requiredTabs) {
        assert.ok(NAVIGATION_CONTRACT.tabLabelsEn[tab], `Missing EN label for ${tab}`);
        assert.ok(NAVIGATION_CONTRACT.tabLabelsUr[tab], `Missing UR label for ${tab}`);
      }
    });
  });

  // --- T3.5: Theme Synchronization & DOM Classes ---
  describe('Theme Mode Cross-Component Synchronization', () => {
    test('HTML pre-hydration script in index.html reads localStorage and applies dark/light classes', () => {
      const html = StaticAuditor.readIndexHtml();
      assert.match(html, /localStorage\.getItem\(['"]hl_theme['"]\)/, 'index.html must check saved theme in localStorage');
      assert.match(html, /classList\.add\(['"]dark['"]/, 'index.html must add dark class');
      assert.match(html, /ion-palette-dark/, 'index.html must synchronize ion-palette-dark');
    });

    test('Theme toggle cycles reliably between dark and light modes', () => {
      const engine = new HisaabStateEngine({ initialTheme: 'dark' });
      assert.equal(engine.themeMode, 'dark');

      engine.toggleTheme();
      assert.equal(engine.themeMode, 'light');

      engine.toggleTheme();
      assert.equal(engine.themeMode, 'dark');
    });
  });

  // --- T3.6: Tamper Alerts Interaction with Live Hisaab ---
  describe('Tamper Alerts Interaction with Live Hisaab', () => {
    test('Today Missing sales discrepancy generates visible anomaly banner and resolves upon acknowledgment', () => {
      const engine = new HisaabStateEngine({
        shopOverrides: {
          today_sale: 65000,
          today_missing: 4000, // Cashier deleted Rs. 4,000 bill
        },
      });

      assert.equal(engine.todayMissing, 4000);
      assert.ok(engine.todayMissing > 0, 'Tamper alert should be active');

      // Check unseen alerts
      const unseenBefore = engine.alerts.filter((a) => !a.seen).length;
      assert.ok(unseenBefore > 0, 'Should have unseen tamper alerts');

      // Acknowledge all alerts
      const clearedCount = engine.acknowledgeAllAlerts();
      assert.equal(clearedCount, unseenBefore);

      const unseenAfter = engine.alerts.filter((a) => !a.seen).length;
      assert.equal(unseenAfter, 0, 'All alerts should now be marked as seen');
    });
  });
});
