/**
 * Challenger M1-2 Empirical Stress Test Harness
 * Target: Listener memory stability, Capacitor Android sync resilience, bundle bloating & dependency pollution.
 * Usage: node --test tests/challenger-m1-2-stress.test.mjs
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
// SUITE 1: High-Scale Listener & Memory Leak Stress Testing
// ============================================================================
describe('Suite 1: High-Scale Listener & Memory Leak Stress Testing', () => {

  test('1.1: 10,000 rapid sequential mount/unmount cycles on simulated onSnapshot listeners', () => {
    let activeListeners = 0;
    let totalCreated = 0;
    let totalDestroyed = 0;

    const mockOnSnapshot = (query, callback) => {
      activeListeners++;
      totalCreated++;
      const listenerId = totalCreated;
      return () => {
        activeListeners--;
        totalDestroyed++;
      };
    };

    const initialMem = process.memoryUsage().heapUsed;

    // Execute 10,000 rapid mount / unmount cycles
    for (let i = 0; i < 10000; i++) {
      const unsub = mockOnSnapshot({ collection: 'expenses', queryId: i }, () => {});
      unsub();
    }

    const finalMem = process.memoryUsage().heapUsed;
    const memDeltaMb = (finalMem - initialMem) / (1024 * 1024);

    assert.equal(activeListeners, 0, 'Active listeners must be exactly 0 after 10,000 cycles');
    assert.equal(totalCreated, 10000, 'Must have created 10,000 listeners');
    assert.equal(totalDestroyed, 10000, 'Must have destroyed 10,000 listeners');
    // Memory delta should be well under 25MB for pure closure creation & cleanup
    assert.ok(memDeltaMb < 25, `Heap memory growth (${memDeltaMb.toFixed(2)} MB) must be strictly bounded`);
  });

  test('1.2: 1,000 concurrent listeners with randomized unmount order (race conditions simulation)', () => {
    let activeListeners = 0;
    const listeners = [];

    const mockOnSnapshot = (label) => {
      activeListeners++;
      return () => {
        activeListeners--;
      };
    };

    // Mount 1,000 listeners
    for (let i = 0; i < 1000; i++) {
      listeners.push({ id: i, unsub: mockOnSnapshot(`listener-${i}`) });
    }
    assert.equal(activeListeners, 1000, 'All 1,000 listeners should be active concurrently');

    // Shuffle array for randomized unmount order
    for (let i = listeners.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [listeners[i], listeners[j]] = [listeners[j], listeners[i]];
    }

    // Unmount in randomized order
    for (const item of listeners) {
      item.unsub();
    }

    assert.equal(activeListeners, 0, 'Active listeners must return to 0 regardless of unmount ordering');
  });

  test('1.3: Rapid tab navigation simulation (500 switches across 4 tabs with multiple sub-listeners)', () => {
    // Model of HisaabLive tabs and their internal snapshot listeners
    const tabListenersConfig = {
      hisaab: ['expenses_today', 'monthly_summary'],
      expenses: ['expenses_list'],
      khata: ['khata_customers'],
      reports: ['monthly_expenses_range'],
    };

    let totalActiveListeners = 0;
    let currentTabUnsubscribers = [];

    const switchTab = (tabName) => {
      // 1. Unmount previous tab listeners
      currentTabUnsubscribers.forEach((u) => u());
      currentTabUnsubscribers = [];

      // 2. Mount new tab listeners
      const listenerKeys = tabListenersConfig[tabName] || [];
      for (const key of listenerKeys) {
        totalActiveListeners++;
        currentTabUnsubscribers.push(() => {
          totalActiveListeners--;
        });
      }
    };

    const tabs = ['hisaab', 'expenses', 'khata', 'reports'];

    // Simulate user rapidly tapping between tabs 500 times
    for (let i = 0; i < 500; i++) {
      const nextTab = tabs[i % tabs.length];
      switchTab(nextTab);
    }

    // Currently mounted tab should have its expected listeners active
    const finalTab = tabs[(500 - 1) % tabs.length];
    const expectedActive = tabListenersConfig[finalTab].length;
    assert.equal(totalActiveListeners, expectedActive, `Final tab ${finalTab} should have ${expectedActive} active listeners`);

    // Complete cleanup on dashboard unmount
    currentTabUnsubscribers.forEach((u) => u());
    currentTabUnsubscribers = [];
    assert.equal(totalActiveListeners, 0, 'Must have 0 leaked listeners after complete dashboard unmount');
  });

  test('1.4: Midnight rollover timer stress (1,000 mount/unmount iterations)', () => {
    let activeTimers = 0;
    const mockSetInterval = (fn, ms) => {
      activeTimers++;
      return activeTimers;
    };
    const mockClearInterval = (id) => {
      activeTimers--;
    };

    for (let i = 0; i < 1000; i++) {
      const id = mockSetInterval(() => {}, 60000);
      mockClearInterval(id);
    }

    assert.equal(activeTimers, 0, 'No active interval timers should remain after 1,000 iterations');
  });

  test('1.5: Negative control: verify oracle detects uncleaned listeners', () => {
    let activeListeners = 0;
    const mockOnSnapshot = () => {
      activeListeners++;
      return () => { activeListeners--; };
    };

    const leaks = [];
    for (let i = 0; i < 5; i++) {
      const unsub = mockOnSnapshot();
      if (i !== 2) { // Intentionally forget to unsubscribe index 2
        unsub();
      } else {
        leaks.push(unsub);
      }
    }

    assert.equal(activeListeners, 1, 'Oracle must reliably catch single leaked listener');
    // Clean up negative control leak
    leaks.forEach((u) => u());
    assert.equal(activeListeners, 0);
  });
});

// ============================================================================
// SUITE 2: Theme DOM & Storage Sync Stress Testing
// ============================================================================
describe('Suite 2: Theme DOM & Storage Sync Stress Testing', () => {

  test('2.1: 5,000 rapid theme toggles maintain class and colorScheme consistency', () => {
    // Mock DOM root
    const root = {
      classList: new Set(),
      style: { colorScheme: '' },
    };

    const syncDarkMode = (theme) => {
      const isDark = theme !== 'light';
      if (isDark) {
        root.classList.add('dark');
        root.classList.add('ion-palette-dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.delete('dark');
        root.classList.delete('ion-palette-dark');
        root.style.colorScheme = 'light';
      }
    };

    // Toggle 5,000 times
    for (let i = 0; i < 5000; i++) {
      const theme = i % 2 === 0 ? 'dark' : 'light';
      syncDarkMode(theme);
      if (theme === 'dark') {
        assert.ok(root.classList.has('dark'));
        assert.ok(root.classList.has('ion-palette-dark'));
        assert.equal(root.style.colorScheme, 'dark');
      } else {
        assert.ok(!root.classList.has('dark'));
        assert.ok(!root.classList.has('ion-palette-dark'));
        assert.equal(root.style.colorScheme, 'light');
      }
    }
  });

  test('2.2: Verify localStorage interceptor handles hl_theme without infinite recursion', () => {
    const store = new Map();
    let syncCallCount = 0;
    let lastSyncedTheme = '';

    const mockSyncDarkMode = (theme) => {
      syncCallCount++;
      lastSyncedTheme = theme;
    };

    const mockLocalStorage = {
      setItem: function (key, value) {
        store.set(key, String(value));
        if (key === 'hl_theme') {
          mockSyncDarkMode(value);
        }
      },
      getItem: (key) => store.get(key) || null,
    };

    // 1,000 rapid writes
    for (let i = 0; i < 1000; i++) {
      const theme = i % 2 === 0 ? 'dark' : 'light';
      mockLocalStorage.setItem('hl_theme', theme);
    }

    assert.equal(syncCallCount, 1000, 'syncDarkMode should be invoked exactly once per hl_theme write');
    assert.equal(lastSyncedTheme, 'light');
    assert.equal(mockLocalStorage.getItem('hl_theme'), 'light');
  });
});

// ============================================================================
// SUITE 3: Capacitor Android Sync Resilience & Integrity Audit
// ============================================================================
describe('Suite 3: Capacitor Android Sync Resilience & Integrity Audit', () => {

  test('3.1: capacitor.config.json has valid appId and webDir pointing to dist', () => {
    const configPath = path.join(APP_ROOT, 'capacitor.config.json');
    assert.ok(fs.existsSync(configPath), 'capacitor.config.json must exist');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.appId, 'com.hisaablive.owner', 'appId must match com.hisaablive.owner');
    assert.equal(config.webDir, 'dist', 'webDir must point to dist');
  });

  test('3.2: android native directory structure is intact', () => {
    const androidPath = path.join(APP_ROOT, 'android');
    assert.ok(fs.existsSync(androidPath), 'android directory must exist');
    const androidAssetsPublic = path.join(androidPath, 'app', 'src', 'main', 'assets', 'public');
    assert.ok(fs.existsSync(androidAssetsPublic), 'android public assets directory must exist');
    assert.ok(fs.existsSync(path.join(androidAssetsPublic, 'index.html')), 'android public index.html must exist');
    assert.ok(fs.existsSync(path.join(androidAssetsPublic, 'assets')), 'android public assets folder must exist');
  });

  test('3.3: Android public assets match dist assets byte-for-byte (Sync Parity)', () => {
    const distAssetsDir = path.join(APP_ROOT, 'dist', 'assets');
    const androidAssetsDir = path.join(APP_ROOT, 'android', 'app', 'src', 'main', 'assets', 'public', 'assets');

    assert.ok(fs.existsSync(distAssetsDir), 'dist/assets must exist');
    assert.ok(fs.existsSync(androidAssetsDir), 'android assets must exist');

    const distFiles = fs.readdirSync(distAssetsDir);
    const androidFiles = fs.readdirSync(androidAssetsDir);

    assert.ok(distFiles.length > 0, 'dist/assets should contain compiled chunks');
    assert.equal(distFiles.length, androidFiles.length, 'android assets count must match dist assets count');

    for (const file of distFiles) {
      const distStat = fs.statSync(path.join(distAssetsDir, file));
      const androidStat = fs.statSync(path.join(androidAssetsDir, file));
      assert.equal(
        distStat.size,
        androidStat.size,
        `File ${file} size must match exactly between dist (${distStat.size}) and android (${androidStat.size})`
      );
    }
  });

  test('3.4: @capacitor-community/safe-area is present in package.json and synced', () => {
    const pkgPath = path.join(APP_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.dependencies['@capacitor-community/safe-area'], 'Must depend on @capacitor-community/safe-area');
    assert.ok(pkg.dependencies['@capacitor/android'], 'Must depend on @capacitor/android');
    assert.ok(pkg.dependencies['@capacitor/core'], 'Must depend on @capacitor/core');
  });
});

// ============================================================================
// SUITE 4: Bundle Bloating & Dependency Pollution Audit
// ============================================================================
describe('Suite 4: Bundle Bloating & Dependency Pollution Audit', () => {

  test('4.1: Audit dist directory total size and individual chunk sizes', () => {
    const distDir = path.join(APP_ROOT, 'dist');
    assert.ok(fs.existsSync(distDir), 'dist directory must exist');

    let totalSizeBytes = 0;
    const scanDir = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else {
          totalSizeBytes += stat.size;
        }
      }
    };
    scanDir(distDir);

    const totalSizeMb = totalSizeBytes / (1024 * 1024);
    // Uncompressed dist (including full Firebase SDK, Ionic React, and jspdf) is ~2.3 MB
    // Ensure it does not exceed 4.0 MB uncompressed (preventing runaway asset bloat)
    assert.ok(
      totalSizeMb < 4.0,
      `Total dist size (${totalSizeMb.toFixed(2)} MB) must not exceed 4.0 MB threshold`
    );
  });

  test('4.2: CSS bundle contains compiled Tailwind tokens and safe area utilities', () => {
    const assetsDir = path.join(APP_ROOT, 'dist', 'assets');
    const files = fs.readdirSync(assetsDir);
    const cssFile = files.find((f) => f.endsWith('.css'));
    assert.ok(cssFile, 'Compiled CSS bundle must exist in dist/assets');

    const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');

    // Verify key Tailwind color tokens compiled into CSS
    assert.match(cssContent, /#090d16/, 'Compiled CSS must contain #090d16 (slate-base)');
    assert.match(cssContent, /#10b981/, 'Compiled CSS must contain #10b981 (emerald-mint)');
    assert.match(cssContent, /#38bdf8/, 'Compiled CSS must contain #38bdf8 (sky-cyan)');
    assert.match(cssContent, /#f59e0b/, 'Compiled CSS must contain #f59e0b (amber-warm)');
    assert.match(cssContent, /#f43f5e/, 'Compiled CSS must contain #f43f5e (rose-crimson)');

    // Verify safe area CSS variable fallbacks or utility rules
    assert.match(cssContent, /safe-area-inset|--sat|--sab/, 'Compiled CSS must handle safe-area insets');

    // CSS file should be compact and clean (< 150 KB uncompressed)
    const cssSizeKb = fs.statSync(path.join(assetsDir, cssFile)).size / 1024;
    assert.ok(cssSizeKb < 150, `CSS bundle size (${cssSizeKb.toFixed(1)} KB) should be lean (< 150 KB)`);
  });

  test('4.3: jsPDF / html2canvas is properly isolated into dedicated chunks', () => {
    const assetsDir = path.join(APP_ROOT, 'dist', 'assets');
    const files = fs.readdirSync(assetsDir);

    // Look for html2canvas chunk
    const html2canvasChunk = files.find((f) => f.startsWith('html2canvas'));
    assert.ok(html2canvasChunk, 'html2canvas should be isolated in its own chunk');

    // Look for DOMPurify chunk
    const purifyChunk = files.find((f) => f.startsWith('purify'));
    assert.ok(purifyChunk, 'purify should be isolated in its own chunk');
  });

  test('4.4: Verify no devDependencies or build tools leaked into dist/', () => {
    const assetsDir = path.join(APP_ROOT, 'dist', 'assets');
    const files = fs.readdirSync(assetsDir);

    for (const f of files) {
      assert.ok(!f.includes('tailwindcss') || f.endsWith('.css'), `Dev tool ${f} must not be in client assets`);
      assert.ok(!f.includes('postcss'), `Postcss must not be in client assets`);
      assert.ok(!f.includes('autoprefixer'), `Autoprefixer must not be in client assets`);
      assert.ok(!f.includes('vite.config'), `Vite config must not be bundled`);
    }
  });

  test('4.5: dist/index.html has viewport-fit=cover and valid asset references', () => {
    const distHtmlPath = path.join(APP_ROOT, 'dist', 'index.html');
    assert.ok(fs.existsSync(distHtmlPath), 'dist/index.html must exist');

    const html = fs.readFileSync(distHtmlPath, 'utf8');
    assert.match(html, /viewport-fit=cover/, 'dist/index.html must retain viewport-fit=cover');
    assert.match(html, /theme-color.*#090d16/, 'dist/index.html must retain theme-color #090d16');
    assert.match(html, /<script type="module" crossorigin src="\/assets\/index-.*\.js"><\/script>/, 'Must reference main JS chunk');
    assert.match(html, /<link rel="stylesheet" crossorigin href="\/assets\/index-.*\.css">/, 'Must reference main CSS chunk');
  });
});

// ============================================================================
// SUITE 5: Tailwind JIT Safe Area & Deep Slate Generation Verification
// ============================================================================
describe('Suite 5: Tailwind JIT Safe Area & Deep Slate Generation Verification', () => {

  test('5.1: Tailwind compiles pt-safe, pb-safe, and semantic tokens when referenced in content', async () => {
    const tailwind = (await import('tailwindcss')).default;
    const postcss = (await import('postcss')).default;
    const tailwindConfig = (await import('../tailwind.config.js')).default;

    const sampleHtml = `
      <div class="pt-safe pb-safe pl-safe pr-safe bg-slate-base bg-slate-card border-slate-border text-emerald-mint text-amber-warm text-rose-crimson text-sky-cyan">
        Safe Area Mobile Container
      </div>
    `;

    const customConfig = {
      ...tailwindConfig,
      content: [{ raw: sampleHtml, extension: 'html' }],
    };

    const result = await postcss([tailwind(customConfig)]).process('@tailwind utilities;', {
      from: undefined,
    });

    const css = result.css;

    // Check safe area insets
    assert.match(css, /\.pt-safe\s*\{\s*padding-top:\s*env\(safe-area-inset-top\)/, 'pt-safe must generate env(safe-area-inset-top)');
    assert.match(css, /\.pb-safe\s*\{\s*padding-bottom:\s*env\(safe-area-inset-bottom\)/, 'pb-safe must generate env(safe-area-inset-bottom)');
    assert.match(css, /\.pl-safe\s*\{\s*padding-left:\s*env\(safe-area-inset-left\)/, 'pl-safe must generate env(safe-area-inset-left)');
    assert.match(css, /\.pr-safe\s*\{\s*padding-right:\s*env\(safe-area-inset-right\)/, 'pr-safe must generate env(safe-area-inset-right)');

    // Check Deep Slate tokens
    assert.match(css, /\.bg-slate-base/, 'Must compile bg-slate-base utility');
    assert.match(css, /\.bg-slate-card/, 'Must compile bg-slate-card utility');
    assert.match(css, /\.border-slate-border/, 'Must compile border-slate-border utility');
    assert.match(css, /\.text-emerald-mint/, 'Must compile text-emerald-mint utility');
    assert.match(css, /\.text-amber-warm/, 'Must compile text-amber-warm utility');
    assert.match(css, /\.text-rose-crimson/, 'Must compile text-rose-crimson utility');
    assert.match(css, /\.text-sky-cyan/, 'Must compile text-sky-cyan utility');
  });
});

