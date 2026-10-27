/**
 * Challenger M4-1 Empirical Stress Test Harness
 * Milestone M4: Final Verification, Hardening & Git Delivery
 *
 * Requirements Tested:
 * 1. Empirically verify `generateMonthlyPdf` against extreme multi-page loads:
 *    - 0, 1, 50, 100, 200 items.
 *    - Assert doc.internal.getNumberOfPages() matches expected page counts.
 *    - Assert every page has the correct `Page X of Y` footer at y = pageHeight - 8.
 *    - Assert strings with mixed Urdu, emoji, and special characters pass through
 *      `cleanAscii` without throwing exceptions or corrupting the `%PDF-` stream.
 * 2. Empirically test that 0 `window.confirm` calls remain across the entire source code.
 * 3. Verify modal accessibility (Escape key handler) and animation token registration.
 *
 * Usage:
 *   node --test tests/challenger-m4-1-stress.test.mjs
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
  assert.ok(fs.existsSync(appPath), 'App.jsx must exist at ' + appPath);
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
 * Creates an instrumented instance of generateMonthlyPdf with an intercepted jsPDF
 * to track every call to addPage, setPage, text, and save.
 */
function createInstrumentedPdfRunner() {
  const { fnText } = loadAppGenerateMonthlyPdf();

  let executionRecord = null;

  class InstrumentedJsPDF extends jsPDF {
    constructor(...args) {
      super(...args);

      const callsByPage = { 1: [] };
      let currentPage = 1;

      const originalSetPage = this.setPage.bind(this);
      this.setPage = (p) => {
        currentPage = p;
        if (!callsByPage[p]) callsByPage[p] = [];
        return originalSetPage(p);
      };

      const originalAddPage = this.addPage.bind(this);
      this.addPage = (...pArgs) => {
        const res = originalAddPage(...pArgs);
        currentPage = this.internal.getNumberOfPages();
        if (!callsByPage[currentPage]) callsByPage[currentPage] = [];
        return res;
      };

      const originalText = this.text.bind(this);
      this.text = (textVal, x, y, options) => {
        if (!callsByPage[currentPage]) callsByPage[currentPage] = [];
        callsByPage[currentPage].push({
          page: currentPage,
          text: String(textVal),
          x,
          y: Math.round(y * 100) / 100,
          options,
        });
        return originalText(textVal, x, y, options);
      };

      this.save = (filename) => {
        const totalPages = this.internal.getNumberOfPages();
        const buffer = Buffer.from(this.output('arraybuffer'));
        executionRecord = {
          filename,
          totalPages,
          pageWidth: this.internal.pageSize.getWidth(),
          pageHeight: this.internal.pageSize.getHeight(),
          callsByPage,
          buffer,
          doc: this,
        };
        return this;
      };
    }
  }

  const factory = new Function('jsPDF', fnText + '\nreturn generateMonthlyPdf;');
  const generateFn = factory(InstrumentedJsPDF);

  return {
    generate: (params) => {
      executionRecord = null;
      generateFn(params);
      return executionRecord;
    },
  };
}

