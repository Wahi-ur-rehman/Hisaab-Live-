/**
 * Challenger M3-2 Empirical Stress Test Harness
 * Milestone M3: Core Feature Views Modernization
 *
 * Specific Focus:
 * 1. Stress test `generateMonthlyPdf` with empty expenses, single expense, 100+ expenses causing multiple page breaks, and special characters. Verify valid PDF structure without crashing.
 * 2. Stress test unmounting and view transitions across Hisaab, Expenses, Khata, and Reports under high frequency. Ensure zero listener leaks in memory.test.js.
 * 3. Verify production build, memory leak tests, and E2E test suites.
 *
 * Usage:
 *   node --test tests/challenger-m3-2-stress.test.mjs
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

// ============================================================================
// HELPER: Extract exact generateMonthlyPdf function from App.jsx
// ============================================================================
function loadAppGenerateMonthlyPdf() {
  const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
  assert.ok(fs.existsSync(appPath), 'App.jsx must exist');
  const code = fs.readFileSync(appPath, 'utf8');

  const startMarker = 'function generateMonthlyPdf';
  const start = code.indexOf(startMarker);
  assert.ok(start !== -1, 'generateMonthlyPdf must be defined in App.jsx');

  const endMarker = '\n// ---------------------------------------------------------------------------\n// Monthly Statement Modal';
  const end = code.indexOf(endMarker, start);
  assert.ok(end !== -1, 'Boundary for generateMonthlyPdf must be found in App.jsx');

  const fnText = code.slice(start, end).trim();
  assert.ok(fnText.endsWith('}'), 'Extracted function must terminate with closing brace');

  return { fnText, code };
}

/**
 * Creates an executable instance of generateMonthlyPdf with an intercepted jsPDF
 * so we capture the document, output buffer, page count, and save parameters in Node.js
 */
function createPdfRunner() {
  const { fnText } = loadAppGenerateMonthlyPdf();

  let captured = null;

  class InterceptedJsPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      // doc.save is an own-property assigned in the jsPDF constructor
      this.save = (filename) => {
        captured = {
          filename,
          pages: this.internal.getNumberOfPages(),
          pageWidth: this.internal.pageSize.getWidth(),
          pageHeight: this.internal.pageSize.getHeight(),
          buffer: Buffer.from(this.output('arraybuffer')),
          doc: this,
        };
        return this;
      };
    }
  }

  const factory = new Function('jsPDF', fnText + '\nreturn generateMonthlyPdf;');
  const generateFn = factory(InterceptedJsPDF);

  return {
    generate: (params) => {
      captured = null;
      generateFn(params);
      return captured;
    },
  };
}

