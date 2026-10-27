/**
 * Tier 1: Feature Coverage (Happy Paths)
 * Tests all core features across R1, R2, R3, R4 as defined in PROJECT.md and ORIGINAL_REQUEST.md
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_SYSTEM_CONTRACT,
  NAVIGATION_CONTRACT,
  SAFE_AREA_CONTRACT,
  ACCOUNTING_CONTRACT,
} from './helpers/contracts.mjs';
import { HisaabStateEngine } from './helpers/state-engine.mjs';
import { StaticAuditor } from './helpers/static-auditor.mjs';
import { PdfStatementVerifier } from './helpers/pdf-verifier.mjs';

describe('Tier 1: Feature Coverage (Happy Paths)', () => {

  // --- R3: Safe Area & Viewport ---
  describe('R3: Mobile Safe Area & Viewport Configuration', () => {
    test('index.html contains viewport-fit=cover to enable notch safe-areas', () => {
      const { hasViewportFit } = StaticAuditor.auditViewportMeta();
      assert.equal(hasViewportFit, true, 'index.html must include viewport-fit=cover');
    });

    test('index.html sets theme-color to Deep Slate (#090d16)', () => {
      const { hasThemeColor } = StaticAuditor.auditViewportMeta();
      assert.equal(hasThemeColor, true, 'index.html must set theme-color to #090d16');
    });

    test('index.css declares safe area custom property fallbacks (--sat, --sab)', () => {
      const css = StaticAuditor.readIndexCss();
      for (const v of SAFE_AREA_CONTRACT.cssVariables) {
        assert.match(css, new RegExp(v), `index.css must define ${v} fallback`);
      }
    });
  });

  // --- R2: Soft-Modern Minimalist Deep Slate Color System ---
  describe('R2: Soft-Modern Minimalist Deep Slate Color System', () => {
    test('tailwind.config.js defines Deep Slate base and card tokens', () => {
      const { hasBaseSlate, hasCardSlate, hasBorderSlate } = StaticAuditor.auditTailwindTokens();
      assert.equal(hasBaseSlate, true, 'tailwind config must define slate-base');
      assert.equal(hasCardSlate, true, 'tailwind config must define slate-card');
      assert.equal(hasBorderSlate, true, 'tailwind config must define slate-border');
    });

    test('tailwind.config.js defines required semantic accent colors', () => {
      const { hasEmerald, hasAmber, hasRose, hasSkyCyan } = StaticAuditor.auditTailwindTokens();
      assert.equal(hasEmerald, true, 'must define emerald-mint (#10b981) for sales/payments');
      assert.equal(hasAmber, true, 'must define amber-warm (#f59e0b) for Khata receivables');
      assert.equal(hasRose, true, 'must define rose-crimson (#f43f5e) for expenses/alerts');
      assert.equal(hasSkyCyan, true, 'must define sky-cyan (#38bdf8) for brand accents');
    });

    test('Ionic theme variables.css maps to Deep Slate palette tokens', () => {
      const audit = StaticAuditor.auditVariablesCss();
      assert.equal(audit.exists, true, 'src/theme/variables.css must exist');
      assert.equal(audit.hasPrimaryCyan, true, 'variables.css primary must be Sky Cyan #38bdf8');
      assert.equal(audit.hasSuccessEmerald, true, 'variables.css success must be Emerald Mint #10b981');
      assert.equal(audit.hasWarningAmber, true, 'variables.css warning must be Warm Amber #f59e0b');
      assert.equal(audit.hasDangerRose, true, 'variables.css danger must be Rose Crimson #f43f5e');
    });

    test('Dark mode toggling synchronizes theme mode state', () => {
      const engine = new HisaabStateEngine({ initialTheme: 'dark' });
      assert.equal(engine.themeMode, 'dark');
      const nextTheme = engine.toggleTheme();
      assert.equal(nextTheme, 'light');
      assert.equal(engine.themeMode, 'light');
      engine.toggleTheme();
      assert.equal(engine.themeMode, 'dark');
    });
  });

  // --- R1: Hybrid Ionic + Tailwind Mobile UI Architecture ---
  describe('R1: Hybrid Ionic + Tailwind Mobile UI Architecture', () => {
    test('4-Tab navigation shell covers all required operational views', () => {
      const engine = new HisaabStateEngine();
      for (const tab of NAVIGATION_CONTRACT.requiredTabs) {
        const active = engine.setActiveTab(tab);
        assert.equal(active, tab, `Engine must support switching to ${tab} tab`);
      }
      assert.equal(NAVIGATION_CONTRACT.requiredTabs.length, 4);
      assert.deepEqual(NAVIGATION_CONTRACT.requiredTabs, ['hisaab', 'expenses', 'khata', 'reports']);
    });

    test('Modal lifecycle handles open and close transitions', () => {
      const engine = new HisaabStateEngine();
      assert.equal(engine.activeModal, null);
      engine.openModal('expense_add_modal');
      assert.equal(engine.activeModal, 'expense_add_modal');
      engine.closeModal();
      assert.equal(engine.activeModal, null);
    });
  });

  // --- R4: Complete Functional & Data Integrity (Happy Paths) ---
  describe('R4: Functional Data Integrity (Happy Paths)', () => {
    test('Today Net Profit (Munafa) calculates as Today Sale minus Today Expenses', () => {
      const engine = new HisaabStateEngine({
        shopOverrides: { today_sale: 68500 },
        expenses: [
          { id: 'e1', amount: 2500, category: 'Maintenance', date: ACCOUNTING_CONTRACT.todayPK() },
          { id: 'e2', amount: 450, category: 'Chai / Pani', date: ACCOUNTING_CONTRACT.todayPK() },
          { id: 'e3', amount: 1500, category: 'Staff / Tankhwa', date: ACCOUNTING_CONTRACT.todayPK() },
          { id: 'e4', amount: 600, category: 'Transport / Rickshaw', date: ACCOUNTING_CONTRACT.todayPK() },
        ],
      });

      assert.equal(engine.todaySale, 68500);
      assert.equal(engine.todayTotalExpenses, 5050);
      assert.equal(engine.todayNetProfit, 63450); // 68500 - 5050
    });

    test('Expense creation and direct deletion update expense state cleanly', () => {
      const engine = new HisaabStateEngine({ expenses: [] });
      assert.equal(engine.todayTotalExpenses, 0);

      const added = engine.addExpense({
        title: 'Electricity Bill',
        amount: 3200,
        category: 'Bijli / Bills',
      });

      assert.ok(added.id, 'Expense must receive an ID');
      assert.equal(added.amount, 3200);
      assert.equal(added.category, 'Bijli / Bills');
      assert.equal(engine.todayTotalExpenses, 3200);

      const deleted = engine.deleteExpense(added.id);
      assert.equal(deleted.id, added.id);
      assert.equal(engine.todayTotalExpenses, 0);
    });

    test('Khata customer creation and Udhaar/Payment entries update balance and receivables', () => {
      const engine = new HisaabStateEngine({ customers: [], entries: {} });
      assert.equal(engine.totalKhataReceivables, 0);

      // Add customer
      const customer = engine.addCustomer({ name: 'Haji Rasheed', phone: '0300-1234567' });
      assert.equal(customer.balance, 0);

      // Udhaar entry (customer takes goods on credit)
      const udhaar = engine.addKhataEntry({
        customerId: customer.id,
        type: 'udhaar',
        amount: 5000,
        note: 'Cooking Oil & Flour',
      });
      assert.equal(udhaar.updatedBalance, 5000);
      assert.equal(engine.totalKhataReceivables, 5000);

      // Payment entry (customer pays cash)
      const payment = engine.addKhataEntry({
        customerId: customer.id,
        type: 'payment',
        amount: 2000,
        note: 'Cash payment',
      });
      assert.equal(payment.updatedBalance, 3000);
      assert.equal(engine.totalKhataReceivables, 3000);
    });

    test('1-Tap Monthly Statement PDF generation produces valid jsPDF document', () => {
      const pdfResult = PdfStatementVerifier.generateAndVerify({
        shopName: 'Al-Madina Super Store',
        shopCode: 'G10',
        month: 'October 2026',
        sale: 1500000,
        expense: 120000,
        profit: 1380000,
        margin: '92.0',
        catBreakdown: [
          { name: 'Dukaan Kiraya', total: 35000 },
          { name: 'Staff / Tankhwa', total: 46000 },
          { name: 'Bijli / Bills', total: 18000 },
        ],
        items: [],
      });

      assert.equal(pdfResult.success, true);
      assert.equal(pdfResult.totalPages >= 1, true);
      assert.equal(pdfResult.byteLength > 1000, true);
      assert.equal(pdfResult.cardsCount, 4);
    });

    test('Bilingual dictionary schema contains English keys and validates Language switching', () => {
      const lang = StaticAuditor.readLanguageJson();
      assert.ok(lang.en, 'language.json must have en root');
      assert.ok(lang.en.total_sale, 'en must have total_sale key');
      assert.ok(lang.en.profit, 'en must have profit key');
      assert.ok(lang.en.tab_hisaab, 'en must have tab_hisaab key');
      assert.ok(lang.en.tab_khata, 'en must have tab_khata key');

      // Test state engine language toggle and RTL direction
      const engine = new HisaabStateEngine({ initialLang: 'en' });
      assert.equal(engine.lang, 'en');
      assert.equal(engine.isRtl, false);
      assert.equal(engine.textDirection, 'ltr');

      engine.toggleLanguage();
      assert.equal(engine.lang, 'ur');
      assert.equal(engine.isRtl, true);
      assert.equal(engine.textDirection, 'rtl');
    });
  });
});
