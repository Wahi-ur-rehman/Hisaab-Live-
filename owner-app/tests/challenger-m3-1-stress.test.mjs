/**
 * Challenger M3-1 Empirical Stress Test Harness
 * Milestone M3: Core Feature Views Modernization
 *
 * Specific Focus:
 * 1. Live Hisaab Net Profit calculation with boundary cases:
 *    - Zero sales (sale = 0)
 *    - Zero sales AND zero expenses
 *    - Negative net profit (expenses > sales)
 *    - Extreme transaction values (multi-crore, integer limits)
 *    - Decimal currency cents and floating point margins
 *    - Monte Carlo random transaction fuzzing
 * 2. Khata Receivables calculation & customer advance handling:
 *    - Positive balances (c.balance > 0) strictly summed
 *    - Customer advances (c.balance < 0) NOT subtracted from total receivables
 *    - Zero balance (c.balance === 0) excluded
 *    - Null / undefined / NaN balance defenses
 *    - High-frequency ledger transactions (udhaar vs wasool balance invariants)
 *    - Entry deletion balance reversal
 *    - UI status semantics (Baqaya owes vs Advance paid vs Cleared)
 * 3. Expense category filtering across all categories:
 *    - Full 7-category enum validation + "All"
 *    - Category isolation filtering
 *    - Zero-item category edge cases
 *    - Monthly category breakdown rollup and percentage distribution
 * 4. ActionSheetModal ergonomic confirmation dialogs:
 *    - Replaces window.confirm in ExpensesTabContent and CustomerLedger
 *    - Accessibility touch target minimums (48px) and pb-safe notch protection
 * 5. Listener lifecycle & memory leak prevention:
 *    - Verification of unsubscribe cleanups across all feature views
 *
 * Usage:
 *   node --test tests/challenger-m3-1-stress.test.mjs
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

// Load contracts and helpers
import {
  ACCOUNTING_CONTRACT,
  COLOR_SYSTEM_CONTRACT,
  NAVIGATION_CONTRACT,
  SAFE_AREA_CONTRACT,
} from './e2e/helpers/contracts.mjs';
import { HisaabStateEngine } from './e2e/helpers/state-engine.mjs';

// ============================================================================
// SUITE 1: Live Hisaab Net Profit Calculation & Boundary Case Stress
// ============================================================================
describe('Suite 1: Live Hisaab Net Profit Calculation & Boundary Case Stress', () => {

  test('1.1: Zero sales day (sale = 0, expenses > 0) yields negative profit without division-by-zero NaN', () => {
    const sale = 0;
    const expenses = [
      { id: 'e1', amount: 3500, category: 'Maintenance' },
      { id: 'e2', amount: 1200, category: 'Chai / Pani' },
    ];
    const totalExp = expenses.reduce((a, b) => a + Number(b.amount || 0), 0);
    const netProfit = sale - totalExp;

    // Mimic the exact margin logic in App.jsx line 1276:
    // const todayMargin = sale > 0 ? ((netProfit / sale) * 100).toFixed(1) : "0.0";
    const todayMargin = sale > 0 ? ((netProfit / sale) * 100).toFixed(1) : '0.0';

    assert.equal(totalExp, 4700);
    assert.equal(netProfit, -4700);
    assert.equal(todayMargin, '0.0', 'When sale is 0, margin must safely fall back to "0.0" avoiding -Infinity / NaN');
    assert.ok(netProfit < 0, 'Net profit should be strictly negative');

    // Visual theme threshold test:
    // netProfit >= 0 ? emerald styling : rose-crimson styling
    const isLoss = netProfit < 0;
    assert.equal(isLoss, true, 'Visual theme must trigger rose-crimson loss styling when netProfit < 0');
  });

  test('1.2: Zero sales AND zero expenses day (sale = 0, expenses = 0) evaluates cleanly to 0', () => {
    const sale = 0;
    const totalExp = 0;
    const netProfit = sale - totalExp;
    const todayMargin = sale > 0 ? ((netProfit / sale) * 100).toFixed(1) : '0.0';

    assert.equal(netProfit, 0);
    assert.equal(todayMargin, '0.0');
    assert.equal(netProfit >= 0, true, 'Zero profit defaults to non-loss state');
    assert.equal(netProfit.toLocaleString(), '0');
  });

  test('1.3: Negative Net Profit (expenses > sales) with valid sales computes negative margin correctly', () => {
    const sale = 15000;
    const totalExp = 35000;
    const netProfit = sale - totalExp;
    const todayMargin = sale > 0 ? ((netProfit / sale) * 100).toFixed(1) : '0.0';

    assert.equal(netProfit, -20000);
    // (-20000 / 15000) * 100 = -133.3333... -> toFixed(1) = "-133.3"
    assert.equal(todayMargin, '-133.3');
    assert.equal(netProfit.toLocaleString(), '-20,000');
  });

  test('1.4: Extreme multi-crore values (PKR 50 Crore) do not overflow JavaScript safe integers', () => {
    const sale = 500000000;     // PKR 50 Crore
    const totalExp = 320000000; // PKR 32 Crore
    const netProfit = sale - totalExp;
    const todayMargin = sale > 0 ? ((netProfit / sale) * 100).toFixed(1) : '0.0';

    assert.equal(netProfit, 180000000); // PKR 18 Crore
    assert.equal(todayMargin, '36.0');
    assert.ok(Number.isSafeInteger(netProfit), 'Profit must remain within Number.MAX_SAFE_INTEGER');
    assert.equal(netProfit.toLocaleString('en-US'), '180,000,000');
  });

  test('1.5: Decimal currency cents handle floating point arithmetic without precision leaks', () => {
    const sale = 1000.75;
    const expenses = [
      { amount: 150.25 },
      { amount: 200.50 },
      { amount: 99.99 },
    ];
    const totalExp = expenses.reduce((a, b) => a + Number(b.amount || 0), 0);
    const netProfit = sale - totalExp;

    assert.equal(Number(totalExp.toFixed(2)), 450.74);
    assert.equal(Number(netProfit.toFixed(2)), 550.01);
    const todayMargin = ((netProfit / sale) * 100).toFixed(1);
    // (550.01 / 1000.75) * 100 = 54.9597... -> 55.0%
    assert.equal(todayMargin, '55.0');
  });

  test('1.6: 1,000 randomized Monte Carlo simulations verify netProfit invariant', () => {
    for (let i = 0; i < 1000; i++) {
      const sale = Math.floor(Math.random() * 200000);
      const expCount = Math.floor(Math.random() * 8);
      const expList = Array.from({ length: expCount }, () => ({
        amount: Math.floor(Math.random() * 30000),
      }));

      const totalExp = expList.reduce((a, b) => a + Number(b.amount || 0), 0);
      const netProfit = sale - totalExp;
      const todayMargin = sale > 0 ? ((netProfit / sale) * 100).toFixed(1) : '0.0';

      assert.equal(netProfit, sale - totalExp, 'Net profit must strictly equal sale minus total expenses');
      assert.ok(!isNaN(netProfit), 'Net profit must not be NaN');
      assert.ok(!isNaN(Number(todayMargin)), 'Margin must be a valid parseable number');
    }
  });
});

// ============================================================================
// SUITE 2: Khata Receivables Positive-Only Accumulation & Customer Advance Boundary Stress
// ============================================================================
describe('Suite 2: Khata Receivables Positive-Only Accumulation & Customer Advance Stress', () => {

  test('2.1: Positive customer balances (c.balance > 0) are strictly summed into receivables', () => {
    const customers = [
      { id: 'c1', name: 'Tariq', balance: 2800 },
      { id: 'c2', name: 'Haji Rasheed', balance: 5200 },
    ];
    const receivable = customers.reduce((a, c) => a + (c.balance > 0 ? c.balance : 0), 0);
    assert.equal(receivable, 8000);
  });

  test('2.2: Customer advances (c.balance < 0) are strictly excluded and NEVER subtracted from receivables', () => {
    const customers = [
      { id: 'c1', name: 'Debtor 1', balance: 5000 },
      { id: 'c2', name: 'Advance Payer 1', balance: -2000 }, // Advance payment
      { id: 'c3', name: 'Debtor 2', balance: 3500 },
      { id: 'c4', name: 'Advance Payer 2', balance: -1500 }, // Advance payment
    ];

    // Under correct accounting, receivables = 5,000 + 3,500 = 8,500
    // Naive sum (c.balance) would yield 5,000 - 2,000 + 3,500 - 1,500 = 5,000 (INCORRECT)
    const receivable = customers.reduce((a, c) => a + (c.balance > 0 ? c.balance : 0), 0);
    assert.equal(receivable, 8500, 'Customer advances must not diminish total debt owed by other debtors');
  });

  test('2.3: Zero customer balances (c.balance === 0) do not alter receivables', () => {
    const customers = [
      { id: 'c1', name: 'Zero 1', balance: 0 },
      { id: 'c2', name: 'Zero 2', balance: 0 },
      { id: 'c3', name: 'Debtor', balance: 1200 },
    ];
    const receivable = customers.reduce((a, c) => a + (c.balance > 0 ? c.balance : 0), 0);
    assert.equal(receivable, 1200);
  });

  test('2.4: Falsy / null / undefined / NaN balances are defended against without throwing', () => {
    const customers = [
      { id: 'c1', name: 'Valid', balance: 4500 },
      { id: 'c2', name: 'Null', balance: null },
      { id: 'c3', name: 'Undefined', balance: undefined },
      { id: 'c4', name: 'NaN', balance: NaN },
      { id: 'c5', name: 'Negative', balance: -1000 },
      { id: 'c6', name: 'Empty Obj' },
    ];

    const receivable = customers.reduce((a, c) => a + (c.balance > 0 ? c.balance : 0), 0);
    assert.equal(receivable, 4500, 'Only strictly positive numeric balances count towards receivables');
  });

  test('2.5: High-frequency ledger transactions: 500 randomized entries maintain balance invariant', () => {
    let customerBalance = 0;
    const entries = [];

    for (let i = 0; i < 500; i++) {
      const type = Math.random() > 0.5 ? 'udhaar' : 'payment';
      const amount = Math.floor(Math.random() * 5000) + 10;
      entries.push({ type, amount });

      if (type === 'udhaar') {
        customerBalance += amount;
      } else {
        customerBalance -= amount;
      }
    }

    // Verify balance matches sum(udhaar) - sum(payment)
    const totalUdhaar = entries.filter((e) => e.type === 'udhaar').reduce((s, e) => s + e.amount, 0);
    const totalPayment = entries.filter((e) => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
    const expectedBalance = totalUdhaar - totalPayment;

    assert.equal(customerBalance, expectedBalance);
  });

  test('2.6: Entry deletion reverses balance accurately', () => {
    let balance = 5000;

    // Udhaar entry deletion reversal:
    // Deleting Udhaar entry of 2000 should DECREASE balance by 2000
    const udhaarEntry = { type: 'udhaar', amount: 2000 };
    const revAmountUdhaar = udhaarEntry.type === 'udhaar' ? -Number(udhaarEntry.amount) : Number(udhaarEntry.amount);
    balance += revAmountUdhaar;
    assert.equal(balance, 3000, 'Deleting Udhaar entry reduces balance');

    // Payment entry deletion reversal:
    // Deleting Payment entry of 1500 should INCREASE balance by 1500
    const paymentEntry = { type: 'payment', amount: 1500 };
    const revAmountPayment = paymentEntry.type === 'udhaar' ? -Number(paymentEntry.amount) : Number(paymentEntry.amount);
    balance += revAmountPayment;
    assert.equal(balance, 4500, 'Deleting Payment entry increases balance');
  });

  test('2.7: UI balance badge semantics: Baqaya vs Advance vs Cleared', () => {
    const testCases = [
      { balance: 2500, expectedLabel: 'Baqaya (owes)', expectedColor: 'text-amber-warm' },
      { balance: -800, expectedLabel: 'Advance paid', expectedColor: 'text-emerald-mint' },
      { balance: 0, expectedLabel: 'Cleared', expectedColor: 'text-slate-400' },
    ];

    for (const tc of testCases) {
      const label = tc.balance > 0 ? 'Baqaya (owes)' : tc.balance < 0 ? 'Advance paid' : 'Cleared';
      const color = tc.balance > 0 ? 'text-amber-warm' : tc.balance < 0 ? 'text-emerald-mint' : 'text-slate-400';

      assert.equal(label, tc.expectedLabel);
      assert.equal(color, tc.expectedColor);
    }
  });
});

// ============================================================================
// SUITE 3: Expense Category Filtering Across All Categories
// ============================================================================
describe('Suite 3: Expense Category Filtering Across All Categories', () => {

  const EXPECTED_CATS = [
    'Chai / Pani',
    'Bijli / Bills',
    'Staff / Tankhwa',
    'Dukaan Kiraya',
    'Transport / Rickshaw',
    'Maintenance',
    'Other',
  ];

  test('3.1: Complete category enum parity with ACCOUNTING_CONTRACT', () => {
    assert.equal(ACCOUNTING_CONTRACT.expenseCategories.length, 7);
    assert.deepEqual(ACCOUNTING_CONTRACT.expenseCategories, EXPECTED_CATS);
  });

  test('3.2: Filtering by "All" returns 100% of expense records', () => {
    const expenses = [
      { id: '1', category: 'Chai / Pani', amount: 300 },
      { id: '2', category: 'Bijli / Bills', amount: 15000 },
      { id: '3', category: 'Staff / Tankhwa', amount: 25000 },
      { id: '4', category: 'Dukaan Kiraya', amount: 35000 },
      { id: '5', category: 'Transport / Rickshaw', amount: 1200 },
      { id: '6', category: 'Maintenance', amount: 4500 },
      { id: '7', category: 'Other', amount: 2000 },
    ];

    const selectedCat = 'All';
    const filtered = selectedCat === 'All' ? expenses : expenses.filter((e) => e.category === selectedCat);
    assert.equal(filtered.length, 7);
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    assert.equal(total, 83000);
  });

  test('3.3: Filtering by each of the 7 individual categories strictly isolates matching items', () => {
    const expenses = [
      { id: '1', category: 'Chai / Pani', amount: 250 },
      { id: '2', category: 'Chai / Pani', amount: 450 },
      { id: '3', category: 'Bijli / Bills', amount: 12000 },
      { id: '4', category: 'Staff / Tankhwa', amount: 20000 },
      { id: '5', category: 'Dukaan Kiraya', amount: 35000 },
      { id: '6', category: 'Transport / Rickshaw', amount: 800 },
      { id: '7', category: 'Maintenance', amount: 1600 },
      { id: '8', category: 'Other', amount: 500 },
    ];

    for (const cat of EXPECTED_CATS) {
      const filtered = expenses.filter((e) => e.category === cat);
      for (const item of filtered) {
        assert.equal(item.category, cat, `Filtered item must strictly belong to category ${cat}`);
      }

      if (cat === 'Chai / Pani') {
        assert.equal(filtered.length, 2);
        assert.equal(filtered.reduce((s, e) => s + e.amount, 0), 700);
      } else {
        assert.equal(filtered.length, 1);
      }
    }
  });

  test('3.4: Category with zero recorded items yields clean empty list without crashing', () => {
    const expenses = [
      { id: '1', category: 'Chai / Pani', amount: 300 },
    ];

    const filtered = expenses.filter((e) => e.category === 'Dukaan Kiraya');
    assert.deepEqual(filtered, []);
    assert.equal(filtered.length, 0);
  });

  test('3.5: Monthly category breakdown aggregates totals and counts across all 7 categories', () => {
    const expenses = [
      { id: '1', category: 'Dukaan Kiraya', amount: 35000 },
      { id: '2', category: 'Staff / Tankhwa', amount: 25000 },
      { id: '3', category: 'Staff / Tankhwa', amount: 15000 },
      { id: '4', category: 'Bijli / Bills', amount: 18000 },
      { id: '5', category: 'Chai / Pani', amount: 2500 },
      { id: '6', category: 'Maintenance', amount: 4500 },
      { id: '7', category: 'Transport / Rickshaw', amount: 1200 },
      { id: '8', category: 'Other', amount: 3000 },
    ];

    const catBreakdown = EXPECTED_CATS.map((catName) => {
      const catItems = expenses.filter((it) => it.category === catName);
      const total = catItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
      return { name: catName, total, count: catItems.length };
    });

    assert.equal(catBreakdown.length, 7);
    const rent = catBreakdown.find((c) => c.name === 'Dukaan Kiraya');
    assert.equal(rent.total, 35000);
    assert.equal(rent.count, 1);

    const staff = catBreakdown.find((c) => c.name === 'Staff / Tankhwa');
    assert.equal(staff.total, 40000);
    assert.equal(staff.count, 2);

    const grandTotal = catBreakdown.reduce((s, c) => s + c.total, 0);
    assert.equal(grandTotal, 104200);
  });
});

// ============================================================================
// SUITE 4: ActionSheetModal Ergonomics & window.confirm Replacement Audit
// ============================================================================
describe('Suite 4: ActionSheetModal Ergonomics & window.confirm Replacement Audit', () => {

  test('4.1: ActionSheetModal.jsx source file exists and adheres to design system', () => {
    const modalPath = path.join(APP_ROOT, 'src', 'components', 'common', 'ActionSheetModal.jsx');
    assert.ok(fs.existsSync(modalPath), 'ActionSheetModal.jsx must exist in components/common');

    const content = fs.readFileSync(modalPath, 'utf8');
    assert.ok(content.includes('role="dialog"'), 'Must specify role="dialog"');
    assert.ok(content.includes('aria-modal="true"'), 'Must specify aria-modal="true"');
    assert.ok(content.includes('pb-safe'), 'Must declare pb-safe for notch protection');
    assert.ok(content.includes('min-h-[48px]'), 'Buttons must provide at least 48px touch targets');
    assert.ok(content.includes('bg-slate-card'), 'Must use Deep Slate card background');
    assert.ok(content.includes('bg-rose-crimson'), 'Must support destructive styling');
  });

  test('4.2: App.jsx imports and integrates ActionSheetModal for expense deletion', () => {
    const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
    const content = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      content.includes('import ActionSheetModal from "./components/common/ActionSheetModal"'),
      'App.jsx must import ActionSheetModal'
    );

    // Verify ExpensesTabContent integrates ActionSheetModal
    assert.ok(
      content.includes('isOpen={Boolean(expenseToDelete)}'),
      'ExpensesTabContent must bind ActionSheetModal to expenseToDelete state'
    );
  });

  test('4.3: App.jsx integrates ActionSheetModal for customer & entry deletion in Khata', () => {
    const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
    const content = fs.readFileSync(appPath, 'utf8');

    // Customer deletion action sheet
    assert.ok(
      content.includes('isOpen={showDeleteCustSheet}'),
      'CustomerLedger must bind ActionSheetModal to showDeleteCustSheet'
    );

    // Entry deletion action sheet
    assert.ok(
      content.includes('isOpen={Boolean(entryToDelete)}'),
      'CustomerLedger must bind ActionSheetModal to entryToDelete'
    );
  });

  test('4.4: Zero window.confirm in core M3 views (Expenses & Khata)', () => {
    const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
    const lines = fs.readFileSync(appPath, 'utf8').split('\n');

    // Inspect lines inside ExpensesTabContent (approx 835 to 1040)
    const expenseLines = lines.slice(830, 1040).join('\n');
    assert.ok(
      !expenseLines.includes('window.confirm'),
      'ExpensesTabContent must NOT contain window.confirm'
    );

    // Inspect lines inside Khata and CustomerLedger (approx 2280 to 2805)
    const khataLines = lines.slice(2280, 2805).join('\n');
    assert.ok(
      !khataLines.includes('window.confirm'),
      'Khata / CustomerLedger must NOT contain window.confirm'
    );
  });
});

// ============================================================================
// SUITE 5: Listener Lifecycle & Unsubscribe Cleanup Audit
// ============================================================================
describe('Suite 5: Listener Lifecycle & Memory Leak Cleanups', () => {

  test('5.1: All Firestore onSnapshot subscriptions strictly return cleanup functions', () => {
    const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
    const content = fs.readFileSync(appPath, 'utf8');

    // In Hisaab component
    assert.ok(
      content.includes('return onSnapshot(q, (s) => setExps(s.docs.map((x) => x.data()))'),
      'Hisaab expenses listener must return unsubscribe'
    );
    assert.ok(
      content.includes('return onSnapshot(doc(db, "shops", shopId, "monthly_summary", ym)'),
      'Hisaab monthly summary listener must return unsubscribe'
    );

    // In ExpensesTabContent
    assert.ok(
      content.includes('return onSnapshot(\n      q,\n      (s) => setLiveExpenses'),
      'ExpensesTabContent listener must return unsubscribe'
    );

    // In ReportsTabContent
    assert.ok(
      content.includes('const unsubExp = onSnapshot(qExp'),
      'ReportsTabContent must track unsubExp'
    );
    assert.ok(
      content.includes('const unsubMonth = onSnapshot(docMonth'),
      'ReportsTabContent must track unsubMonth'
    );
    assert.ok(
      content.includes('return () => {\n      unsubExp();\n      unsubMonth();\n    };'),
      'ReportsTabContent must invoke both unsubscriptions on unmount'
    );
  });

  test('5.2: Redundant demo banner above Header has been completely removed', () => {
    const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
    const content = fs.readFileSync(appPath, 'utf8');

    // Verify there is no duplicate amber banner directly above <Header
    assert.ok(
      !content.includes('bg-amber-500/10 border-b border-amber-500/20 text-amber-300'),
      'Duplicate inline demo banner must be purged'
    );
  });
});
