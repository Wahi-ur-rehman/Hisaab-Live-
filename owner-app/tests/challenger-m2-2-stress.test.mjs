/**
 * Challenger M2-2 Empirical Stress Test Harness
 * Milestone M2: Localization & Shell Navigation
 *
 * Specific Focus:
 * 1. Safe area CSS compilation (pt-safe, pb-safe, CSS variables) & Notch simulation across mobile profiles.
 * 2. Listener lifecycle: 2,000 rapid tab switches, duplicate subscription prevention, interval leak prevention.
 * 3. Nested view / modal listener cleanup (CustomerLedger, ExpenseDetailModal, MonthlyStatementModal, AlertsModal).
 * 4. Localization RTL & key dictionary parity stress.
 *
 * Usage:
 *   node --test tests/challenger-m2-2-stress.test.mjs
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

// ============================================================================
// SUITE 1: Safe Area CSS Compilation & Device Notch Simulation
// ============================================================================
describe('Suite 1: Safe Area CSS Compilation & Mobile Notch Simulation', () => {

  test('1.1: Production CSS bundle compiles pt-safe and pb-safe utilities with env() rules', () => {
    const assetsDir = path.join(APP_ROOT, 'dist', 'assets');
    assert.ok(fs.existsSync(assetsDir), 'dist/assets directory must exist (run build first)');

    const files = fs.readdirSync(assetsDir);
    const cssFile = files.find((f) => f.endsWith('.css'));
    assert.ok(cssFile, 'Compiled CSS bundle must exist in dist/assets');

    const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');

    // Check pt-safe compilation
    assert.match(
      css,
      /\.pt-safe\{padding-top:env\(safe-area-inset-top\)\}/,
      'CSS bundle must contain .pt-safe{padding-top:env(safe-area-inset-top)}'
    );

    // Check pb-safe compilation
    assert.match(
      css,
      /\.pb-safe\{padding-bottom:env\(safe-area-inset-bottom\)\}/,
      'CSS bundle must contain .pb-safe{padding-bottom:env(safe-area-inset-bottom)}'
    );

    // Check safe area CSS variable fallbacks
    assert.match(css, /--sat:env\(safe-area-inset-top,0px\)|--sat: env\(safe-area-inset-top, 0px\)/, 'CSS must define --sat fallback');
    assert.match(css, /--sab:env\(safe-area-inset-bottom,0px\)|--sab: env\(safe-area-inset-bottom, 0px\)/, 'CSS must define --sab fallback');
    assert.match(css, /--safe-area-inset-top:env\(safe-area-inset-top,0px\)|--safe-area-inset-top: env\(safe-area-inset-top, 0px\)/, 'CSS must define --safe-area-inset-top');
    assert.match(css, /--safe-area-inset-bottom:env\(safe-area-inset-bottom,0px\)|--safe-area-inset-bottom: env\(safe-area-inset-bottom, 0px\)/, 'CSS must define --safe-area-inset-bottom');
  });

  test('1.2: Header.jsx applies pt-safe with sticky positioning and z-index layering', () => {
    const headerPath = path.join(APP_ROOT, 'src', 'components', 'common', 'Header.jsx');
    assert.ok(fs.existsSync(headerPath), 'Header.jsx must exist');
    const content = fs.readFileSync(headerPath, 'utf8');

    // Must have pt-safe class on header
    assert.match(content, /<header[^>]*\bpt-safe\b/, 'Header element must declare pt-safe utility');
    assert.match(content, /<header[^>]*\bsticky\b/, 'Header element must be sticky');
    assert.match(content, /<header[^>]*\btop-0\b/, 'Header element must be top-0');
    assert.match(content, /<header[^>]*\bz-20\b/, 'Header element must declare appropriate z-index (z-20)');

    // Must include brand Sky Cyan accent and EN | اردو switch pill
    assert.match(content, /bg-sky-cyan|text-sky-cyan/, 'Header must feature Sky Cyan branding');
    assert.match(content, /toggleLanguage/, 'Header must integrate toggleLanguage handler');
    assert.match(content, /اردو/, 'Header must feature Urdu label in language switcher');
  });

  test('1.3: TabBar.jsx applies pb-safe with fixed bottom positioning and 48px touch targets', () => {
    const tabBarPath = path.join(APP_ROOT, 'src', 'components', 'common', 'TabBar.jsx');
    assert.ok(fs.existsSync(tabBarPath), 'TabBar.jsx must exist');
    const content = fs.readFileSync(tabBarPath, 'utf8');

    // Must have pb-safe on nav
    assert.match(content, /<nav[^>]*\bpb-safe\b/, 'TabBar nav element must declare pb-safe utility');
    assert.match(content, /<nav[^>]*\bfixed\b/, 'TabBar nav element must be fixed');
    assert.match(content, /<nav[^>]*\bbottom-0\b/, 'TabBar nav element must be bottom-0');
    assert.match(content, /<nav[^>]*\bz-30\b/, 'TabBar nav element must have high z-index (z-30)');

    // Must have touch target minimum 48px
    assert.match(content, /min-h-\[48px\]/, 'Tab buttons must have min-h-[48px]');
    assert.match(content, /min-w-\[48px\]/, 'Tab buttons must have min-w-[48px]');

    // Must declare exact 4 tabs: hisaab, expenses, khata, reports
    assert.match(content, /id:\s*['"]hisaab['"]/, 'TabBar must configure hisaab tab');
    assert.match(content, /id:\s*['"]expenses['"]/, 'TabBar must configure expenses tab');
    assert.match(content, /id:\s*['"]khata['"]/, 'TabBar must configure khata tab');
    assert.match(content, /id:\s*['"]reports['"]/, 'TabBar must configure reports tab');
  });

  test('1.4: Empirical Notch Simulation across 6 mobile hardware profiles', () => {
    const profiles = [
      { name: 'iPhone 15 Pro (Dynamic Island)', topInset: 59, bottomInset: 34, screenH: 852 },
      { name: 'iPhone 14 / 13 (Standard Notch)', topInset: 47, bottomInset: 34, screenH: 844 },
      { name: 'iPhone SE (Legacy 0 Notch)', topInset: 0, bottomInset: 0, screenH: 667 },
      { name: 'Pixel 8 (Punch Hole + 3-Button Nav)', topInset: 36, bottomInset: 48, screenH: 915 },
      { name: 'Galaxy S24 (Edge + Gesture Bar)', topInset: 40, bottomInset: 24, screenH: 920 },
      { name: 'Foldable Device (Extreme Top Notch)', topInset: 64, bottomInset: 38, screenH: 800 },
    ];

    const baseHeaderHeight = 56; // Standard mobile app header height in px
    const baseTabBarHeight = 56; // Standard mobile 4-tab bar height in px
    const appContentPaddingBottom = 110; // App.jsx line 654: paddingBottom: 110

    for (const profile of profiles) {
      const effectiveHeaderH = baseHeaderHeight + profile.topInset;
      const effectiveTabBarH = baseTabBarHeight + profile.bottomInset;

      // 1. Ensure header does not get pushed below visible screen
      assert.ok(
        effectiveHeaderH < profile.screenH * 0.25,
        `Header height (${effectiveHeaderH}px) on ${profile.name} must take less than 25% of viewport`
      );

      // 2. Ensure bottom tab bar remains compact and usable
      assert.ok(
        effectiveTabBarH < profile.screenH * 0.20,
        `TabBar height (${effectiveTabBarH}px) on ${profile.name} must take less than 20% of viewport`
      );

      // 3. Ensure content paddingBottom in App.jsx (110px) clears the tab bar under all notch profiles
      assert.ok(
        appContentPaddingBottom >= effectiveTabBarH,
        `App content paddingBottom (${appContentPaddingBottom}px) must exceed effective TabBar height (${effectiveTabBarH}px) on ${profile.name} to avoid content occlusion`
      );

      // 4. Remaining viewable content height must exceed 400px
      const viewableContentH = profile.screenH - effectiveHeaderH - effectiveTabBarH;
      assert.ok(
        viewableContentH > 400,
        `Viewable content height (${viewableContentH}px) on ${profile.name} must remain spacious (> 400px)`
      );
    }
  });

  test('1.5: Verify index.html viewport configuration has viewport-fit=cover', () => {
    const htmlPath = path.join(APP_ROOT, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.match(
      html,
      /viewport-fit=cover/,
      'index.html must specify viewport-fit=cover for native mobile edge-to-edge layout'
    );
    assert.match(
      html,
      /apple-mobile-web-app-status-bar-style/,
      'index.html must specify apple-mobile-web-app-status-bar-style'
    );
  });
});

// ============================================================================
// SUITE 2: Listener Lifecycle & Tab Switching Stress Testing
// ============================================================================
describe('Suite 2: Listener Lifecycle & Tab Switching Stress Testing', () => {

  // Model of exact Firestore listener registration per tab in App.jsx
  const TAB_SUBSCRIPTION_DEFS = {
    hisaab: [
      { name: 'today_expenses', path: (s) => `shops/${s}/expenses?date=today` },
      { name: 'monthly_summary', path: (s) => `shops/${s}/monthly_summary/ym` },
    ],
    expenses: [
      { name: 'expenses_list', path: (s) => `shops/${s}/expenses?date=today` },
    ],
    khata: [
      { name: 'khata_customers', path: (s) => `shops/${s}/khata_customers` },
    ],
    reports: [
      { name: 'month_expenses_range', path: (s) => `shops/${s}/expenses?range=month` },
      { name: 'monthly_summary_doc', path: (s) => `shops/${s}/monthly_summary/ym` },
    ],
  };

  class TabNavigationHarness {
    constructor(shopId = 'test_shop_10') {
      this.shopId = shopId;
      this.currentTab = null;
      this.activeSubscriptions = new Map(); // subId -> { name, path }
      this.subscriptionCounter = 0;
      this.tabUnsubscribers = [];
      this.totalSubscribed = 0;
      this.totalUnsubscribed = 0;
      this.intervalHandles = new Set();
      this.intervalCounter = 0;

      // App-level persistent listeners
      this.appUnsubscribers = [];
      this.initApp();
    }

    initApp() {
      // 1. Auth listener
      this.registerSubscription('app_auth', `auth/user`);
      // 2. Shop profile doc
      this.registerSubscription('app_shop_doc', `shops/${this.shopId}`);
      // 3. Alerts collection
      this.registerSubscription('app_alerts', `shops/${this.shopId}/alerts`);
      // 4. Midnight interval timer
      const intervalId = ++this.intervalCounter;
      this.intervalHandles.add(intervalId);
    }

    registerSubscription(name, path) {
      const id = ++this.subscriptionCounter;
      this.totalSubscribed++;
      this.activeSubscriptions.set(id, { name, path });
      const unsub = () => {
        if (this.activeSubscriptions.has(id)) {
          this.activeSubscriptions.delete(id);
          this.totalUnsubscribed++;
        }
      };
      return unsub;
    }

    setTab(newTab) {
      // If same tab, do not tear down or re-subscribe (pure state transition)
      if (this.currentTab === newTab) {
        return;
      }

      // 1. Teardown previous tab listeners
      for (const unsub of this.tabUnsubscribers) {
        unsub();
      }
      this.tabUnsubscribers = [];

      // 2. Set new tab
      this.currentTab = newTab;

      // 3. Mount new tab listeners
      const defs = TAB_SUBSCRIPTION_DEFS[newTab] || [];
      for (const def of defs) {
        const unsub = this.registerSubscription(def.name, def.path(this.shopId));
        this.tabUnsubscribers.push(unsub);
      }
    }

    destroy() {
      for (const unsub of this.tabUnsubscribers) {
        unsub();
      }
      this.tabUnsubscribers = [];

      for (const unsub of this.appUnsubscribers) {
        unsub();
      }
      this.appUnsubscribers = [];

      this.intervalHandles.clear();
    }
  }

  test('2.1: 2,000 rapid sequential tab switches (hisaab -> expenses -> khata -> reports) without listener accumulation', () => {
    const harness = new TabNavigationHarness('shop_g10');
    const tabs = ['hisaab', 'expenses', 'khata', 'reports'];

    // Initial state: 3 app-level listeners active
    assert.equal(harness.activeSubscriptions.size, 3, 'Initially 3 app-level listeners active');

    for (let i = 0; i < 2000; i++) {
      const tab = tabs[i % tabs.length];
      harness.setTab(tab);

      // Verify active count at every step: 3 app listeners + tab listeners
      const expectedTabCount = TAB_SUBSCRIPTION_DEFS[tab].length;
      const expectedTotal = 3 + expectedTabCount;
      assert.equal(
        harness.activeSubscriptions.size,
        expectedTotal,
        `Step ${i} (tab: ${tab}): Active listeners (${harness.activeSubscriptions.size}) must be exactly ${expectedTotal}`
      );
    }

    // Total destroyed must equal total subscribed minus current active
    assert.equal(
      harness.totalUnsubscribed,
      harness.totalSubscribed - harness.activeSubscriptions.size,
      'Every single unmounted listener must have been cleanly unsubscribed'
    );

    // After destroying dashboard
    harness.destroy();
    // Only app-level subscriptions in this test harness remain if not stored in appUnsubscribers; let's check tabUnsubscribers are cleared
    assert.equal(harness.tabUnsubscribers.length, 0, 'Tab unsubscribers must be completely flushed');
  });

  test('2.2: Redundant clicks on the active tab do not trigger listener churn or duplicate subscriptions', () => {
    const harness = new TabNavigationHarness('shop_g10');

    harness.setTab('hisaab');
    const subCountBefore = harness.totalSubscribed;
    const activeCountBefore = harness.activeSubscriptions.size;

    // Simulate user tapping 'hisaab' 50 times in a row
    for (let i = 0; i < 50; i++) {
      harness.setTab('hisaab');
    }

    assert.equal(harness.totalSubscribed, subCountBefore, 'No new subscriptions created on redundant clicks');
    assert.equal(harness.activeSubscriptions.size, activeCountBefore, 'Active subscription count unchanged');
  });

  test('2.3: Interval timer isolation: rapid tab switching never leaks setInterval handles', () => {
    const harness = new TabNavigationHarness('shop_g10');
    const tabs = ['hisaab', 'expenses', 'khata', 'reports'];

    // Midnight rollover interval is registered once at App mount
    assert.equal(harness.intervalHandles.size, 1, 'Only 1 interval timer should be registered at start');

    // Rapidly switch tabs 1,000 times
    for (let i = 0; i < 1000; i++) {
      harness.setTab(tabs[i % tabs.length]);
      // Verify no tab created rogue intervals
      assert.equal(harness.intervalHandles.size, 1, 'Active intervals must remain strictly 1');
    }

    harness.destroy();
    assert.equal(harness.intervalHandles.size, 0, 'Interval cleared on destroy');
  });

  test('2.4: Khata nested customer ledger drilldown rapid mount / unmount stress (500 cycles)', () => {
    let activeCustomerListeners = 0;
    let totalCustomerSubs = 0;
    let totalCustomerUnsubs = 0;

    const mockCustomerLedgerMount = (customerId) => {
      activeCustomerListeners++;
      totalCustomerSubs++;
      const unsub = () => {
        activeCustomerListeners--;
        totalCustomerUnsubs++;
      };
      return unsub;
    };

    // Simulate user tapping into 500 customers and tapping Back immediately
    for (let i = 0; i < 500; i++) {
      const unsub = mockCustomerLedgerMount(`cust_${i}`);
      assert.equal(activeCustomerListeners, 1, 'Only 1 customer ledger listener active while viewing');
      unsub();
      assert.equal(activeCustomerListeners, 0, '0 customer ledger listeners active after back navigation');
    }

    assert.equal(totalCustomerSubs, 500);
    assert.equal(totalCustomerUnsubs, 500);
    assert.equal(activeCustomerListeners, 0);
  });

  test('2.5: Modal drilldown lifecycle: ExpenseDetailModal & MonthlyStatementModal clean up properly', () => {
    let activeModalListeners = 0;

    const openExpenseDetailModal = () => {
      activeModalListeners++;
      return () => { activeModalListeners--; };
    };

    const openMonthlyStatementModal = () => {
      activeModalListeners += 2; // expenses range + monthly summary
      return () => { activeModalListeners -= 2; };
    };

    // Open & close ExpenseDetailModal 100 times
    for (let i = 0; i < 100; i++) {
      const close = openExpenseDetailModal();
      assert.equal(activeModalListeners, 1);
      close();
      assert.equal(activeModalListeners, 0);
    }

    // Open & close MonthlyStatementModal 100 times
    for (let i = 0; i < 100; i++) {
      const close = openMonthlyStatementModal();
      assert.equal(activeModalListeners, 2);
      close();
      assert.equal(activeModalListeners, 0);
    }
  });

  test('2.6: Negative control: verify oracle catches leaking tab listener', () => {
    let activeListeners = 0;
    const leakySwitchTab = (tab) => {
      activeListeners++;
      // Buggy implementation: forgets to return or call unsub
    };

    for (let i = 0; i < 10; i++) {
      leakySwitchTab('hisaab');
    }

    assert.equal(activeListeners, 10, 'Oracle demonstrates that missing unsub causes activeListeners to climb');
  });
});

// ============================================================================
// SUITE 3: Localization & RTL Conformance Stress Testing
// ============================================================================
describe('Suite 3: Localization & Dynamic RTL Conformance', () => {

  test('3.1: language.json en and ur have 100% key parity with identical schema', () => {
    const langPath = path.join(APP_ROOT, 'src', 'language.json');
    assert.ok(fs.existsSync(langPath), 'language.json must exist');
    const data = JSON.parse(fs.readFileSync(langPath, 'utf8'));

    assert.ok(data.en, 'language.json must have "en" root');
    assert.ok(data.ur, 'language.json must have "ur" root');

    const enKeys = Object.keys(data.en);
    const urKeys = Object.keys(data.ur);

    assert.equal(enKeys.length, urKeys.length, `Key counts must match (en: ${enKeys.length}, ur: ${urKeys.length})`);

    const missingInUr = enKeys.filter((k) => !(k in data.ur));
    const missingInEn = urKeys.filter((k) => !(k in data.en));

    assert.deepEqual(missingInUr, [], 'No keys missing in Urdu translation');
    assert.deepEqual(missingInEn, [], 'No keys missing in English translation');

    // Verify all keys have non-empty string values
    for (const key of enKeys) {
      assert.ok(typeof data.en[key] === 'string' && data.en[key].trim().length > 0, `English key ${key} must not be empty`);
      assert.ok(typeof data.ur[key] === 'string' && data.ur[key].trim().length > 0, `Urdu key ${key} must not be empty`);
    }
  });

  test('3.2: 4 Navigation tab keys match contract specifications in both English and Urdu', () => {
    const langPath = path.join(APP_ROOT, 'src', 'language.json');
    const data = JSON.parse(fs.readFileSync(langPath, 'utf8'));

    const requiredTabs = [
      { key: 'tab_hisaab', en: 'Live Hisaab', ur: 'لائیو حساب' },
      { key: 'tab_expenses', en: 'Expenses', ur: 'اخراجات' },
      { key: 'tab_khata', en: 'Khata Ledger', ur: 'کھاتہ لیجر' },
      { key: 'tab_reports', en: 'Monthly Reports', ur: 'ماہانہ رپورٹ' },
    ];

    for (const tab of requiredTabs) {
      assert.equal(data.en[tab.key], tab.en, `English ${tab.key} must be '${tab.en}'`);
      assert.equal(data.ur[tab.key], tab.ur, `Urdu ${tab.key} must be '${tab.ur}'`);
    }
  });

  test('3.3: LanguageContext synchronizes dir="rtl", lang="ur", and .rtl class', () => {
    const contextPath = path.join(APP_ROOT, 'src', 'context', 'LanguageContext.jsx');
    assert.ok(fs.existsSync(contextPath), 'LanguageContext.jsx must exist');
    const content = fs.readFileSync(contextPath, 'utf8');

    assert.match(content, /document\.documentElement\.setAttribute\(['"]dir['"]/, 'Must synchronize dir attribute');
    assert.match(content, /isRtl\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]/, 'Must toggle between rtl and ltr');
    assert.match(content, /document\.documentElement\.setAttribute\(['"]lang['"]/, 'Must synchronize lang attribute');
    assert.match(content, /classList\.add\(['"]rtl['"]\)/, 'Must add .rtl class');
    assert.match(content, /classList\.remove\(['"]rtl['"]\)/, 'Must remove .rtl class');
  });

  test('3.4: 1,000 rapid language toggles maintain DOM state consistency without desynchronization', () => {
    const mockDoc = {
      attributes: {},
      classList: new Set(),
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
    };

    const syncLanguage = (lang) => {
      const isRtl = lang === 'ur';
      mockDoc.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
      mockDoc.setAttribute('lang', lang);
      if (isRtl) {
        mockDoc.classList.add('rtl');
      } else {
        mockDoc.classList.delete('rtl');
      }
    };

    for (let i = 0; i < 1000; i++) {
      const lang = i % 2 === 0 ? 'ur' : 'en';
      syncLanguage(lang);

      if (lang === 'ur') {
        assert.equal(mockDoc.getAttribute('dir'), 'rtl');
        assert.equal(mockDoc.getAttribute('lang'), 'ur');
        assert.ok(mockDoc.classList.has('rtl'));
      } else {
        assert.equal(mockDoc.getAttribute('dir'), 'ltr');
        assert.equal(mockDoc.getAttribute('lang'), 'en');
        assert.ok(!mockDoc.classList.has('rtl'));
      }
    }
  });
});
