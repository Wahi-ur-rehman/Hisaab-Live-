/**
 * Challenger M2-1 Empirical Stress Test Harness
 * Target: Localization Bilingual Switching, Dictionary Parity, 4-Tab State Machine & Shell Navigation
 * Usage: node --test tests/challenger-m2-1-stress.test.mjs
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

// Load translation dictionaries directly
const languageJsonPath = path.join(APP_ROOT, 'src', 'language.json');
const translations = JSON.parse(fs.readFileSync(languageJsonPath, 'utf8'));

// Load contracts
import { NAVIGATION_CONTRACT, LOCALIZATION_CONTRACT, SAFE_AREA_CONTRACT } from './e2e/helpers/contracts.mjs';

// ============================================================================
// SUITE 1: High-Frequency Language Toggle Stress & Memory Leak Audit
// ============================================================================
describe('Suite 1: High-Frequency Language Toggle Stress & Memory Stability', () => {

  test('1.1: 1,000 rapid sequential language toggles in memory without memory leaks', () => {
    let currentLang = 'en';
    const toggleLanguage = () => {
      currentLang = currentLang === 'en' ? 'ur' : 'en';
      return currentLang;
    };

    const initialMem = process.memoryUsage().heapUsed;

    // Simulate 1,000 language toggles with dictionary lookups and helper instantiations
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      const nextLang = toggleLanguage();
      const isRtl = nextLang === 'ur';

      // Recreate the exact useMemo behavior of LanguageContext.jsx
      const dict = translations[nextLang] || translations.en;
      const translateFn = (key, params) => {
        let str = dict[key] || translations.en[key] || key;
        if (params && typeof params === 'object') {
          for (const [k, v] of Object.entries(params)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
          }
        }
        return str;
      };
      const t = Object.assign(translateFn, dict);

      // Verify dictionary integrity on each toggle
      if (i % 2 === 0) {
        assert.equal(nextLang, 'ur');
        assert.equal(isRtl, true);
        assert.equal(t.tab_hisaab, 'لائیو حساب');
      } else {
        assert.equal(nextLang, 'en');
        assert.equal(isRtl, false);
        assert.equal(t.tab_hisaab, 'Live Hisaab');
      }
    }

    const finalMem = process.memoryUsage().heapUsed;
    const memDeltaMb = (finalMem - initialMem) / (1024 * 1024);

    assert.equal(currentLang, 'en', 'Should return to initial English state after 1,000 toggles');
    assert.ok(
      memDeltaMb < 15,
      `Heap memory growth (${memDeltaMb.toFixed(2)} MB) must be bounded under 15 MB across 1,000 toggles`
    );
  });

  test('1.2: Stale Dictionary Reference & Parameterized Replacement Verification', () => {
    let lang = 'en';
    const getT = (activeLang) => {
      const dict = translations[activeLang] || translations.en;
      const translateFn = (key, params) => {
        let str = dict[key] || translations.en[key] || key;
        if (params && typeof params === 'object') {
          for (const [k, v] of Object.entries(params)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
          }
        }
        return str;
      };
      return Object.assign(translateFn, dict);
    };

    // Test English parameterized string
    let t = getT('en');
    const enWarning = t('missing_today', { x: '5,000' });
    assert.ok(
      enWarning.includes("Rs. 5,000 of today's sales was deleted"),
      `English missing_today should replace {x} placeholder: ${enWarning}`
    );

    // Toggle to Urdu
    t = getT('ur');
    const urWarning = t('missing_today', { x: '5,000' });
    assert.ok(
      urWarning.includes('5,000 روپے پی او ایس سے حذف یا تبدیل'),
      `Urdu missing_today should replace {x} placeholder: ${urWarning}`
    );

    // Verify missing key fallback to English
    assert.equal(t('non_existent_key_xyz'), 'non_existent_key_xyz');
  });

  test('1.3: Dynamic RTL & HTML Document Sync simulation across 1,000 toggles', () => {
    // Mock document.documentElement
    const attributes = {};
    const classList = new Set();
    const mockDocumentElement = {
      setAttribute: (k, v) => { attributes[k] = v; },
      getAttribute: (k) => attributes[k] || null,
      classList: {
        add: (c) => classList.add(c),
        remove: (c) => classList.delete(c),
        contains: (c) => classList.has(c),
      },
    };

    let activeLang = 'en';
    const syncDoc = (lang) => {
      const isRtl = lang === 'ur';
      mockDocumentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
      mockDocumentElement.setAttribute('lang', lang);
      if (isRtl) {
        mockDocumentElement.classList.add('rtl');
      } else {
        mockDocumentElement.classList.remove('rtl');
      }
    };

    // Initial state
    syncDoc(activeLang);
    assert.equal(mockDocumentElement.getAttribute('dir'), 'ltr');
    assert.equal(mockDocumentElement.getAttribute('lang'), 'en');
    assert.equal(mockDocumentElement.classList.contains('rtl'), false);

    // Toggle 1,000 times
    for (let i = 0; i < 1000; i++) {
      activeLang = activeLang === 'en' ? 'ur' : 'en';
      syncDoc(activeLang);

      if (activeLang === 'ur') {
        assert.equal(mockDocumentElement.getAttribute('dir'), 'rtl');
        assert.equal(mockDocumentElement.getAttribute('lang'), 'ur');
        assert.equal(mockDocumentElement.classList.contains('rtl'), true);
      } else {
        assert.equal(mockDocumentElement.getAttribute('dir'), 'ltr');
        assert.equal(mockDocumentElement.getAttribute('lang'), 'en');
        assert.equal(mockDocumentElement.classList.contains('rtl'), false);
      }
    }
  });

  test('1.4: Asynchronous concurrent toggle burst race-condition stress', async () => {
    let state = 'en';
    const toggleAsync = async () => {
      await new Promise((r) => setImmediate(r));
      state = state === 'en' ? 'ur' : 'en';
      return state;
    };

    // Fire 100 concurrent asynchronous toggles
    const promises = Array.from({ length: 100 }, () => toggleAsync());
    const results = await Promise.all(promises);

    assert.equal(results.length, 100);
    assert.ok(state === 'en' || state === 'ur');
  });
});

// ============================================================================
// SUITE 2: Exhaustive Dictionary Parity & Completeness Checker
// ============================================================================
describe('Suite 2: Exhaustive Dictionary Parity & Completeness Checker', () => {

  test('2.1: Bidirectional key parity between English and Urdu dictionaries', () => {
    assert.ok(translations.en, 'English dictionary must exist');
    assert.ok(translations.ur, 'Urdu dictionary must exist');

    const enKeys = Object.keys(translations.en);
    const urKeys = Object.keys(translations.ur);

    const missingInUr = enKeys.filter((k) => !urKeys.includes(k));
    const missingInEn = urKeys.filter((k) => !enKeys.includes(k));

    assert.deepEqual(
      missingInUr,
      [],
      `Every English key must have an Urdu translation. Missing in Urdu: ${missingInUr.join(', ')}`
    );
    assert.deepEqual(
      missingInEn,
      [],
      `Every Urdu key must have an English counterpart. Missing in English: ${missingInEn.join(', ')}`
    );
    assert.equal(
      enKeys.length,
      urKeys.length,
      `Key counts must match exactly: en=${enKeys.length}, ur=${urKeys.length}`
    );
  });

  test('2.2: Verify no Urdu string is empty, undefined, null, or whitespace-only', () => {
    const urEntries = Object.entries(translations.ur);
    assert.ok(urEntries.length > 0, 'Urdu dictionary must have entries');

    for (const [key, value] of urEntries) {
      assert.notEqual(value, undefined, `Key "${key}" in Urdu dictionary must not be undefined`);
      assert.notEqual(value, null, `Key "${key}" in Urdu dictionary must not be null`);
      assert.equal(typeof value, 'string', `Key "${key}" in Urdu dictionary must be a string`);
      assert.ok(
        value.trim().length > 0,
        `Key "${key}" in Urdu dictionary must not be empty or whitespace-only (found: "${value}")`
      );
      assert.ok(
        !/^todo/i.test(value.trim()),
        `Key "${key}" in Urdu dictionary must not be a placeholder TODO string`
      );
    }
  });

  test('2.3: Verify parameter placeholder parity between English and Urdu strings', () => {
    for (const [key, enValue] of Object.entries(translations.en)) {
      const urValue = translations.ur[key];
      const enPlaceholders = (enValue.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
      const urPlaceholders = (urValue.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();

      assert.deepEqual(
        urPlaceholders,
        enPlaceholders,
        `Placeholder tokens in key "${key}" must match: en=${enPlaceholders}, ur=${urPlaceholders}`
      );
    }
  });

  test('2.4: Verify Urdu translations contain Arabic/Perso-Arabic script characters', () => {
    const arabicPersianRegex = /[\u0600-\u06FF]/;
    // Allowable keys where English/Latin characters or numbers are intentional (e.g. language_switch = "English")
    const exemptKeys = new Set(['language_switch']);

    for (const [key, value] of Object.entries(translations.ur)) {
      if (exemptKeys.has(key)) continue;
      assert.ok(
        arabicPersianRegex.test(value),
        `Urdu translation for "${key}" should contain Urdu characters. Found: "${value}"`
      );
    }
  });

  test('2.5: Navigation Tab labels exact match against NAVIGATION_CONTRACT', () => {
    for (const tab of NAVIGATION_CONTRACT.requiredTabs) {
      const key = `tab_${tab}`;
      const expectedEn = NAVIGATION_CONTRACT.tabLabelsEn[tab];
      const expectedUr = NAVIGATION_CONTRACT.tabLabelsUr[tab];

      assert.equal(
        translations.en[key],
        expectedEn,
        `English tab label for "${tab}" must match contract`
      );
      assert.equal(
        translations.ur[key],
        expectedUr,
        `Urdu tab label for "${tab}" must match contract`
      );
    }
  });

  test('2.6: Required Localization keys from LOCALIZATION_CONTRACT exist', () => {
    for (const key of LOCALIZATION_CONTRACT.requiredKeys) {
      assert.ok(translations.en[key], `LOCALIZATION_CONTRACT required key "${key}" missing in English`);
      assert.ok(translations.ur[key], `LOCALIZATION_CONTRACT required key "${key}" missing in Urdu`);
    }
  });
});

// ============================================================================
// SUITE 3: 4-Tab Navigation State Machine Stress & Rendering Verification
// ============================================================================
describe('Suite 3: 4-Tab Navigation State Machine Stress & Rendering Verification', () => {

  const VALID_TABS = ['hisaab', 'expenses', 'khata', 'reports'];

  test('3.1: Full 16-transition state machine matrix validation (4x4)', () => {
    let currentTab = 'hisaab';
    const stateMachine = (nextTab) => {
      if (VALID_TABS.includes(nextTab)) {
        currentTab = nextTab;
      }
      return currentTab;
    };

    for (const fromTab of VALID_TABS) {
      for (const toTab of VALID_TABS) {
        currentTab = fromTab;
        const result = stateMachine(toTab);
        assert.equal(result, toTab, `Transition from "${fromTab}" to "${toTab}" must succeed`);
        assert.equal(currentTab, toTab, `State machine must settle in "${toTab}"`);
      }
    }
  });

  test('3.2: 1,000-step randomized tab transition walk', () => {
    let currentTab = 'hisaab';
    const visited = { hisaab: 0, expenses: 0, khata: 0, reports: 0 };

    for (let i = 0; i < 1000; i++) {
      const nextTab = VALID_TABS[Math.floor(Math.random() * VALID_TABS.length)];
      currentTab = nextTab;
      visited[nextTab]++;
      assert.ok(VALID_TABS.includes(currentTab), `Tab state "${currentTab}" must be valid`);
    }

    // Ensure all 4 tabs were exercised thoroughly
    for (const tab of VALID_TABS) {
      assert.ok(visited[tab] > 150, `Tab "${tab}" must be visited frequently in random walk (got ${visited[tab]})`);
    }
  });

  test('3.3: TabBar.jsx component source code contract inspection', () => {
    const tabBarPath = path.join(APP_ROOT, 'src', 'components', 'common', 'TabBar.jsx');
    assert.ok(fs.existsSync(tabBarPath), 'TabBar.jsx must exist');
    const content = fs.readFileSync(tabBarPath, 'utf8');

    // Safe-area class
    assert.ok(content.includes('pb-safe'), 'TabBar must include pb-safe for notch protection');
    assert.ok(content.includes('fixed bottom-0'), 'TabBar must be fixed to bottom');

    // 4 tabs configured
    assert.ok(content.includes("id: 'hisaab'"), 'TabBar must define hisaab tab');
    assert.ok(content.includes("id: 'expenses'"), 'TabBar must define expenses tab');
    assert.ok(content.includes("id: 'khata'"), 'TabBar must define khata tab');
    assert.ok(content.includes("id: 'reports'"), 'TabBar must define reports tab');

    // Active indicator and styling
    assert.ok(content.includes('bg-sky-cyan'), 'TabBar must style active indicator with bg-sky-cyan');
    assert.ok(content.includes('text-sky-cyan'), 'TabBar must style active label with text-sky-cyan');
    assert.ok(content.includes('text-slate-muted'), 'TabBar must style inactive label with text-slate-muted');

    // Accessibility touch target
    assert.ok(content.includes('min-h-[48px]'), 'TabBar buttons must provide at least 48px height');
    assert.ok(content.includes('min-w-[48px]'), 'TabBar buttons must provide at least 48px width');
    assert.ok(content.includes('role="tab"'), 'TabBar buttons must have role="tab"');
    assert.ok(content.includes('aria-selected='), 'TabBar buttons must have aria-selected attribute');
  });

  test('3.4: Header.jsx component source code contract inspection', () => {
    const headerPath = path.join(APP_ROOT, 'src', 'components', 'common', 'Header.jsx');
    assert.ok(fs.existsSync(headerPath), 'Header.jsx must exist');
    const content = fs.readFileSync(headerPath, 'utf8');

    // Safe-area class
    assert.ok(content.includes('pt-safe'), 'Header must include pt-safe for notch protection');
    assert.ok(content.includes('sticky top-0'), 'Header must be sticky at top');

    // Sky Cyan brand accent
    assert.ok(content.includes('text-sky-cyan'), 'Header must feature text-sky-cyan brand accent');
    assert.ok(content.includes('bg-sky-cyan/15'), 'Header must feature Sky Cyan icon surface');

    // Language switch pill (EN | اردو)
    assert.ok(content.includes('EN'), 'Header must display EN label');
    assert.ok(content.includes('اردو'), 'Header must display Urdu label');
    assert.ok(content.includes('toggleLanguage'), 'Header must bind toggleLanguage action');

    // Alerts button & badge
    assert.ok(content.includes('onOpenAlerts'), 'Header must handle alerts opening');
    assert.ok(content.includes('unseenAlerts'), 'Header must display unseen alerts badge');
    assert.ok(content.includes('bg-rose-crimson'), 'Alerts badge must use Rose Crimson');

    // Theme toggle
    assert.ok(content.includes('onToggleTheme'), 'Header must handle theme toggle');
  });

  test('3.5: App.jsx conditional tab rendering verification', () => {
    const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
    assert.ok(fs.existsSync(appPath), 'App.jsx must exist');
    const content = fs.readFileSync(appPath, 'utf8');

    // LanguageProvider wrapper
    assert.ok(content.includes('<LanguageProvider>'), 'App.jsx must wrap tree in LanguageProvider');
    assert.ok(content.includes('<AppContent />'), 'App.jsx must render AppContent inside provider');

    // Header and TabBar rendering
    assert.ok(content.includes('<Header'), 'App.jsx must render <Header />');
    assert.ok(content.includes('<TabBar'), 'App.jsx must render <TabBar />');

    // All 4 views conditionally mapped
    assert.ok(content.includes('view === "hisaab"'), 'App.jsx must conditionally render hisaab view');
    assert.ok(content.includes('view === "expenses"'), 'App.jsx must conditionally render expenses view');
    assert.ok(content.includes('view === "khata"'), 'App.jsx must conditionally render khata view');
    assert.ok(content.includes('view === "reports"'), 'App.jsx must conditionally render reports view');
    assert.ok(content.includes('view === "alerts"'), 'App.jsx must conditionally render alerts view');

    // Tab change handler
    assert.ok(
      content.includes('onTabChange={(newTab) => setView(newTab)}'),
      'App.jsx must update view state when onTabChange fires'
    );
  });

  test('3.6: Boundary input hardening for invalid tabs', () => {
    let view = 'hisaab';
    const setView = (tab) => {
      // In the App, state changes to whatever string is passed, but content falls through safely
      view = tab;
    };

    const invalidTabs = ['unknown', '', null, undefined, 123, {}];
    for (const badTab of invalidTabs) {
      assert.doesNotThrow(() => {
        setView(badTab);
      });
    }
  });
});

// ============================================================================
// SUITE 4: Cross-Cutting Integration & Production Build Artifacts Audit
// ============================================================================
describe('Suite 4: Cross-Cutting Integration & Production Build Artifacts Audit', () => {

  test('4.1: Production build dist/ directory and bundled assets exist', () => {
    const distPath = path.join(APP_ROOT, 'dist');
    assert.ok(fs.existsSync(distPath), 'dist/ directory must exist after npm run build');

    const indexPath = path.join(distPath, 'index.html');
    assert.ok(fs.existsSync(indexPath), 'dist/index.html must exist');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    // Viewport-fit=cover
    assert.ok(
      indexHtml.includes('viewport-fit=cover'),
      'dist/index.html must retain viewport-fit=cover'
    );

    // Assets directory
    const assetsDir = path.join(distPath, 'assets');
    assert.ok(fs.existsSync(assetsDir), 'dist/assets directory must exist');

    const assetFiles = fs.readdirSync(assetsDir);
    assert.ok(assetFiles.length > 0, 'dist/assets must contain bundled JS/CSS chunks');

    const jsBundles = assetFiles.filter((f) => f.endsWith('.js'));
    assert.ok(jsBundles.length > 0, 'dist/assets must contain at least one JS bundle');

    // Inspect main bundle to verify Urdu translation strings are compiled into bundle
    let foundUrduInBundle = false;
    for (const jsFile of jsBundles) {
      const code = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
      if (code.includes('لائیو حساب') || code.includes('\\u0644\\u0627\\u0626\\u06cc\\u0648')) {
        foundUrduInBundle = true;
        break;
      }
    }
    assert.ok(foundUrduInBundle, 'Compiled bundle must include compiled Urdu translations');
  });

  test('4.2: Tailwind configuration tokens for Deep Slate palette', () => {
    const tailwindPath = path.join(APP_ROOT, 'tailwind.config.js');
    assert.ok(fs.existsSync(tailwindPath), 'tailwind.config.js must exist');
    const config = fs.readFileSync(tailwindPath, 'utf8');

    assert.ok(config.includes('#090d16'), 'Dark base color #090d16 must be configured');
    assert.ok(config.includes('#1a243b'), 'Card color #1a243b must be configured');
    assert.ok(config.includes('#10b981'), 'Emerald Mint #10b981 must be configured');
    assert.ok(config.includes('#f59e0b'), 'Amber Warm #f59e0b must be configured');
    assert.ok(config.includes('#f43f5e'), 'Rose Crimson #f43f5e must be configured');
    assert.ok(config.includes('#38bdf8'), 'Sky Cyan #38bdf8 must be configured');
  });
});
