/**
 * HisaabLive E2E Test Suite - Static Code & Artifact Auditor
 * Inspects actual files on disk to verify conformance to R1, R2, R3, R4
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../../../'); // points to owner-app

export class StaticAuditor {
  static getAppRoot() {
    return APP_ROOT;
  }

  static readIndexHtml() {
    const htmlPath = path.join(APP_ROOT, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      throw new Error(`index.html not found at: ${htmlPath}`);
    }
    return fs.readFileSync(htmlPath, 'utf8');
  }

  static readTailwindConfig() {
    const configPath = path.join(APP_ROOT, 'tailwind.config.js');
    if (!fs.existsSync(configPath)) {
      throw new Error(`tailwind.config.js not found at: ${configPath}`);
    }
    return fs.readFileSync(configPath, 'utf8');
  }

  static readVariablesCss() {
    const cssPath = path.join(APP_ROOT, 'src', 'theme', 'variables.css');
    if (!fs.existsSync(cssPath)) {
      return null;
    }
    return fs.readFileSync(cssPath, 'utf8');
  }

  static readIndexCss() {
    const cssPath = path.join(APP_ROOT, 'src', 'index.css');
    if (!fs.existsSync(cssPath)) {
      throw new Error(`index.css not found at: ${cssPath}`);
    }
    return fs.readFileSync(cssPath, 'utf8');
  }

  static readLanguageJson() {
    const langPath = path.join(APP_ROOT, 'src', 'language.json');
    if (!fs.existsSync(langPath)) {
      throw new Error(`language.json not found at: ${langPath}`);
    }
    const raw = fs.readFileSync(langPath, 'utf8');
    return JSON.parse(raw);
  }

  static readMainJsx() {
    const mainPath = path.join(APP_ROOT, 'src', 'main.jsx');
    if (!fs.existsSync(mainPath)) {
      throw new Error(`main.jsx not found at: ${mainPath}`);
    }
    return fs.readFileSync(mainPath, 'utf8');
  }

  static readAppJsx() {
    const appPath = path.join(APP_ROOT, 'src', 'App.jsx');
    if (!fs.existsSync(appPath)) {
      throw new Error(`App.jsx not found at: ${appPath}`);
    }
    return fs.readFileSync(appPath, 'utf8');
  }

  // --- Audit Checks ---
  static auditViewportMeta() {
    const html = this.readIndexHtml();
    const hasViewportFit = /viewport-fit\s*=\s*cover/i.test(html);
    const hasThemeColor = /<meta\s+name=["']theme-color["']\s+content=["'](#090d16|#0b0f19)["']/i.test(html);
    const hasDarkClassOnHtml = /<html[^>]*class=["'][^"']*dark/i.test(html);
    return {
      hasViewportFit,
      hasThemeColor,
      hasDarkClassOnHtml,
    };
  }

  static auditTailwindTokens() {
    const config = this.readTailwindConfig();
    const hasBaseSlate = /slate-base/i.test(config);
    const hasCardSlate = /slate-card/i.test(config);
    const hasBorderSlate = /slate-border/i.test(config);
    const hasEmerald = /emerald-mint|#10b981/i.test(config);
    const hasAmber = /amber-warm|#f59e0b/i.test(config);
    const hasRose = /rose-crimson|#f43f5e/i.test(config);
    const hasSkyCyan = /sky-cyan|#38bdf8/i.test(config);
    const hasSafeAreaPlugin = /tailwindcss-safe-area/i.test(config);
    return {
      hasBaseSlate,
      hasCardSlate,
      hasBorderSlate,
      hasEmerald,
      hasAmber,
      hasRose,
      hasSkyCyan,
      hasSafeAreaPlugin,
    };
  }

  static auditVariablesCss() {
    const css = this.readVariablesCss();
    if (!css) return { exists: false };
    const hasPrimaryCyan = /--ion-color-primary:\s*#38bdf8/i.test(css);
    const hasSuccessEmerald = /--ion-color-success:\s*#10b981/i.test(css);
    const hasWarningAmber = /--ion-color-warning:\s*#f59e0b/i.test(css);
    const hasDangerRose = /--ion-color-danger:\s*#f43f5e/i.test(css);
    const hasDarkBase = /--ion-background-color:\s*#090d16/i.test(css);
    const hasDarkCard = /--ion-card-background:\s*#1a243b/i.test(css);
    const hasSafeAreaVars = /--ion-safe-area-top/i.test(css);
    return {
      exists: true,
      hasPrimaryCyan,
      hasSuccessEmerald,
      hasWarningAmber,
      hasDangerRose,
      hasDarkBase,
      hasDarkCard,
      hasSafeAreaVars,
    };
  }

  static auditLanguageParity() {
    const lang = this.readLanguageJson();
    const hasEn = Boolean(lang.en);
    const hasUr = Boolean(lang.ur);
    const enKeys = hasEn ? Object.keys(lang.en) : [];
    const urKeys = hasUr ? Object.keys(lang.ur) : [];
    const missingInUr = enKeys.filter((k) => !urKeys.includes(k));
    const missingInEn = urKeys.filter((k) => !enKeys.includes(k));
    return {
      hasEn,
      hasUr,
      enCount: enKeys.length,
      urCount: urKeys.length,
      missingInUr,
      missingInEn,
      isSynchronized: hasEn && hasUr && missingInUr.length === 0,
    };
  }
}