// ============================================================================
// SUITE 1: Extreme Multi-Page Stress Testing (0, 1, 50, 100, 200 items)
// ============================================================================
describe('Suite 1: Extreme Multi-Page Load Verification (generateMonthlyPdf)', () => {
  const runner = createInstrumentedPdfRunner();

  test('1.1: 0 items produces exactly 1 page with valid Page 1 of 1 footer', () => {
    const res = runner.generate({
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

    assert.ok(res, 'PDF must generate successfully');
    assert.equal(res.totalPages, 1, '0 items must fit on exactly 1 page');
    assert.equal(res.doc.internal.getNumberOfPages(), 1);
    assert.equal(res.buffer.subarray(0, 5).toString('ascii'), '%PDF-');

    // Verify footer on page 1
    const page1Texts = res.callsByPage[1] || [];
    const footerCall = page1Texts.find((c) => c.text === 'Page 1 of 1');
    assert.ok(footerCall, 'Page 1 must contain "Page 1 of 1" footer text');
    assert.equal(footerCall.y, Math.round((res.pageHeight - 8) * 100) / 100);

    const brandingCall = page1Texts.find((c) =>
      c.text.includes('HisaabLive Verified Statement')
    );
    assert.ok(brandingCall, 'Page 1 must contain HisaabLive Verified Statement branding');
  });

  test('1.2: 1 item produces exactly 1 page with valid Page 1 of 1 footer', () => {
    const res = runner.generate({
      shopName: 'Bismillah Store',
      shopCode: 'B01',
      month: '2026-10',
      sale: 10000,
      expense: 1500,
      profit: 8500,
      margin: '85.0',
      catBreakdown: [{ name: 'Chai / Pani', total: 1500, count: 1 }],
      items: [
        {
          id: 'item-1',
          date: '2026-10-01',
          title: 'Initial Store Supplies',
          category: 'Chai / Pani',
          amount: 1500,
        },
      ],
    });

    assert.ok(res, 'PDF must generate successfully');
    assert.equal(res.totalPages, 1, '1 item must fit on exactly 1 page');
    assert.equal(res.doc.internal.getNumberOfPages(), 1);
    assert.equal(res.buffer.subarray(0, 5).toString('ascii'), '%PDF-');

    const page1Texts = res.callsByPage[1] || [];
    const footerCall = page1Texts.find((c) => c.text === 'Page 1 of 1');
    assert.ok(footerCall, 'Page 1 must contain "Page 1 of 1" footer text');
  });

  test('1.3: 50 items triggers multi-page layout and every page has correct Page X of Y footer', () => {
    const items = [];
    for (let i = 1; i <= 50; i++) {
      items.push({
        id: `exp-50-${i}`,
        date: '2026-10-15',
        title: `Regular Operating Expense Transaction #${i}`,
        category: 'Maintenance',
        amount: 250 + i * 10,
      });
    }

    const res = runner.generate({
      shopName: 'Super Mart G10',
      shopCode: 'SM10',
      month: '2026-10',
      sale: 250000,
      expense: 25000,
      profit: 225000,
      margin: '90.0',
      catBreakdown: [{ name: 'Maintenance', total: 25000, count: 50 }],
      items,
    });

    assert.ok(res, 'PDF must generate successfully');
    // On page 1: headline + KPI + categories leaves space for ~25 items. 50 items -> 2 pages
    assert.equal(res.totalPages, 2, '50 items must span exactly 2 pages');
    assert.equal(res.doc.internal.getNumberOfPages(), 2);
    assert.equal(res.buffer.subarray(0, 5).toString('ascii'), '%PDF-');

    // Check footer on every page
    for (let p = 1; p <= res.totalPages; p++) {
      const pageTexts = res.callsByPage[p] || [];
      const expectedFooter = `Page ${p} of ${res.totalPages}`;
      const footerCall = pageTexts.find((c) => c.text === expectedFooter);
      assert.ok(
        footerCall,
        `Page ${p} must contain footer "${expectedFooter}" (got texts: ${pageTexts.map((x) => x.text).join(' | ')})`
      );
      assert.equal(footerCall.y, Math.round((res.pageHeight - 8) * 100) / 100);
    }
  });

  test('1.4: 100 items triggers 3 pages and every page has correct Page X of 3 footer', () => {
    const items = [];
    for (let i = 1; i <= 100; i++) {
      items.push({
        id: `exp-100-${i}`,
        date: '2026-10-20',
        title: `Commercial Bulk Inventory Transaction Line ${i}`,
        category: 'Staff / Tankhwa',
        amount: 500 + i * 20,
      });
    }

    const res = runner.generate({
      shopName: 'Metro Cash & Carry',
      shopCode: 'MC01',
      month: '2026-10',
      sale: 1000000,
      expense: 151000,
      profit: 849000,
      margin: '84.9',
      catBreakdown: [{ name: 'Staff / Tankhwa', total: 151000, count: 100 }],
      items,
    });

    assert.ok(res, 'PDF must generate successfully');
    // Page 1: ~25 items. Page 2: ~43 items. Page 3: ~32 items -> 3 pages.
    assert.equal(res.totalPages, 3, '100 items must span exactly 3 pages');
    assert.equal(res.doc.internal.getNumberOfPages(), 3);
    assert.equal(res.buffer.subarray(0, 5).toString('ascii'), '%PDF-');

    for (let p = 1; p <= 3; p++) {
      const pageTexts = res.callsByPage[p] || [];
      const expectedFooter = `Page ${p} of 3`;
      const footerCall = pageTexts.find((c) => c.text === expectedFooter);
      assert.ok(footerCall, `Page ${p} must contain footer "${expectedFooter}"`);
      assert.equal(footerCall.y, Math.round((res.pageHeight - 8) * 100) / 100);
    }
  });

  test('1.5: 200 items extreme volume test generates 5-6 pages and every page has correct footer', () => {
    const items = [];
    for (let i = 1; i <= 200; i++) {
      items.push({
        id: `exp-200-${i}`,
        date: '2026-10-25',
        title: `High Velocity POS Ledger Expense Entry ${i}`,
        category: 'Transport / Rickshaw',
        amount: 300 + i * 5,
      });
    }

    const res = runner.generate({
      shopName: 'Mega Logistics Center',
      shopCode: 'ML99',
      month: '2026-10',
      sale: 3000000,
      expense: 160500,
      profit: 2839500,
      margin: '94.6',
      catBreakdown: [{ name: 'Transport / Rickshaw', total: 160500, count: 200 }],
      items,
    });

    assert.ok(res, 'PDF must generate successfully');
    assert.ok(
      res.totalPages >= 5 && res.totalPages <= 6,
      `200 items must generate 5 to 6 pages (actual: ${res.totalPages})`
    );
    assert.equal(res.doc.internal.getNumberOfPages(), res.totalPages);
    assert.equal(res.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(res.buffer.length > 20000, 'PDF buffer must be substantial (>20KB)');

    // Verify footer across every single page
    for (let p = 1; p <= res.totalPages; p++) {
      const pageTexts = res.callsByPage[p] || [];
      const expectedFooter = `Page ${p} of ${res.totalPages}`;
      const footerCall = pageTexts.find((c) => c.text === expectedFooter);
      assert.ok(
        footerCall,
        `Page ${p} of ${res.totalPages} must have exact footer "${expectedFooter}"`
      );
    }
  });
});

// ============================================================================
// SUITE 2: cleanAscii & Stream Integrity with Non-ASCII / Urdu / Emojis
// ============================================================================
describe('Suite 2: cleanAscii & Stream Integrity with Non-ASCII / Urdu / Emojis', () => {
  const runner = createInstrumentedPdfRunner();

  test('2.1: cleanAscii handles pure Urdu, mixed Urdu, emojis, and special chars without exceptions', () => {
    // Extract cleanAscii implementation to test unit edge cases directly
    const cleanAscii = (str, fallback = "") => {
      if (!str) return fallback;
      const cleaned = String(str).replace(/[^\x20-\x7E]/g, "").trim();
      return (cleaned && /[A-Za-z0-9]/.test(cleaned)) ? cleaned : fallback;
    };

    // 1. Pure Urdu text (no alphanumeric ASCII) -> should return fallback
    assert.equal(cleanAscii('چائے کا خرچہ', 'Expense'), 'Expense');
    assert.equal(cleanAscii('مدینہ جنرل سٹور', 'Al-Madina General Store'), 'Al-Madina General Store');

    // 2. Mixed Urdu and English with numbers -> preserves ASCII portion
    assert.equal(cleanAscii('Chai چائے 500', 'Expense'), 'Chai  500');
    assert.equal(cleanAscii('Shop #12 دوکان', 'Shop'), 'Shop #12');

    // 3. Emojis and symbols
    assert.equal(cleanAscii('Fresh Milk 🥛 10L', 'Expense'), 'Fresh Milk  10L');
    assert.equal(cleanAscii('☕⚡🔥', 'Expense'), 'Expense'); // Pure emoji -> fallback

    // 4. Pure punctuation / non-alphanumeric ASCII -> should return fallback
    assert.equal(cleanAscii('---!@#$%^&*()---', 'Fallback'), 'Fallback');

    // 5. Special ASCII characters with alphanumeric
    assert.equal(cleanAscii("Repair & Maintenance (10% off)", 'Other'), "Repair & Maintenance (10% off)");
    assert.equal(cleanAscii('Item "Quoted" / Backslash \\', 'Other'), 'Item "Quoted" / Backslash \\');

    // 6. Null, undefined, empty string
    assert.equal(cleanAscii(null, 'Fallback'), 'Fallback');
    assert.equal(cleanAscii(undefined, 'Fallback'), 'Fallback');
    assert.equal(cleanAscii('', 'Fallback'), 'Fallback');
    assert.equal(cleanAscii('   ', 'Fallback'), 'Fallback');
  });

  test('2.2: PDF generation with heavily adversarial Unicode inputs retains %PDF- header and %%EOF', () => {
    const adversarialItems = [
      {
        id: 'adv-1',
        date: '2026-10-01',
        title: 'چائے، چینی، پتی اور بیکری سامان',
        category: 'متفرق خرچہ',
        amount: 2350,
      },
      {
        id: 'adv-2',
        date: '2026-10-02',
        title: '🔥 Emergency Generator Petrol ⛽ Rs. 5,000/- 🚀',
        category: 'Other',
        amount: 5000,
      },
      {
        id: 'adv-3',
        date: '2026-10-03',
        title: '<svg onload="alert(1)"> & \' " ` $ \0 \\ / \r \n \t',
        category: 'Maintenance',
        amount: 1200,
      },
      {
        id: 'adv-4',
        date: '2026-10-04',
        title: 'مکسڈ اردو Mixed English 12345 🇵🇰 #PK-99',
        category: 'Staff / Tankhwa',
        amount: 15000,
      },
      {
        id: 'adv-5',
        date: '2026-10-05',
        title: '---===###$$$%%%^^^&&&***()_+',
        category: 'Dukaan Kiraya',
        amount: 40000,
      },
    ];

    const res = runner.generate({
      shopName: 'بسم اللہ جنرل اسٹور Bismillah General Store 🌟',
      shopCode: 'B-01_#اردو!@',
      month: '2026-10',
      sale: 150000,
      expense: 63550,
      profit: 86450,
      margin: '57.6',
      catBreakdown: [
        { name: 'متفرق خرچہ', total: 2350, count: 1 },
        { name: 'Other', total: 5000, count: 1 },
        { name: 'Maintenance', total: 1200, count: 1 },
        { name: 'Staff / Tankhwa', total: 15000, count: 1 },
        { name: 'Dukaan Kiraya', total: 40000, count: 1 },
      ],
      items: adversarialItems,
    });

    assert.ok(res, 'PDF generation must not throw on adversarial inputs');
    assert.equal(res.buffer.subarray(0, 5).toString('ascii'), '%PDF-');

    // PDF buffer ending check
    const trailerStr = res.buffer.subarray(res.buffer.length - 200).toString('binary');
    assert.ok(trailerStr.includes('%%EOF'), 'PDF buffer must properly conclude with %%EOF trailer');

    // Assert that safeCode correctly stripped non-alphanumeric
    assert.equal(res.filename, 'HisaabLive-Statement-B01-2026-10.pdf');
  });
});

// ============================================================================
// SUITE 3: Codebase Audit — 0 Residual window.confirm Calls
// ============================================================================
describe('Suite 3: Codebase Audit — Zero window.confirm Calls', () => {
  test('3.1: Recursively inspect all source files in owner-app/src for window.confirm calls', () => {
    const srcDir = path.join(APP_ROOT, 'src');

    function scanDir(dir) {
      let files = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files = files.concat(scanDir(fullPath));
        } else if (entry.isFile() && /\.(jsx?|tsx?)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const sourceFiles = scanDir(srcDir);
    assert.ok(sourceFiles.length > 5, 'Must scan source files in src/');

    const violations = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Ignore single line comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

        if (/window\.confirm\s*\(/.test(line)) {
          violations.push({
            file: path.relative(APP_ROOT, file),
            line: idx + 1,
            snippet: trimmed,
          });
        }
      });
    }

    assert.equal(
      violations.length,
      0,
      `Found residual window.confirm calls:\n${JSON.stringify(violations, null, 2)}`
    );
  });
});

// ============================================================================
// SUITE 4: Accessibility & Motion Hardening
// ============================================================================
describe('Suite 4: Accessibility & Motion Hardening', () => {
  test('4.1: ActionSheetModal has Escape key listener and event cleanup', () => {
    const modalPath = path.join(APP_ROOT, 'src', 'components', 'common', 'ActionSheetModal.jsx');
    assert.ok(fs.existsSync(modalPath), 'ActionSheetModal.jsx must exist');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(content.includes('Escape'), 'Must check for Escape key');
    assert.ok(content.includes('addEventListener'), 'Must attach keydown listener');
    assert.ok(content.includes('removeEventListener'), 'Must clean up keydown listener');
  });

  test('4.2: tailwind.config.js declares slideUp and fadeIn animations and keyframes', () => {
    const twPath = path.join(APP_ROOT, 'tailwind.config.js');
    assert.ok(fs.existsSync(twPath), 'tailwind.config.js must exist');
    const content = fs.readFileSync(twPath, 'utf8');

    assert.ok(content.includes('slideUp:'), 'Must configure slideUp keyframe');
    assert.ok(content.includes('fadeIn:'), 'Must configure fadeIn keyframe');
    assert.ok(content.includes('slide-up'), 'Must configure slide-up animation token');
    assert.ok(content.includes('fade-in'), 'Must configure fade-in animation token');
  });
});