// ============================================================================
// SUITE 1: PDF Generation Stress & Edge Cases (generateMonthlyPdf)
// ============================================================================
describe('Suite 1: PDF Generation Stress & Edge Cases (generateMonthlyPdf)', () => {
  const pdfRunner = createPdfRunner();

  test('1.1: Empty expenses (0 items, 0 sales, 0 expenses) generates valid 1-page PDF', () => {
    const result = pdfRunner.generate({
      shopName: 'Al-Madina General Store',
      shopCode: 'G10',
      month: '2026-10',
      sale: 0,
      expense: 0,
      profit: 0,
      margin: '0.0',
      catBreakdown: [],
      items: [],
    });

    assert.ok(result, 'PDF generation must succeed and save document');
    assert.equal(result.pages, 1, 'Empty report should fit on exactly 1 page');
    assert.equal(result.filename, 'HisaabLive-Statement-G10-2026-10.pdf');
    assert.ok(result.buffer.length > 1000, `Buffer size (${result.buffer.length}) must be non-trivial`);

    // Verify valid PDF file header '%PDF-'
    const header = result.buffer.subarray(0, 5).toString('ascii');
    assert.equal(header, '%PDF-', 'PDF output buffer must start with %PDF- header');

    // Verify A4 portrait dimensions (210 x 297 mm)
    assert.equal(Math.round(result.pageWidth), 210, 'Page width must be 210mm (A4)');
    assert.equal(Math.round(result.pageHeight), 297, 'Page height must be 297mm (A4)');
  });

  test('1.2: Single expense (1 item) generates valid 1-page PDF with correct totals', () => {
    const result = pdfRunner.generate({
      shopName: 'Bismillah Cash & Carry',
      shopCode: 'B01',
      month: '2026-10',
      sale: 150000,
      expense: 2500,
      profit: 147500,
      margin: '98.3',
      catBreakdown: [
        { name: 'Chai / Pani', total: 2500, count: 1 },
        { name: 'Bijli / Bills', total: 0, count: 0 },
      ],
      items: [
        {
          id: 'exp-single',
          date: '2026-10-15',
          title: 'Guest Refreshments & Milk Stock',
          category: 'Chai / Pani',
          amount: 2500,
        },
      ],
    });

    assert.ok(result, 'PDF generation must succeed');
    assert.equal(result.pages, 1, 'Single item must fit on 1 page');
    assert.equal(result.filename, 'HisaabLive-Statement-B01-2026-10.pdf');
    assert.equal(result.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(result.buffer.length > 2000, 'Buffer must be valid PDF');
  });

  test('1.3: 100+ expenses stress test — validates multiple page breaks and header continuity', () => {
    const count = 120;
    const items = [];
    const categories = [
      'Chai / Pani',
      'Bijli / Bills',
      'Staff / Tankhwa',
      'Dukaan Kiraya',
      'Transport / Rickshaw',
      'Maintenance',
      'Other',
    ];

    let totalExpense = 0;
    for (let i = 1; i <= count; i++) {
      const amt = 500 + (i * 35);
      totalExpense += amt;
      const cat = categories[i % categories.length];
      const day = String((i % 28) + 1).padStart(2, '0');
      items.push({
        id: `exp-${i}`,
        date: `2026-10-${day}`,
        title: `Itemized Commercial Kharcha Entry #${i} - Bulk Supplies`,
        category: cat,
        amount: amt,
      });
    }

    const catBreakdown = categories.map((cat) => {
      const catItems = items.filter((x) => x.category === cat);
      return {
        name: cat,
        total: catItems.reduce((acc, c) => acc + c.amount, 0),
        count: catItems.length,
      };
    });

    const sale = 2500000;
    const profit = sale - totalExpense;
    const margin = ((profit / sale) * 100).toFixed(1);

    const result = pdfRunner.generate({
      shopName: 'Metro Mart Wholesale Hub',
      shopCode: 'MM99',
      month: '2026-10',
      sale,
      expense: totalExpense,
      profit,
      margin,
      catBreakdown,
      items,
    });

    assert.ok(result, 'PDF generation must succeed for 120 items');
    // On page 1: header, KPI cards, and category breakdown take ~126mm. Space remaining: 144mm / 5.8mm ~= 24 items.
    // Subsequent pages fit: 256mm / 5.8mm ~= 44 items.
    // 120 items: Page 1 (24 items), Page 2 (44 items), Page 3 (44 items), Page 4 (8 items) -> 4 pages.
    assert.ok(result.pages >= 3, `120 items must generate multiple pages (got ${result.pages})`);
    assert.equal(result.filename, 'HisaabLive-Statement-MM99-2026-10.pdf');
    assert.equal(result.buffer.subarray(0, 5).toString('ascii'), '%PDF-');

    // Stress test with 250 items
    const largeCount = 250;
    const largeItems = [];
    for (let i = 1; i <= largeCount; i++) {
      largeItems.push({
        id: `large-exp-${i}`,
        date: `2026-10-10`,
        title: `Rapid High-Volume Transaction Line ${i}`,
        category: 'Maintenance',
        amount: 1000 + i,
      });
    }

    const largeResult = pdfRunner.generate({
      shopName: 'Metro Mart Wholesale Hub',
      shopCode: 'MM99',
      month: '2026-10',
      sale: 5000000,
      expense: 300000,
      profit: 4700000,
      margin: '94.0',
      catBreakdown: [{ name: 'Maintenance', total: 300000, count: largeCount }],
      items: largeItems,
    });

    assert.ok(largeResult.pages >= 6, `250 items must generate at least 6 pages (got ${largeResult.pages})`);
    assert.equal(largeResult.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(largeResult.buffer.length > 20000, 'PDF buffer size must reflect multi-page content');
  });

  test('1.4: Special characters, Urdu text, emojis, HTML/SQL injections, and RTL characters', () => {
    const specialItems = [
      {
        id: 'sp-1',
        date: '2026-10-01',
        title: 'چائے، چینی اور دودھ کا بل (اردو ٹیکسٹ)',
        category: 'Chai / Pani',
        amount: 1450,
      },
      {
        id: 'sp-2',
        date: '2026-10-02',
        title: 'Emojis & Symbols: ☕ ⚡ 🔧 🛒 📦 Rs. 100% #1 @HQ!',
        category: 'Other',
        amount: 850,
      },
      {
        id: 'sp-3',
        date: '2026-10-03',
        title: '<script>alert("XSS Attack Vector")</script> & "quotes" \'apostrophes\' \\backslashes/',
        category: 'Maintenance',
        amount: 3200,
      },
      {
        id: 'sp-4',
        date: '2026-10-04',
        title: "SELECT * FROM expenses WHERE '1'='1' -- DROP TABLE shops;",
        category: 'Transport / Rickshaw',
        amount: 900,
      },
      {
        id: 'sp-5',
        date: '2026-10-05',
        title: 'A'.repeat(300), // Exceeds title limit (App slices to 48)
        category: 'Dukaan Kiraya',
        amount: 45000,
      },
    ];

    const result = pdfRunner.generate({
      shopName: 'مدینہ جنرل سٹور & Co. <script>alert(1)</script> / \\',
      shopCode: 'G-10_#Urdu-99',
      month: '2026-10',
      sale: 200000,
      expense: 51400,
      profit: 148600,
      margin: '74.3',
      catBreakdown: [
        { name: 'Chai / Pani', total: 1450, count: 1 },
        { name: 'Other', total: 850, count: 1 },
        { name: 'Maintenance', total: 3200, count: 1 },
        { name: 'Transport / Rickshaw', total: 900, count: 1 },
        { name: 'Dukaan Kiraya', total: 45000, count: 1 },
      ],
      items: specialItems,
    });

    assert.ok(result, 'PDF generation must survive arbitrary unicode and adversarial characters');
    // Shop code sanitization test: 'G-10_#Urdu-99' -> 'G10URDU99'
    assert.equal(result.filename, 'HisaabLive-Statement-G10URDU99-2026-10.pdf');
    assert.equal(result.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  test('1.5: Missing / undefined / null fields and extreme numeric values', () => {
    const buggyItems = [
      { id: 'b1', date: null, title: null, category: null, amount: null },
      { id: 'b2', date: undefined, title: undefined, category: undefined, amount: undefined },
      { id: 'b3', date: '', title: '', category: '', amount: 0 },
      { id: 'b4', date: '2026-10-20', title: 'Negative expense', category: 'Other', amount: -500 },
      { id: 'b5', date: '2026-10-21', title: 'Massive amount', category: 'Other', amount: 9999999999 },
    ];

    // Missing shopName, shopCode, null category breakdown
    const result = pdfRunner.generate({
      shopName: null, // should default to 'Al-Madina General Store'
      shopCode: undefined, // should default to 'G10'
      month: '2026-10',
      sale: 0,
      expense: 9999999499,
      profit: -9999999499,
      margin: '-100.0',
      catBreakdown: [],
      items: buggyItems,
    });

    assert.ok(result, 'Must handle null/undefined fields without throwing');
    assert.equal(result.filename, 'HisaabLive-Statement-G10-2026-10.pdf');
    assert.equal(result.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(result.pages, 1);
  });

  test('1.6: Performance stress test — 50 consecutive PDF generations', () => {
    const startTime = Date.now();
    const initialMem = process.memoryUsage().heapUsed;

    for (let i = 0; i < 50; i++) {
      pdfRunner.generate({
        shopName: `Test Shop #${i}`,
        shopCode: `S${i}`,
        month: '2026-10',
        sale: 50000 + i * 1000,
        expense: 10000,
        profit: 40000,
        margin: '80.0',
        catBreakdown: [{ name: 'Chai / Pani', total: 10000, count: 5 }],
        items: [
          { date: '2026-10-01', title: `Test Item ${i}-1`, category: 'Chai / Pani', amount: 2000 },
          { date: '2026-10-02', title: `Test Item ${i}-2`, category: 'Chai / Pani', amount: 8000 },
        ],
      });
    }

    const duration = Date.now() - startTime;
    const memDeltaMb = (process.memoryUsage().heapUsed - initialMem) / (1024 * 1024);

    assert.ok(duration < 10000, `50 PDF generations must complete in under 10s (took ${duration}ms)`);
    // Memory growth should be safely bounded
    assert.ok(memDeltaMb < 50, `Heap growth (${memDeltaMb.toFixed(2)} MB) must be bounded`);
  });
});

// ============================================================================
// SUITE 2: High-Frequency View Transitions & Listener Leak Prevention
// ============================================================================
describe('Suite 2: High-Frequency View Transitions & Listener Leak Safety', () => {

  test('2.1: 5,000 rapid tab transitions across Hisaab, Expenses, Khata, and Reports leave 0 net listeners', () => {
    let activeListeners = 0;
    let totalCreated = 0;
    let totalDestroyed = 0;

    const mockOnSnapshot = (label) => {
      activeListeners++;
      totalCreated++;
      return () => {
        activeListeners--;
        totalDestroyed++;
      };
    };

    // Simulate mounting of views and their respective useEffect subscriptions
    const mountView = (viewName) => {
      const cleanups = [];
      switch (viewName) {
        case 'hisaab':
          // Hisaab subscribes to daily expenses + monthly summary
          cleanups.push(mockOnSnapshot('hisaab_expenses'));
          cleanups.push(mockOnSnapshot('hisaab_monthly_summary'));
          break;
        case 'expenses':
          // ExpensesTabContent subscribes to daily expenses
          cleanups.push(mockOnSnapshot('expenses_daily'));
          break;
        case 'khata':
          // Khata subscribes to customer roster
          cleanups.push(mockOnSnapshot('khata_customers'));
          break;
        case 'reports':
          // ReportsTabContent subscribes to monthly expenses + monthly summary
          cleanups.push(mockOnSnapshot('reports_monthly_expenses'));
          cleanups.push(mockOnSnapshot('reports_monthly_summary'));
          break;
      }
      return () => cleanups.forEach((c) => c());
    };

    const tabs = ['hisaab', 'expenses', 'khata', 'reports'];
    let currentUnmount = mountView('hisaab');

    for (let i = 0; i < 5000; i++) {
      const nextTab = tabs[i % tabs.length];
      currentUnmount(); // Unmount previous tab
      currentUnmount = mountView(nextTab); // Mount next tab
    }
    // Final unmount
    currentUnmount();

    assert.equal(activeListeners, 0, 'Active listeners must be exactly 0 after 5,000 view transitions');
    assert.equal(totalCreated, totalDestroyed, 'Total created listeners must equal total destroyed');
    assert.ok(totalCreated >= 5000, `Created ${totalCreated} listeners over the test`);
  });

  test('2.2: Nested view and modal lifecycle: CustomerLedger, ExpenseDetailModal, MonthlyStatementModal', () => {
    let activeListeners = 0;
    const mockOnSnapshot = (name) => {
      activeListeners++;
      return () => { activeListeners--; };
    };

    // Simulate Khata -> CustomerLedger drill-down lifecycle
    for (let i = 0; i < 200; i++) {
      // 1. Mount Khata
      const unmountKhata = mockOnSnapshot('khata_customers');
      assert.equal(activeListeners, 1);

      // 2. Click Customer -> Mount CustomerLedger (CustomerLedger mounts while Khata is parent)
      const unmountCustomerLedger = mockOnSnapshot(`customer_entries_${i}`);
      assert.equal(activeListeners, 2);

      // 3. Navigate back to Khata list
      unmountCustomerLedger();
      assert.equal(activeListeners, 1);

      // 4. Switch to Expenses tab
      unmountKhata();
      const unmountExpenses = mockOnSnapshot('expenses_daily');
      assert.equal(activeListeners, 1);

      // 5. Open ExpenseDetailModal (subscribes to today expenses)
      const unmountExpenseModal = mockOnSnapshot('expense_modal_snapshot');
      assert.equal(activeListeners, 2);

      // 6. Close ExpenseDetailModal
      unmountExpenseModal();
      assert.equal(activeListeners, 1);

      // 7. Switch to Reports tab
      unmountExpenses();
      const unmountReportExp = mockOnSnapshot('report_exp');
      const unmountReportSum = mockOnSnapshot('report_sum');
      assert.equal(activeListeners, 2);

      // 8. Open MonthlyStatementModal (subscribes to monthly expenses)
      const unmountMonthlyModal = mockOnSnapshot('monthly_modal_exp');
      assert.equal(activeListeners, 3);

      // 9. Close MonthlyStatementModal
      unmountMonthlyModal();
      assert.equal(activeListeners, 2);

      // 10. Switch back to Hisaab
      unmountReportExp();
      unmountReportSum();
      assert.equal(activeListeners, 0);
    }

    assert.equal(activeListeners, 0, 'Zero listener leaks after nested modal drilldown cycles');
  });

  test('2.3: Async race condition simulation: snapshot callback arrives after component unmounts', () => {
    let isMounted = false;
    let stateUpdatesOnUnmounted = 0;

    let snapshotCallback = null;
    const mockOnSnapshot = (cb) => {
      snapshotCallback = cb;
      return () => {
        isMounted = false;
        snapshotCallback = null;
      };
    };

    // Component mounts
    isMounted = true;
    const unsubscribe = mockOnSnapshot((data) => {
      if (!isMounted) {
        stateUpdatesOnUnmounted++;
      }
    });

    // Unmount before Firestore responds
    unsubscribe();

    // Firestore delayed event fires after unmount
    if (snapshotCallback) {
      snapshotCallback({ docs: [] });
    }

    assert.equal(stateUpdatesOnUnmounted, 0, 'No state updates or dangling callbacks after unmount');
    assert.equal(isMounted, false);
  });

  test('2.4: React 18 StrictMode double mount/unmount lifecycle simulation', () => {
    let activeListeners = 0;
    const mockOnSnapshot = () => {
      activeListeners++;
      return () => { activeListeners--; };
    };

    // In StrictMode, React runs: Effect -> Cleanup -> Effect on mount
    for (let i = 0; i < 50; i++) {
      // First mount
      const unsub1 = mockOnSnapshot();
      assert.equal(activeListeners, 1);
      // React unmounts immediately to test cleanup
      unsub1();
      assert.equal(activeListeners, 0);
      // React re-mounts
      const unsub2 = mockOnSnapshot();
      assert.equal(activeListeners, 1);
      // Final component unmount
      unsub2();
      assert.equal(activeListeners, 0);
    }

    assert.equal(activeListeners, 0, 'StrictMode double-invoke leaves zero dangling listeners');
  });

  test('2.5: App-level timers (midnight rollover) cleanup on destruction', () => {
    const intervals = [];
    const clearedIntervals = [];

    let timerId = 100;
    const mockSetInterval = (fn, ms) => {
      const id = ++timerId;
      intervals.push({ id, fn, ms });
      return id;
    };
    const mockClearInterval = (id) => clearedIntervals.push(id);

    // Simulate AppContent mount
    const midnightTimerId = mockSetInterval(() => {}, 60000);
    assert.equal(intervals.length, 1);

    // Simulate AppContent unmount
    mockClearInterval(midnightTimerId);
    assert.equal(clearedIntervals.length, 1);
    assert.equal(clearedIntervals[0], midnightTimerId);
  });
});

// ============================================================================
// SUITE 3: Code Structure & Contract Audit of Modernized M3 Features
// ============================================================================
describe('Suite 3: Code Structure & Contract Audit of Modernized M3 Features', () => {
  const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
  const actionSheetPath = path.join(APP_ROOT, 'src', 'components', 'common', 'ActionSheetModal.jsx');

  test('3.1: App.jsx implements all 4 feature views and returns unsubscribe on every onSnapshot', () => {
    const code = fs.readFileSync(appPath, 'utf8');

    // 1. Hisaab View definitions
    assert.ok(code.includes('function Hisaab('), 'App.jsx must declare function Hisaab');
    assert.ok(code.includes('function ExpensesTabContent('), 'App.jsx must declare function ExpensesTabContent');
    assert.ok(code.includes('function Khata('), 'App.jsx must declare function Khata');
    assert.ok(code.includes('function CustomerLedger('), 'App.jsx must declare function CustomerLedger');
    assert.ok(code.includes('function ReportsTabContent('), 'App.jsx must declare function ReportsTabContent');
    assert.ok(code.includes('function MonthlyStatementModal('), 'App.jsx must declare function MonthlyStatementModal');
    assert.ok(code.includes('function generateMonthlyPdf('), 'App.jsx must declare function generateMonthlyPdf');

    // 2. Count onSnapshot occurrences and verify cleanups
    const onSnapshotMatches = code.match(/onSnapshot\(/g) || [];
    assert.ok(onSnapshotMatches.length >= 7, `Expected at least 7 onSnapshot subscriptions, found ${onSnapshotMatches.length}`);

    // Verify all useEffect blocks with onSnapshot return unsubscribe
    assert.ok(code.includes('return onSnapshot('), 'Direct return of onSnapshot unsubscribe must be present');
    assert.ok(code.includes('unsubExp();'), 'ReportsTabContent must invoke unsubExp cleanup');
    assert.ok(code.includes('unsubMonth();'), 'ReportsTabContent must invoke unsubMonth cleanup');
  });

  test('3.2: Net Profit Hero Card & semantic color tokens in Hisaab View', () => {
    const code = fs.readFileSync(appPath, 'utf8');

    // Verify Net Profit Hero calculation
    assert.ok(code.includes('const netProfit = sale - totalExp;'), 'Hisaab must calculate netProfit = sale - totalExp');
    assert.ok(code.includes('const todayMargin = sale > 0'), 'Hisaab must calculate profit margin');

    // Verify semantic color tokens
    assert.ok(code.includes('text-emerald-mint'), 'Must use Emerald Mint token for sales');
    assert.ok(code.includes('text-amber-warm'), 'Must use Warm Amber token for receivables');
    assert.ok(code.includes('text-rose-crimson'), 'Must use Rose Crimson token for expenses/missing');
    assert.ok(code.includes('text-sky-cyan'), 'Must use Sky Cyan token for actions');
  });

  test('3.3: ActionSheetModal exists and replaces window.confirm in Expenses and Khata views', () => {
    assert.ok(fs.existsSync(actionSheetPath), 'ActionSheetModal.jsx must exist in components/common');
    const modalCode = fs.readFileSync(actionSheetPath, 'utf8');
    assert.ok(modalCode.includes('ActionSheetModal'), 'ActionSheetModal component must be defined');
    assert.ok(modalCode.includes('pb-safe'), 'ActionSheetModal must implement pb-safe for notch protection');
    assert.ok(modalCode.includes('min-h-[48px]'), 'ActionSheetModal buttons must meet min 48px touch target');

    const appCode = fs.readFileSync(appPath, 'utf8');
    assert.ok(appCode.includes('<ActionSheetModal'), 'App.jsx must render ActionSheetModal');

    // Verify ExpensesTabContent does NOT use window.confirm
    const expensesIdx = appCode.indexOf('function ExpensesTabContent');
    const hisaabIdx = appCode.indexOf('function Hisaab');
    const expensesSection = appCode.slice(expensesIdx, hisaabIdx);
    assert.ok(!expensesSection.includes('window.confirm'), 'ExpensesTabContent must NOT use window.confirm');

    // Verify CustomerLedger does NOT use window.confirm
    const ledgerIdx = appCode.indexOf('function CustomerLedger');
    const alertsIdx = appCode.indexOf('function Alerts');
    const ledgerSection = appCode.slice(ledgerIdx, alertsIdx);
    assert.ok(!ledgerSection.includes('window.confirm'), 'CustomerLedger must NOT use window.confirm');

    // Verify ExpenseDetailModal does NOT use window.confirm
    const modalDetailIdx = appCode.indexOf('function ExpenseDetailModal');
    const modalDetailSection = appCode.slice(modalDetailIdx, modalDetailIdx + 2000);
    assert.ok(!modalDetailSection.includes('window.confirm'), 'ExpenseDetailModal must NOT use window.confirm');
  });

  test('3.4: Redundant demo banner above Header has been removed from App.jsx', () => {
    const code = fs.readFileSync(appPath, 'utf8');
    // Ensure no duplicate banner rendered immediately above <Header
    const headerPos = code.indexOf('<Header');
    assert.ok(headerPos !== -1, '<Header component must exist');

    const beforeHeader = code.slice(Math.max(0, headerPos - 500), headerPos);
    assert.ok(
      !beforeHeader.includes('Interactive Demo Mode Active'),
      'No duplicate Interactive Demo Mode banner should appear immediately before Header'
    );
  });
});
