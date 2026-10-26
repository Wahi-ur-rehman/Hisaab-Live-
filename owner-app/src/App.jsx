import React, { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, orderBy, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import lang from "./language.json";
import { jsPDF } from "jspdf";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "hisaablive-final.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "hisaablive-final",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID",
});

const APPCHECK_SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY || "";
if (APPCHECK_SITE_KEY && !APPCHECK_SITE_KEY.startsWith("YOUR_")) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app);
const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";
const CATS = [
  { name: "Chai / Pani", icon: "☕", color: "#f97316" },
  { name: "Bijli / Bills", icon: "⚡", color: "#f59e0b" },
  { name: "Staff / Tankhwa", icon: "👥", color: "#3b82f6" },
  { name: "Dukaan Kiraya", icon: "🏢", color: "#8b5cf6" },
  { name: "Transport / Rickshaw", icon: "🛺", color: "#06b6d4" },
  { name: "Maintenance", icon: "🔧", color: "#ec4899" },
  { name: "Other", icon: "📦", color: "#64748b" },
];

const SUPPORT_WA = import.meta.env.VITE_SUPPORT_WA || "https://wa.me/923001234567";

const todayPK = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const LOGIN_ERRORS = ["functions/unauthenticated", "functions/resource-exhausted", "functions/invalid-argument"];

// ---- Eye-Friendly Dynamic Theme System ----
const THEMES = {
  dark: {
    mode: "dark",
    bg: "#0b0f19", // Deep soothing obsidian navy (zero glare)
    card: "#131d31", // Soft midnight slate
    cardSecondary: "#1a2742",
    border: "#223354",
    text: "#f8fafc",
    textMuted: "#94a3b8",
    textLight: "#64748b",
    inputBg: "#0c1322",
    primary: "#f43f5e", // Rose crimson
    primaryDark: "#be123c",
    primaryLight: "rgba(244,63,94,0.15)",
    primaryGradient: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
    heroGradient: "linear-gradient(135deg, #10192d 0%, #1a2744 60%, #24355a 100%)",
    success: "#10b981",
    warn: "#f59e0b",
    danger: "#ef4444",
    radiusXl: 22,
    radius: 16,
    radiusSm: 10,
    shadowSm: "0 2px 8px rgba(0,0,0,0.4)",
    shadowMd: "0 10px 25px -5px rgba(0,0,0,0.55)",
    shadowLg: "0 20px 35px -10px rgba(0,0,0,0.7)",
  },
  light: {
    mode: "light",
    bg: "#eef2f6", // Soft gentle warm slate (soothing, not harsh white)
    card: "#ffffff",
    cardSecondary: "#f8fafc",
    border: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#64748b",
    textLight: "#94a3b8",
    inputBg: "#ffffff",
    primary: "#e11d48",
    primaryDark: "#9f1239",
    primaryLight: "#fff1f2",
    primaryGradient: "linear-gradient(135deg, #e11d48 0%, #be123c 100%)",
    heroGradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%)",
    success: "#059669",
    warn: "#d97706",
    danger: "#dc2626",
    radiusXl: 22,
    radius: 16,
    radiusSm: 10,
    shadowSm: "0 2px 4px rgba(15,23,42,0.05)",
    shadowMd: "0 10px 25px -5px rgba(15,23,42,0.08)",
    shadowLg: "0 20px 30px -10px rgba(15,23,42,0.12)",
  },
};

// Initial Mock Data for Demo Mode
const DEMO_SHOP = {
  id: "demo_g10",
  shop_code: "G10",
  shop_name: "Al-Madina Super Store",
  owner_phone: "0300-1234567",
  status: "active",
  today_sale: 68500,
  today_sale_date: todayPK(),
  today_missing: 4000,
  start_date: "2026-10-01",
  current_expiry: "2026-11-26",
  license_active: true,
  live_banner: false,
};

const DEMO_EXPENSES_INITIAL = [
  { id: "e1", title: "Generator Fuel & Mobil Oil", amount: 2500, category: "Maintenance", time: "11:30 AM", date: todayPK() },
  { id: "e2", title: "Bakery Chai & Refreshments", amount: 450, category: "Chai / Pani", time: "02:15 PM", date: todayPK() },
  { id: "e3", title: "Counter Boy Daily Wage", amount: 1500, category: "Staff / Tankhwa", time: "07:45 PM", date: todayPK() },
  { id: "e4", title: "Rickshaw Delivery to Warehouse", amount: 600, category: "Transport / Rickshaw", time: "04:10 PM", date: todayPK() },
];

const DEMO_MONTH_EXPENSES = [
  { id: "me1", date: "2026-10-01", title: "Dukaan Monthly Rent (Advance)", amount: 35000, category: "Dukaan Kiraya" },
  { id: "me2", date: "2026-10-05", title: "Staff Salary - Senior Counter Cashier", amount: 28000, category: "Staff / Tankhwa" },
  { id: "me3", date: "2026-10-05", title: "Staff Salary - Helper / Packing Boy", amount: 18000, category: "Staff / Tankhwa" },
  { id: "me4", date: "2026-10-10", title: "IESCO Commercial Electricity Bill", amount: 14800, category: "Bijli / Bills" },
  { id: "me5", date: "2026-10-12", title: "PTCL VDSL Internet & Landline", amount: 3200, category: "Bijli / Bills" },
  { id: "me6", date: "2026-10-14", title: "Packaging Plastic Bags & Brown Envelopes", amount: 4500, category: "Other" },
  { id: "me7", date: "2026-10-18", title: "Generator Fuel & 2T Engine Oil", amount: 3400, category: "Maintenance" },
  { id: "me8", date: "2026-10-21", title: "Shop Front Display Light Repair", amount: 1600, category: "Maintenance" },
  { id: "me9", date: "2026-10-23", title: "Rickshaw Goods Delivery from Wholesale", amount: 1200, category: "Transport / Rickshaw" },
  { id: "me10", date: "2026-10-25", title: "Monthly Tea & Sugar Stock", amount: 2500, category: "Chai / Pani" },
  { id: "e1", date: todayPK(), title: "Generator Fuel & Mobil Oil", amount: 2500, category: "Maintenance" },
  { id: "e2", date: todayPK(), title: "Bakery Chai & Refreshments", amount: 450, category: "Chai / Pani" },
  { id: "e3", date: todayPK(), title: "Counter Boy Daily Wage", amount: 1500, category: "Staff / Tankhwa" },
  { id: "e4", date: todayPK(), title: "Rickshaw Delivery to Warehouse", amount: 600, category: "Transport / Rickshaw" },
];

const DEMO_CUSTOMERS_INITIAL = [
  { id: "c1", name: "Muhammad Tariq (G-10/4)", phone: "0345-1234567", balance: 2800 },
  { id: "c2", name: "Haji Rasheed Ahmed", phone: "0300-7654321", balance: 5200 },
  { id: "c3", name: "Farhan Ali (Tailor Master)", phone: "0321-9876543", balance: -750 },
  { id: "c4", name: "Shahid Khan (Driver)", phone: "0333-5551234", balance: 0 },
];

const DEMO_ENTRIES_INITIAL = {
  c1: [
    { id: "ent1", type: "udhaar", amount: 2800, note: "Rice & Cooking Oil (Sack)", date: todayPK() },
  ],
  c2: [
    { id: "ent2", type: "udhaar", amount: 7200, note: "Monthly Ration Grocery", date: "2026-10-24" },
    { id: "ent3", type: "payment", amount: 2000, note: "Cash partial payment", date: todayPK() },
  ],
  c3: [
    { id: "ent4", type: "payment", amount: 750, note: "Advance for sugar supply", date: todayPK() },
  ],
};

const DEMO_ALERTS_INITIAL = [
  {
    id: "a1",
    type: "deleted",
    severity: "high",
    day: todayPK(),
    amount: 4000,
    seen: false,
    message_en: "Cashier deleted Bill INV-0004 (Rs. 4,000) from POS today.",
  },
  {
    id: "a2",
    type: "lowered",
    severity: "medium",
    day: todayPK(),
    amount: 6300,
    seen: false,
    message_en: "Bill INV-0007 total was lowered from Rs. 7,000 to Rs. 700 in POS.",
  },
];

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [shopId, setShopId] = useState("");
  const [shop, setShop] = useState(null);
  const [today, setToday] = useState(todayPK());
  const [view, setView] = useState("hisaab");
  const [alerts, setAlerts] = useState([]);

  // Theme Mode (Default: dark for eye comfort)
  const [themeMode, setThemeMode] = useState(localStorage.getItem("hl_theme") || "dark");
  const T = THEMES[themeMode] || THEMES.dark;

  const toggleTheme = () => {
    const next = themeMode === "dark" ? "light" : "dark";
    setThemeMode(next);
    localStorage.setItem("hl_theme", next);
  };
  
  // Two-step Login States
  const [loginStep, setLoginStep] = useState(1);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Interactive Demo State
  const [isDemo, setIsDemo] = useState(false);
  const [demoExpenses, setDemoExpenses] = useState(DEMO_EXPENSES_INITIAL);
  const [demoCustomers, setDemoCustomers] = useState(DEMO_CUSTOMERS_INITIAL);
  const [demoEntries, setDemoEntries] = useState(DEMO_ENTRIES_INITIAL);
  const [demoAlerts, setDemoAlerts] = useState(DEMO_ALERTS_INITIAL);

  // Drilldown Expense Breakdown Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  // Monthly Hisaab & Kharcha Statement Modal State
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [monthlyData, setMonthlyData] = useState({ mSale: 0, mExp: 0 });

  const t = lang.en;

  const globalStyle = `
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: ${T.bg};
      color: ${T.text};
      -webkit-font-smoothing: antialiased;
      transition: background 0.2s ease, color 0.2s ease;
    }
    input, select, button { font-family: inherit; }
    input:focus, select:focus {
      border-color: ${T.primary} !important;
      box-shadow: 0 0 0 3px rgba(244,63,94,0.2) !important;
    }
    button:active { transform: scale(0.97); }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

    @media print {
      body { background: white !important; color: black !important; }
      .no-print { display: none !important; }
      #printable-statement {
        position: static !important;
        background: white !important;
        color: black !important;
        padding: 0 !important;
        max-width: 100% !important;
        max-height: none !important;
        overflow: visible !important;
        box-shadow: none !important;
        border: none !important;
      }
    }
  `;

  // Real Firebase Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!isDemo) {
        if (!u) {
          setShopId("");
        } else {
          const r = await u.getIdTokenResult();
          setShopId(r.claims.shopId || "");
        }
      }
      setAuthReady(true);
    });
  }, [isDemo]);

  // Firestore live shop profile
  useEffect(() => {
    if (isDemo || !shopId) {
      if (!isDemo) setShop(null);
      return;
    }
    return onSnapshot(doc(db, "shops", shopId), (d) => {
      if (d.exists()) setShop({ id: d.id, ...d.data() });
    }, (e) => console.error(e));
  }, [shopId, isDemo]);

  // Firestore live alerts
  const active = shop && shop.status === "active";
  useEffect(() => {
    if (isDemo) return;
    if (!shopId || !active) { setAlerts([]); return; }
    const q = query(collection(db, "shops", shopId, "alerts"), orderBy("created_at", "desc"), limit(60));
    return onSnapshot(q, (s) => setAlerts(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
  }, [shopId, active, isDemo]);

  // Midnight date rollover
  useEffect(() => {
    const i = setInterval(() => setToday(todayPK()), 60000);
    return () => clearInterval(i);
  }, []);

  const handleVerifyCode = (e) => {
    if (e) e.preventDefault();
    setErr("");
    const cleaned = code.trim();
    if (!cleaned || cleaned.length < 2) {
      setErr("Please enter a valid Shop Code (e.g. G10) or registered Phone number.");
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setLoginStep(2);
    }, 250);
  };

  const handlePinLogin = async (e) => {
    if (e) e.preventDefault();
    setErr("");
    if (pin.length !== 6) {
      setErr("PIN must be exactly 6 digits.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await httpsCallable(fns, "shopLogin")({ code: code.trim(), pin });
      await signInWithCustomToken(auth, data.token);
      setPin("");
    } catch (e) {
      console.warn("Function login not active, attempting direct Firestore verification...");
      try {
        const targetId = code.trim().toLowerCase();
        const snap = await getDoc(doc(db, "shops", targetId));
        if (snap.exists()) {
          const shopData = snap.data();
          if (String(shopData.pin_code) === String(pin)) {
            await signInAnonymously(auth);
            setShopId(snap.id);
            setShop({ id: snap.id, ...shopData });
            setPin("");
            setBusy(false);
            return;
          } else {
            setErr("Incorrect 6-digit PIN. Please try again.");
            setBusy(false);
            return;
          }
        }
      } catch (errDb) {
        console.warn("Direct db check:", errDb);
      }
      setErr("Shop not found or invalid PIN. Please verify credentials.");
    } finally {
      setBusy(false);
    }
  };

  const launchDemoMode = () => {
    setIsDemo(true);
    setShopId("demo_g10");
    setShop(DEMO_SHOP);
    setAlerts(DEMO_ALERTS_INITIAL);
    setAuthReady(true);
    setErr("");
  };

  const logout = () => {
    if (isDemo) {
      setIsDemo(false);
      setShopId("");
      setShop(null);
      setLoginStep(1);
      return;
    }
    setView("hisaab");
    setLoginStep(1);
    return signOut(auth);
  };

  const logoutAll = async () => {
    if (!window.confirm(t.logout_all_confirm)) return;
    if (!isDemo) {
      try { await call("logoutEverywhere", {}); } catch (e) { console.error(e); }
    }
    logout();
  };

  if (!authReady) {
    return (
      <>
        <style>{globalStyle}</style>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: T.bg }}>
          <div style={{ textAlign: "center", color: T.textMuted }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.primaryGradient, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32, boxShadow: T.shadowMd }}>
              ⚡
            </div>
            <p style={{ fontWeight: 700, fontSize: 16, color: T.text, margin: 0 }}>HisaabLive</p>
            <p style={{ fontSize: 13, color: T.textMuted, margin: "4px 0 0" }}>Loading...</p>
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Two-Step Login Screen + Theme Switcher
  // ---------------------------------------------------------------------------
  if (!shopId) {
    return (
      <>
        <style>{globalStyle}</style>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: T.bg, padding: 16, position: "relative" }}>
          
          {/* Top Right Theme Toggle */}
          <div style={{ position: "absolute", top: 20, right: 20 }}>
            <button
              onClick={toggleTheme}
              style={{
                background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 20,
                padding: "8px 14px", color: T.text, fontSize: 13, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                boxShadow: T.shadowSm,
              }}
            >
              <span>{themeMode === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}</span>
            </button>
          </div>

          <div style={{
            background: T.card, borderRadius: T.radiusXl, padding: "36px 30px",
            width: "100%", maxWidth: 390, boxShadow: T.shadowLg, border: `1px solid ${T.border}`,
          }}>
            {/* Header Brand */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{
                width: 70, height: 70, borderRadius: 22, background: T.primaryGradient,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px", fontSize: 34, boxShadow: "0 10px 24px rgba(244,63,94,0.35)",
                color: "white",
              }}>
                💰
              </div>
              <h2 style={{ margin: 0, color: T.text, fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>
                Hisaab<span style={{ color: T.primary }}>Live</span>
              </h2>
              <p style={{ margin: "4px 0 0", color: T.textMuted, fontSize: 14, fontWeight: 500 }}>
                Smart POS & Khata for Pakistani Shops
              </p>
            </div>

            {/* Stepper Bar */}
            <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.primary }} />
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: loginStep === 2 ? T.primary : T.border }} />
            </div>

            {err && (
              <div style={{ background: T.mode === "dark" ? "rgba(239,68,68,0.15)" : "#fff1f2", border: `1px solid ${T.primary}`, borderRadius: T.radiusSm, padding: "12px 14px", marginBottom: 16, color: T.primary, fontSize: 13, lineHeight: 1.4 }}>
                ⚠️ {err}
              </div>
            )}

            {/* STEP 1: Shop Code */}
            {loginStep === 1 && (
              <form onSubmit={handleVerifyCode}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                  Shop Code or Phone Number
                </label>
                <input
                  style={{
                    width: "100%", padding: "14px 16px", borderRadius: T.radiusSm,
                    border: `1.5px solid ${T.border}`, fontSize: 16, outline: "none",
                    marginBottom: 14, background: T.inputBg, color: T.text, fontWeight: 600,
                  }}
                  placeholder="e.g. G10 or 03001234567"
                  value={code}
                  autoFocus
                  onChange={(e) => setCode(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    width: "100%", padding: "15px", borderRadius: T.radiusSm,
                    background: T.primaryGradient, color: "white", border: "none",
                    fontSize: 16, fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(244,63,94,0.3)",
                  }}
                >
                  {busy ? "Checking Code..." : "Continue →"}
                </button>
              </form>
            )}

            {/* STEP 2: Enter 6-digit PIN */}
            {loginStep === 2 && (
              <form onSubmit={handlePinLogin}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: T.cardSecondary, padding: "10px 14px", borderRadius: T.radiusSm,
                  marginBottom: 16, border: `1px solid ${T.border}`,
                }}>
                  <div>
                    <span style={{ fontSize: 11, color: T.textMuted, display: "block", textTransform: "uppercase", fontWeight: 700 }}>Shop</span>
                    <b style={{ color: T.text, fontSize: 15 }}>{code.trim().toUpperCase()}</b>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setLoginStep(1); setPin(""); setErr(""); }}
                    style={{ background: "none", border: "none", color: T.primary, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Change
                  </button>
                </div>

                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                  Enter 6-Digit PIN
                </label>
                <input
                  style={{
                    width: "100%", padding: "14px 16px", borderRadius: T.radiusSm,
                    border: `1.5px solid ${T.border}`, fontSize: 24, outline: "none",
                    marginBottom: 14, background: T.inputBg, color: T.text, letterSpacing: 8,
                    textAlign: "center", fontWeight: 800,
                  }}
                  placeholder="••••••"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  autoFocus
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                />

                <button
                  type="submit"
                  disabled={busy || pin.length !== 6}
                  style={{
                    width: "100%", padding: "15px", borderRadius: T.radiusSm,
                    background: T.primaryGradient, color: "white", border: "none",
                    fontSize: 16, fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(244,63,94,0.3)",
                    opacity: (busy || pin.length !== 6) ? 0.6 : 1,
                  }}
                >
                  {busy ? "Verifying PIN..." : "Login to Dashboard"}
                </button>
              </form>
            )}

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", margin: "24px 0 16px", color: T.textLight, fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: T.border }} />
              <span style={{ padding: "0 12px", fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: T.border }} />
            </div>

            {/* 1-Click Interactive Demo */}
            <button
              type="button"
              onClick={launchDemoMode}
              style={{
                width: "100%", padding: "14px", borderRadius: T.radiusSm,
                background: "transparent", color: T.primary, border: `2px solid ${T.primary}`,
                fontSize: 15, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <span>✨</span>
              <span>Try Demo Mode (Quick Preview)</span>
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: T.textMuted, margin: "10px 0 0", lineHeight: 1.4 }}>
              Test all dashboard features with mock data.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Active Logged-in App View
  const liveAlerts = isDemo ? demoAlerts : alerts;
  const unseen = liveAlerts.filter((a) => !a.seen).length;

  return (
    <>
      <style>{globalStyle}</style>
      <div style={{ maxWidth: 460, margin: "0 auto", minHeight: "100vh", background: T.bg, position: "relative" }}>
        
        {/* Demo Mode Ribbon */}
        {isDemo && (
          <div style={{ background: T.mode === "dark" ? "#070a12" : "#0f172a", color: "#f8fafc", padding: "8px 16px", fontSize: 12, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 30 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
              <b>Demo Mode Active</b>
            </span>
            <button
              onClick={logout}
              style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", padding: "3px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 700 }}
            >
              Exit Demo
            </button>
          </div>
        )}

        {/* Top Header Card */}
        <div style={{
          background: T.card, borderBottom: `1px solid ${T.border}`, padding: "14px 18px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: isDemo ? 34 : 0, zIndex: 25, boxShadow: T.shadowSm,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: T.text }}>{shop.shop_name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span style={{ background: T.cardSecondary, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: T.textMuted }}>
                {shop.shop_code}
              </span>
              <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                POS Live
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              title="Toggle Dark / Light Theme"
              style={{
                background: T.cardSecondary, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                padding: "7px 10px", fontSize: 14, cursor: "pointer", color: T.text,
              }}
            >
              {themeMode === "dark" ? "☀️" : "🌙"}
            </button>

            <button
              onClick={logout}
              style={{
                background: T.primaryLight, border: `1px solid ${T.primary}`, borderRadius: T.radiusSm,
                padding: "8px 12px", fontSize: 12, cursor: "pointer", color: T.primary, fontWeight: 700,
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ padding: "16px", paddingBottom: 100 }}>
          {view === "hisaab" && (
            <Hisaab
              shop={shop}
              shopId={shopId}
              today={today}
              t={t}
              T={T}
              isDemo={isDemo}
              demoExpenses={demoExpenses}
              setDemoExpenses={setDemoExpenses}
              onAlerts={() => setView("alerts")}
              onOpenExpenseDetails={() => setShowExpenseModal(true)}
              onOpenMonthlyStatement={(sale, exp) => {
                setMonthlyData({ mSale: sale, mExp: exp });
                setShowMonthlyModal(true);
              }}
            />
          )}

          {view === "khata" && (
            <Khata
              shopId={shopId}
              t={t}
              T={T}
              isDemo={isDemo}
              demoCustomers={demoCustomers}
              setDemoCustomers={setDemoCustomers}
              demoEntries={demoEntries}
              setDemoEntries={setDemoEntries}
            />
          )}

          {view === "alerts" && (
            <Alerts
              alerts={liveAlerts}
              t={t}
              T={T}
              isDemo={isDemo}
              setDemoAlerts={setDemoAlerts}
            />
          )}

          <Notify shop={shop} t={t} T={T} isDemo={isDemo} />
        </div>

        {/* Bottom Tab Navigation Bar */}
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 460, background: T.card, borderTop: `1px solid ${T.border}`,
          display: "flex", zIndex: 30, boxShadow: T.shadowMd,
        }}>
          {[
            { id: "hisaab", label: t.tab_hisaab, icon: "📊" },
            { id: "khata", label: t.tab_khata, icon: "📒" },
            { id: "alerts", label: t.tab_alerts, icon: "🔔", badge: unseen },
          ].map(({ id, label, icon, badge }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                flex: 1, padding: "11px 8px 14px", border: "none", background: "none", cursor: "pointer",
                borderTop: view === id ? `3px solid ${T.primary}` : "3px solid transparent",
                color: view === id ? T.primary : T.textMuted, fontSize: 12, fontWeight: view === id ? 800 : 500,
                position: "relative",
              }}
            >
              <div style={{ fontSize: 21, marginBottom: 2 }}>{icon}</div>
              <div>{label}</div>
              {badge > 0 && (
                <span style={{
                  position: "absolute", top: 8, right: "calc(50% - 18px)",
                  background: T.primary, color: "white", borderRadius: 10,
                  padding: "1px 6px", fontSize: 10, fontWeight: 800,
                  boxShadow: "0 2px 6px rgba(244,63,94,0.4)",
                }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Detailed Expense Modal Sheet */}
        {showExpenseModal && (
          <ExpenseDetailModal
            today={today}
            expenses={isDemo ? demoExpenses : []}
            shopId={shopId}
            T={T}
            isDemo={isDemo}
            onDeleteExpense={(expenseId) => {
              setDemoExpenses((prev) => prev.filter((x) => x.id !== expenseId));
            }}
            onClose={() => setShowExpenseModal(false)}
          />
        )}

        {/* Monthly Financial & Profit Statement Modal */}
        {showMonthlyModal && (
          <MonthlyStatementModal
            shop={shop}
            shopId={shopId}
            ym={today.slice(0, 7)}
            mSale={monthlyData.mSale}
            mExp={monthlyData.mExp}
            T={T}
            isDemo={isDemo}
            demoExpenses={demoExpenses}
            onClose={() => setShowMonthlyModal(false)}
          />
        )}

      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 1. Hisaab View
// ---------------------------------------------------------------------------
function Hisaab({
  shop,
  shopId,
  today,
  t,
  T,
  isDemo,
  demoExpenses,
  setDemoExpenses,
  onAlerts,
  onOpenExpenseDetails,
  onOpenMonthlyStatement,
}) {
  const [exps, setExps] = useState([]);
  const [month, setMonth] = useState(null);
  const ym = today.slice(0, 7);

  useEffect(() => {
    if (isDemo) return;
    const q = query(collection(db, "shops", shopId, "expenses"), where("date", "==", today));
    return onSnapshot(q, (s) => setExps(s.docs.map((x) => x.data())), (e) => console.error(e));
  }, [shopId, today, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    setMonth(null);
    return onSnapshot(doc(db, "shops", shopId, "monthly_summary", ym), (d) => setMonth(d.exists() ? d.data() : {}), (e) => console.error(e));
  }, [shopId, ym, isDemo]);

  const activeExpenses = isDemo ? demoExpenses : exps;
  const totalExp = activeExpenses.reduce((a, b) => a + Number(b.amount || 0), 0);
  
  const sale = shop.today_sale_date === today ? shop.today_sale || 0 : 0;
  const missing = shop.today_sale_date === today ? shop.today_missing || 0 : 0;
  const netProfit = sale - totalExp;

  const mSale = isDemo ? 540000 : ((month && month.sale) || 0);
  const mExp = isDemo ? (110000 + totalExp) : ((month && month.expense) || 0);

  return (
    <div>
      {/* Missing Sales Warning Banner */}
      {missing > 0 && (
        <div
          onClick={onAlerts}
          style={{
            background: T.mode === "dark" ? "rgba(239,68,68,0.2)" : "#fff1f2",
            border: `1.5px solid ${T.primary}`, color: T.primary,
            padding: "12px 16px", borderRadius: T.radius, marginBottom: 14,
            cursor: "pointer", fontWeight: 700, fontSize: 13,
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: T.shadowSm,
          }}
        >
          <span style={{ fontSize: 20 }}>🚨</span>
          <span style={{ flex: 1 }}>{t.missing_today.replace("{x}", Math.round(missing).toLocaleString("en-US"))}</span>
          <span style={{ fontSize: 13, color: T.primary, fontWeight: 800 }}>Review &rarr;</span>
        </div>
      )}

      {/* Hero Munafa (Net Profit) Card */}
      <div style={{
        background: netProfit >= 0 ? T.heroGradient : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)",
        borderRadius: T.radiusXl, padding: "24px 22px", color: "white",
        marginBottom: 16, boxShadow: T.shadowLg, position: "relative", overflow: "hidden",
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.75)" }}>
            Today's Net Munafa (Profit)
          </span>
          <span style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
            Live
          </span>
        </div>

        <div style={{ fontSize: 36, fontWeight: 900, margin: "10px 0 6px", letterSpacing: -0.5 }}>
          Rs. {netProfit.toLocaleString()}
        </div>

        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", display: "flex", gap: 14 }}>
          <span>Sales: <b>Rs. {sale.toLocaleString()}</b></span>
          <span>&bull;</span>
          <span>Kharcha: <b>Rs. {totalExp.toLocaleString()}</b></span>
        </div>
      </div>

      {/* Interactive Sales & Expenses Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {/* Today's Sale Card */}
        <div style={{
          background: T.card, borderRadius: T.radius, padding: "16px 14px",
          border: `1px solid ${T.border}`, boxShadow: T.shadowSm,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.success, fontSize: 12, fontWeight: 700 }}>
            <span>📈</span>
            <span>TODAY'S SALE</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.text, marginTop: 6 }}>
            Rs. {sale.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Auto-synced from POS</div>
        </div>

        {/* CLICKABLE Today's Expense Card */}
        <div
          onClick={onOpenExpenseDetails}
          style={{
            background: T.card, borderRadius: T.radius, padding: "16px 14px",
            border: `1.5px solid ${T.primary}`, boxShadow: T.shadowSm,
            cursor: "pointer", position: "relative",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.primary, fontSize: 12, fontWeight: 700 }}>
              <span>💸</span>
              <span>TODAY'S KHARCHA</span>
            </div>
            <span style={{ fontSize: 11, color: T.primary, fontWeight: 800 }}>View &rarr;</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.primary, marginTop: 6 }}>
            Rs. {totalExp.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: T.primary, fontWeight: 600, marginTop: 2 }}>
            Tap for breakdown 🔍
          </div>
        </div>
      </div>

      {/* Monthly Summary Card (Clickable for Statement & PDF) */}
      <div
        onClick={() => onOpenMonthlyStatement && onOpenMonthlyStatement(mSale, mExp)}
        style={{
          background: T.card, borderRadius: T.radius, padding: "18px",
          border: `1.5px solid ${T.border}`, boxShadow: T.shadowSm, marginBottom: 16,
          cursor: "pointer", transition: "transform 0.15s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text }}>{t.month_title}</h4>
            <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Month: {ym}</span>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 800, color: T.primary,
            background: T.primaryLight, padding: "4px 10px", borderRadius: 12,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span>📄 Statement & PDF</span>
            <span>&rarr;</span>
          </span>
        </div>
        <Row label={t.month_sale} value={mSale} T={T} />
        <Row label={t.month_expense} value={mExp} T={T} />
        <div style={{ height: 1, background: T.border, margin: "8px 0" }} />
        <Row label={t.month_profit} value={mSale - mExp} bold isProfit T={T} />
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>
            Tap to view breakdown, category stats & download PDF 🔍
          </span>
        </div>
      </div>

      {/* Add Kharcha Form */}
      <ExpenseForm
        shopId={shopId}
        T={T}
        isDemo={isDemo}
        onAddDemoExpense={(newExp) => setDemoExpenses((prev) => [newExp, ...prev])}
      />
    </div>
  );
}

function Row({ label, value, bold, isProfit, T }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 800 : 500, margin: "6px 0", fontSize: 14 }}>
      <span style={{ color: bold ? T.text : T.textMuted }}>{label}</span>
      <span style={{ color: isProfit ? T.success : bold ? T.text : T.text }}>
        Rs. {Math.round(value).toLocaleString("en-US")}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detailed Expense Drilldown Modal
// ---------------------------------------------------------------------------
function ExpenseDetailModal({ today, expenses, shopId, T, isDemo, onDeleteExpense, onClose }) {
  const [liveExpenses, setLiveExpenses] = useState(expenses);
  const [selectedCat, setSelectedCat] = useState("All");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (isDemo) {
      setLiveExpenses(expenses);
      return;
    }
    const q = query(collection(db, "shops", shopId, "expenses"), where("date", "==", today));
    return onSnapshot(q, (s) => setLiveExpenses(s.docs.map((x) => ({ id: x.id, ...x.data() }))), (e) => console.error(e));
  }, [shopId, today, isDemo, expenses]);

  const handleDelete = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`Delete expense "${item.title}" (Rs. ${Number(item.amount).toLocaleString()})?`)) return;
    setDeletingId(item.id);
    try {
      if (isDemo) {
        onDeleteExpense(item.id);
      } else {
        await call("deleteExpense", { expenseId: item.id });
      }
    } catch (err) {
      alert("Failed to delete expense: " + (err.message || err));
    } finally {
      setDeletingId("");
    }
  };

  const total = liveExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const catBreakdown = {};
  CATS.forEach((c) => { catBreakdown[c.name] = { ...c, total: 0, items: [] }; });

  liveExpenses.forEach((item) => {
    const cName = item.category || "Other";
    if (!catBreakdown[cName]) catBreakdown[cName] = { name: cName, icon: "📦", color: "#64748b", total: 0, items: [] };
    catBreakdown[cName].total += Number(item.amount || 0);
    catBreakdown[cName].items.push(item);
  });

  const filteredItems = selectedCat === "All"
    ? liveExpenses
    : liveExpenses.filter((e) => e.category === selectedCat);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 99,
      display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(5px)",
    }}>
      <div style={{
        background: T.card, width: "100%", maxWidth: 460, maxHeight: "88vh",
        borderTopLeftRadius: T.radiusXl, borderTopRightRadius: T.radiusXl,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: T.shadowLg, animation: "slideUp 0.25s ease-out", border: `1px solid ${T.border}`,
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border, margin: "0 auto 12px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text }}>Today's Expenses Breakdown</h3>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: T.textMuted }}>
                Total spent: <b style={{ color: T.primary }}>Rs. {total.toLocaleString()}</b>
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: T.cardSecondary, border: `1px solid ${T.border}`, borderRadius: "50%",
                width: 32, height: 32, cursor: "pointer", fontSize: 16,
                fontWeight: 700, color: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          
          {/* Category Progress Bars */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: T.textMuted, letterSpacing: 0.5, marginBottom: 10 }}>
              Category Breakdown
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.values(catBreakdown)
                .filter((c) => c.total > 0)
                .map((cat) => {
                  const pct = total > 0 ? Math.round((cat.total / total) * 100) : 0;
                  return (
                    <div
                      key={cat.name}
                      onClick={() => setSelectedCat(selectedCat === cat.name ? "All" : cat.name)}
                      style={{
                        padding: "10px 12px", borderRadius: T.radiusSm,
                        background: selectedCat === cat.name ? T.primaryLight : T.cardSecondary,
                        border: `1.5px solid ${selectedCat === cat.name ? T.primary : T.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: T.text }}>
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                          Rs. {cat.total.toLocaleString()} <small style={{ color: T.textMuted }}>({pct}%)</small>
                        </span>
                      </div>
                      
                      <div style={{ width: "100%", height: 6, borderRadius: 3, background: T.border, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: cat.color }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Itemized List */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: T.textMuted, letterSpacing: 0.5 }}>
                Itemized Expenses {selectedCat !== "All" && `(${selectedCat})`}
              </div>
              {selectedCat !== "All" && (
                <button
                  onClick={() => setSelectedCat("All")}
                  style={{ background: "none", border: "none", color: T.primary, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
                >
                  Show All
                </button>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textMuted, padding: 20 }}>No items recorded.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredItems.map((item) => {
                  const catInfo = CATS.find((c) => c.name === item.category) || { icon: "📦", color: "#64748b" };
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "12px 14px", borderRadius: T.radiusSm,
                        background: T.cardSecondary, border: `1px solid ${T.border}`,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%", background: T.card,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                          border: `1px solid ${T.border}`,
                        }}>
                          {catInfo.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{item.title}</div>
                          <div style={{ fontSize: 11, color: T.textMuted }}>
                            {item.category} {item.time ? `• ${item.time}` : ""}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: T.primary }}>
                          Rs. {Number(item.amount).toLocaleString()}
                        </div>
                        <button
                          disabled={deletingId === item.id}
                          onClick={(e) => handleDelete(e, item)}
                          title="Delete Expense"
                          style={{
                            background: "rgba(239,68,68,0.12)",
                            border: "1px solid rgba(239,68,68,0.25)",
                            color: T.danger,
                            borderRadius: 8,
                            width: 30,
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: 13,
                            padding: 0,
                            opacity: deletingId === item.id ? 0.4 : 1,
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, background: T.cardSecondary }}>
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "13px", borderRadius: T.radiusSm,
              background: T.primaryGradient, color: "white", border: "none",
              fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly Statement PDF Generator (jsPDF)
// ---------------------------------------------------------------------------
function generateMonthlyPdf({
  shopName,
  shopCode,
  month,
  sale,
  expense,
  profit,
  margin,
  catBreakdown,
  items,
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  let y = 14;

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 28, "F");

  // Title & Brand
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("HisaabLive", marginX, 12);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(244, 63, 94); // Rose
  doc.text("SMART POS & SURVEILLANCE REPORT", marginX, 18);

  // Shop Details (Right aligned)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(shopName || "Al-Madina General Store", pageWidth - marginX, 12, { align: "right" });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text(`Shop Code: ${(shopCode || "G10").toUpperCase()} • Statement Month: ${month}`, pageWidth - marginX, 18, { align: "right" });

  y = 35;

  // Report Headline
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Monthly Financial & Kharcha Statement — ${month}`, marginX, y);

  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  const nowStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" });
  doc.text(`Generated on: ${nowStr} (Pakistan Standard Time) • Permanent Surveillance Ledger`, marginX, y);

  y += 8;

  // 4 Financial Summary KPI Cards
  const gap = 3;
  const cardW = (pageWidth - marginX * 2 - gap * 3) / 4;
  const cards = [
    { label: "TOTAL SALE", val: `Rs. ${Math.round(sale).toLocaleString()}`, color: [30, 41, 59] },
    { label: "TOTAL KHARCHA", val: `Rs. ${Math.round(expense).toLocaleString()}`, color: [225, 29, 72] },
    { label: "NET PROFIT (MUNAFA)", val: `Rs. ${Math.round(profit).toLocaleString()}`, color: [16, 185, 129] },
    { label: "PROFIT MARGIN", val: `${margin}%`, color: [59, 130, 246] },
  ];

  cards.forEach((c, idx) => {
    const x = marginX + idx * (cardW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardW, 16, 2, 2, "FD");

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, x + 3.5, y + 5);

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(c.color[0], c.color[1], c.color[2]);
    doc.text(c.val, x + 3.5, y + 12);
  });

  y += 22;

  // Category Breakdown Section
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Expense Breakdown by Category", marginX, y);
  y += 4;

  // Table Header for Categories
  doc.setFillColor(241, 245, 249);
  doc.rect(marginX, y, pageWidth - marginX * 2, 6.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Category", marginX + 4, y + 4.2);
  doc.text("Amount (PKR)", marginX + 90, y + 4.2);
  doc.text("% of Total Expenses", pageWidth - marginX - 4, y + 4.2, { align: "right" });
  y += 6.5;

  // Category Rows
  catBreakdown.forEach((cat) => {
    if (cat.total <= 0) return;
    const pct = expense > 0 ? ((cat.total / expense) * 100).toFixed(1) : "0.0";
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(cat.name, marginX + 4, y + 4.2);
    doc.text(`Rs. ${Math.round(cat.total).toLocaleString()}`, marginX + 90, y + 4.2);
    doc.text(`${pct}%`, pageWidth - marginX - 4, y + 4.2, { align: "right" });

    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, y + 5.5, pageWidth - marginX, y + 5.5);
    y += 5.8;
  });

  y += 6;

  // Itemized Expense Section
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`Itemized Expense Records (${items.length} Transactions)`, marginX, y);
  y += 4;

  // Table Header for Items
  doc.setFillColor(241, 245, 249);
  doc.rect(marginX, y, pageWidth - marginX * 2, 6.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Date", marginX + 4, y + 4.2);
  doc.text("Description / Title", marginX + 28, y + 4.2);
  doc.text("Category", marginX + 115, y + 4.2);
  doc.text("Amount (PKR)", pageWidth - marginX - 4, y + 4.2, { align: "right" });
  y += 6.5;

  // Items Rows
  items.forEach((item) => {
    if (y > 270) {
      doc.addPage();
      y = 14;
      // Repeat header on new page
      doc.setFillColor(241, 245, 249);
      doc.rect(marginX, y, pageWidth - marginX * 2, 6.5, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      doc.text("Date", marginX + 4, y + 4.2);
      doc.text("Description / Title", marginX + 28, y + 4.2);
      doc.text("Category", marginX + 115, y + 4.2);
      doc.text("Amount (PKR)", pageWidth - marginX - 4, y + 4.2, { align: "right" });
      y += 6.5;
    }

    doc.setFontSize(7.8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text(String(item.date || ""), marginX + 4, y + 4.2);
    doc.text(String(item.title || "").slice(0, 48), marginX + 28, y + 4.2);
    doc.text(String(item.category || "Other"), marginX + 115, y + 4.2);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(225, 29, 72);
    doc.text(`Rs. ${Number(item.amount || 0).toLocaleString()}`, pageWidth - marginX - 4, y + 4.2, { align: "right" });

    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, y + 5.5, pageWidth - marginX, y + 5.5);
    y += 5.8;
  });

  // Footer on last page
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text("HisaabLive Verified Statement • Powered by AI Surveillance & Tamper Guard", marginX, pageHeight - 8);
  doc.text(`Page 1 of ${doc.internal.getNumberOfPages()}`, pageWidth - marginX, pageHeight - 8, { align: "right" });

  const safeCode = (shopCode || "G10").toUpperCase().replace(/[^A-Z0-9]/g, "");
  doc.save(`HisaabLive-Statement-${safeCode}-${month}.pdf`);
}

// ---------------------------------------------------------------------------
// Monthly Statement Modal Component
// ---------------------------------------------------------------------------
function MonthlyStatementModal({
  shop,
  shopId,
  ym,
  mSale,
  mExp,
  T,
  isDemo,
  demoExpenses,
  onClose,
}) {
  const [items, setItems] = useState([]);
  const [selectedCat, setSelectedCat] = useState("All");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (isDemo) {
      const merged = [...DEMO_MONTH_EXPENSES];
      demoExpenses.forEach((de) => {
        if (!merged.some((m) => m.id === de.id)) {
          merged.unshift(de);
        }
      });
      setItems(merged);
      return;
    }

    const q = query(
      collection(db, "shops", shopId, "expenses"),
      where("date", ">=", `${ym}-01`),
      where("date", "<=", `${ym}-31`),
      orderBy("date", "desc")
    );
    return onSnapshot(
      q,
      (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error("Monthly expenses fetch error:", e)
    );
  }, [shopId, ym, isDemo, demoExpenses]);

  const totalExpense = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalSale = mSale || 0;
  const netProfit = totalSale - totalExpense;
  const margin = totalSale > 0 ? ((netProfit / totalSale) * 100).toFixed(1) : "0.0";

  // Category breakdown
  const catBreakdown = CATS.map((cat) => {
    const catItems = items.filter((it) => it.category === cat.name);
    const total = catItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    return { ...cat, total, count: catItems.length };
  });

  const filteredItems = selectedCat === "All"
    ? items
    : items.filter((e) => e.category === selectedCat);

  const handleDownloadPdf = () => {
    setDownloading(true);
    try {
      generateMonthlyPdf({
        shopName: shop ? shop.shop_name : "Al-Madina General Store",
        shopCode: shop ? shop.shop_code : "G10",
        month: ym,
        sale: totalSale,
        expense: totalExpense,
        profit: netProfit,
        margin,
        catBreakdown,
        items,
      });
    } catch (err) {
      console.error(err);
      alert("Error generating PDF: " + (err.message || err));
    } finally {
      setTimeout(() => setDownloading(false), 500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)",
    }}>
      <div id="printable-statement" style={{
        background: T.card, width: "100%", maxWidth: 480, maxHeight: "92vh",
        borderTopLeftRadius: T.radiusXl, borderTopRightRadius: T.radiusXl,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: T.shadowLg, animation: "slideUp 0.25s ease-out", border: `1px solid ${T.border}`,
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}` }} className="no-print">
          <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border, margin: "0 auto 12px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text }}>Monthly Statement</h3>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: T.textMuted }}>
                Month: <b style={{ color: T.primary }}>{ym}</b> • {shop ? shop.shop_name : "Al-Madina Store"}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: T.cardSecondary, border: `1px solid ${T.border}`, borderRadius: "50%",
                width: 32, height: 32, cursor: "pointer", fontSize: 16,
                fontWeight: 700, color: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: "18px 20px", overflowY: "auto", flex: 1 }}>
          
          {/* Action Download & Print Bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }} className="no-print">
            <button
              disabled={downloading}
              onClick={handleDownloadPdf}
              style={{
                flex: 1.3, padding: "12px 14px", borderRadius: T.radiusSm,
                background: T.primaryGradient, color: "white", border: "none",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                boxShadow: "0 4px 12px rgba(244,63,94,0.3)",
              }}
            >
              <span>{downloading ? "⏳ Generating..." : "📥 Download PDF Statement"}</span>
            </button>

            <button
              onClick={handlePrint}
              style={{
                flex: 0.9, padding: "12px 14px", borderRadius: T.radiusSm,
                background: T.cardSecondary, color: T.text, border: `1px solid ${T.border}`,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <span>🖨️ Print</span>
            </button>
          </div>

          {/* 4 Financial KPI Summary Cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20,
          }}>
            <div style={{
              background: T.cardSecondary, padding: "12px 14px", borderRadius: T.radiusSm,
              border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.textMuted, textTransform: "uppercase" }}>
                Total Sale
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: T.text, marginTop: 4 }}>
                Rs. {Math.round(totalSale).toLocaleString()}
              </div>
            </div>

            <div style={{
              background: T.cardSecondary, padding: "12px 14px", borderRadius: T.radiusSm,
              border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.primary, textTransform: "uppercase" }}>
                Total Kharcha
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: T.primary, marginTop: 4 }}>
                Rs. {Math.round(totalExpense).toLocaleString()}
              </div>
            </div>

            <div style={{
              background: T.cardSecondary, padding: "12px 14px", borderRadius: T.radiusSm,
              border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.success, textTransform: "uppercase" }}>
                Net Profit (Munafa)
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: netProfit >= 0 ? T.success : T.danger, marginTop: 4 }}>
                Rs. {Math.round(netProfit).toLocaleString()}
              </div>
            </div>

            <div style={{
              background: T.cardSecondary, padding: "12px 14px", borderRadius: T.radiusSm,
              border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#3b82f6", textTransform: "uppercase" }}>
                Profit Margin
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#3b82f6", marginTop: 4 }}>
                {margin}%
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: T.textMuted, letterSpacing: 0.5, marginBottom: 10 }}>
              Monthly Expense Categories
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {catBreakdown
                .filter((c) => c.total > 0)
                .map((cat) => {
                  const pct = totalExpense > 0 ? Math.round((cat.total / totalExpense) * 100) : 0;
                  const isSelected = selectedCat === cat.name;
                  return (
                    <div
                      key={cat.name}
                      onClick={() => setSelectedCat(isSelected ? "All" : cat.name)}
                      style={{
                        padding: "10px 12px", borderRadius: T.radiusSm,
                        background: isSelected ? T.primaryLight : T.cardSecondary,
                        border: `1.5px solid ${isSelected ? T.primary : T.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: T.text }}>
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                          <span style={{ fontSize: 11, color: T.textMuted }}>({cat.count} txns)</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                          Rs. {cat.total.toLocaleString()} <small style={{ color: T.textMuted }}>({pct}%)</small>
                        </span>
                      </div>
                      
                      <div style={{ width: "100%", height: 6, borderRadius: 3, background: T.border, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: cat.color }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Itemized Expenses List */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: T.textMuted, letterSpacing: 0.5 }}>
                Monthly Expenses ({filteredItems.length}) {selectedCat !== "All" && `• ${selectedCat}`}
              </div>
              {selectedCat !== "All" && (
                <button
                  onClick={() => setSelectedCat("All")}
                  style={{ background: "none", border: "none", color: T.primary, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
                >
                  Show All
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredItems.map((item) => {
                const catInfo = CATS.find((c) => c.name === item.category) || { icon: "📦", color: "#64748b" };
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: "11px 13px", borderRadius: T.radiusSm,
                      background: T.cardSecondary, border: `1px solid ${T.border}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", background: T.card,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                        border: `1px solid ${T.border}`,
                      }}>
                        {catInfo.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: T.text }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: T.textMuted }}>
                          {item.date} • {item.category}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 14.5, fontWeight: 900, color: T.primary }}>
                      Rs. {Number(item.amount).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, background: T.cardSecondary }} className="no-print">
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "13px", borderRadius: T.radiusSm,
              background: T.primaryGradient, color: "white", border: "none",
              fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}
          >
            Close Statement
          </button>
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expense Add Form Component
// ---------------------------------------------------------------------------
function ExpenseForm({ shopId, T, isDemo, onAddDemoExpense }) {
  const [title, setTitle] = useState("");
  const [amt, setAmt] = useState("");
  const [cat, setCat] = useState(CATS[0].name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  const save = async (e) => {
    if (e) e.preventDefault();
    setErr("");
    setSuccess(false);
    const amount = Number(amt);
    if (!title.trim() || !(amount > 0)) {
      setErr("Please enter a title and valid amount.");
      return;
    }
    setBusy(true);

    if (isDemo) {
      setTimeout(() => {
        onAddDemoExpense({
          id: "exp_" + Date.now(),
          title: title.trim(),
          amount: amount,
          category: cat,
          time: new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(new Date()),
          date: todayPK(),
        });
        setTitle("");
        setAmt("");
        setBusy(false);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2500);
      }, 200);
      return;
    }

    try {
      await call("addExpense", { title: title.trim().slice(0, 100), amount, category: cat });
      setTitle("");
      setAmt("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      // Direct Firestore write fallback (Spark plan)
      try {
        await addDoc(collection(db, "shops", shopId, "expenses"), {
          title: title.trim().slice(0, 100),
          amount,
          category: cat,
          date: todayPK(),
          created_at: new Date().toISOString(),
        });
        setTitle("");
        setAmt("");
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2500);
      } catch (errDb) {
        setErr(errDb.message || "Failed to save expense. Please retry.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: T.card, borderRadius: T.radius, padding: "18px",
      border: `1px solid ${T.border}`, boxShadow: T.shadowSm,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text }}>+ Add Kharcha (Expense)</h4>
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Quick Entry</span>
      </div>

      {err && <div style={{ color: T.primary, fontSize: 13, marginBottom: 8 }}>⚠️ {err}</div>}
      {success && <div style={{ color: T.success, fontSize: 13, marginBottom: 8, fontWeight: 700 }}>✓ Kharcha saved successfully!</div>}

      <form onSubmit={save}>
        <input
          placeholder="Title (e.g. Bijli Bill, Petrol, Staff Lunch)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: T.radiusSm,
            border: `1.5px solid ${T.border}`, fontSize: 14, outline: "none",
            marginBottom: 10, background: T.inputBg, color: T.text,
          }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 10, marginBottom: 12 }}>
          <input
            placeholder="Amount (Rs.)"
            type="number"
            min="1"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: T.radiusSm,
              border: `1.5px solid ${T.border}`, fontSize: 14, outline: "none",
              background: T.inputBg, color: T.text, fontWeight: 700,
            }}
          />

          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            style={{
              width: "100%", padding: "12px 10px", borderRadius: T.radiusSm,
              border: `1.5px solid ${T.border}`, fontSize: 13, outline: "none",
              background: T.inputBg, color: T.text, cursor: "pointer", fontWeight: 600,
            }}
          >
            {CATS.map((c) => (
              <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        <button
          disabled={busy}
          type="submit"
          style={{
            width: "100%", padding: "13px", borderRadius: T.radiusSm,
            background: T.primaryGradient, color: "white", border: "none",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            boxShadow: T.shadowSm, opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Saving..." : "Save Kharcha"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Khata View
// ---------------------------------------------------------------------------
function Khata({ shopId, t, T, isDemo, demoCustomers, setDemoCustomers, demoEntries, setDemoEntries }) {
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    return onSnapshot(collection(db, "shops", shopId, "khata_customers"), (s) => {
      setCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (e) => console.error(e));
  }, [shopId, isDemo]);

  const activeCustomers = isDemo ? demoCustomers : customers;
  const selected = activeCustomers.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <CustomerLedger
        shopId={shopId}
        customer={selected}
        onBack={() => setSelectedId("")}
        t={t}
        T={T}
        isDemo={isDemo}
        demoEntries={demoEntries[selected.id] || []}
        onAddDemoEntry={(newEntry, newBalance) => {
          setDemoEntries((prev) => ({
            ...prev,
            [selected.id]: [newEntry, ...(prev[selected.id] || [])],
          }));
          setDemoCustomers((prev) =>
            prev.map((c) => (c.id === selected.id ? { ...c, balance: newBalance } : c))
          );
        }}
        onDeleteCustomer={(customerId) => {
          if (isDemo) {
            setDemoCustomers((prev) => prev.filter((c) => c.id !== customerId));
            setDemoEntries((prev) => {
              const copy = { ...prev };
              delete copy[customerId];
              return copy;
            });
            setSelectedId("");
          }
        }}
        onDeleteDemoEntry={(entryId, newBalance) => {
          setDemoEntries((prev) => ({
            ...prev,
            [selected.id]: (prev[selected.id] || []).filter((e) => e.id !== entryId),
          }));
          setDemoCustomers((prev) =>
            prev.map((c) => (c.id === selected.id ? { ...c, balance: newBalance } : c))
          );
        }}
      />
    );
  }

  const receivable = activeCustomers.reduce((a, c) => a + (c.balance > 0 ? c.balance : 0), 0);
  const q = search.trim().toLowerCase();
  const list = activeCustomers
    .filter((c) => !q || (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q))
    .sort((a, b) => (b.balance || 0) - (a.balance || 0));

  return (
    <div>
      {/* Khata Hero Card */}
      <div style={{
        background: T.heroGradient, borderRadius: T.radiusXl, padding: "24px 22px",
        color: "white", marginBottom: 16, boxShadow: T.shadowLg, border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.75)" }}>
          Total Khata to Receive (Baqaya)
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, margin: "8px 0 4px" }}>
          Rs. {Math.round(receivable).toLocaleString("en-US")}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          {activeCustomers.length} registered customers
        </div>
      </div>

      {/* Search Input */}
      <input
        placeholder="🔍 Search customer by name or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%", padding: "13px 16px", borderRadius: T.radiusSm,
          border: `1.5px solid ${T.border}`, fontSize: 14, outline: "none",
          marginBottom: 12, background: T.inputBg, color: T.text, boxShadow: T.shadowSm,
        }}
      />

      {adding ? (
        <AddCustomer
          t={t}
          T={T}
          shopId={shopId}
          isDemo={isDemo}
          onAddDemoCustomer={(newCust) => {
            setDemoCustomers((prev) => [newCust, ...prev]);
            setAdding(false);
          }}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            width: "100%", padding: "14px", borderRadius: T.radiusSm,
            background: T.primaryGradient, color: "white", border: "none",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            marginBottom: 16, boxShadow: T.shadowSm,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span>+</span>
          <span>Add New Customer to Khata</span>
        </button>
      )}

      {/* Customer List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            style={{
              background: T.card, borderRadius: T.radius, padding: "14px 16px",
              border: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between",
              alignItems: "center", cursor: "pointer", boxShadow: T.shadowSm,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: (c.balance > 0) ? T.primaryLight : (c.balance < 0) ? "rgba(16,185,129,0.15)" : T.cardSecondary,
                color: (c.balance > 0) ? T.primary : (c.balance < 0) ? T.success : T.textMuted,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 16,
              }}>
                {(c.name || "U")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{c.name}</div>
                {c.phone && <div style={{ fontSize: 12, color: T.textMuted }}>{c.phone}</div>}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{
                fontWeight: 900, fontSize: 16,
                color: c.balance > 0 ? T.primary : c.balance < 0 ? T.success : T.textMuted,
              }}>
                Rs. {Math.abs(c.balance || 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.balance > 0 ? T.primary : c.balance < 0 ? T.success : T.textMuted }}>
                {c.balance > 0 ? "Baqaya (owes)" : c.balance < 0 ? "Advance paid" : "Cleared"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddCustomer({ t, T, shopId, isDemo, onAddDemoCustomer, onDone }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setErr("");
    if (!name.trim()) { setErr("Customer name is required."); return; }
    setBusy(true);

    if (isDemo) {
      setTimeout(() => {
        onAddDemoCustomer({
          id: "demo_c_" + Date.now(),
          name: name.trim(),
          phone: phone.trim(),
          balance: 0,
        });
        setBusy(false);
      }, 200);
      return;
    }

    try {
      await call("khataAddCustomer", { name: name.trim(), phone: phone.trim() });
      onDone();
    } catch (e) {
      setErr(e.message || "Failed to save customer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: T.card, borderRadius: T.radius, padding: 18,
      border: `2px solid ${T.primary}`, marginBottom: 14, boxShadow: T.shadowSm,
    }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: T.text }}>+ Add Khata Customer</h4>
      <input
        placeholder="Customer Full Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{
          width: "100%", padding: "12px 14px", borderRadius: T.radiusSm,
          border: `1.5px solid ${T.border}`, fontSize: 14, outline: "none", marginBottom: 10,
          background: T.inputBg, color: T.text,
        }}
      />
      <input
        placeholder="Phone Number (e.g. 0300-1234567)"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        style={{
          width: "100%", padding: "12px 14px", borderRadius: T.radiusSm,
          border: `1.5px solid ${T.border}`, fontSize: 14, outline: "none", marginBottom: 12,
          background: T.inputBg, color: T.text,
        }}
      />
      {err && <p style={{ color: T.primary, fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          disabled={busy}
          onClick={save}
          style={{
            flex: 1, padding: "12px", borderRadius: T.radiusSm,
            background: T.primaryGradient, color: "white", border: "none",
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {busy ? "Saving..." : "Save Customer"}
        </button>
        <button
          onClick={onDone}
          style={{
            padding: "12px 18px", borderRadius: T.radiusSm,
            background: T.cardSecondary, color: T.text, border: `1px solid ${T.border}`,
            fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CustomerLedger({
  shopId,
  customer,
  onBack,
  t,
  T,
  isDemo,
  demoEntries,
  onAddDemoEntry,
  onDeleteCustomer,
  onDeleteDemoEntry,
}) {
  const [entries, setEntries] = useState([]);
  const [type, setType] = useState("udhaar");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [deletingCust, setDeletingCust] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState("");

  useEffect(() => {
    if (isDemo) return;
    const q = query(collection(db, "shops", shopId, "khata_customers", customer.id, "entries"), orderBy("created_at", "desc"), limit(50));
    return onSnapshot(q, (s) => setEntries(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
  }, [shopId, customer.id, isDemo]);

  const activeEntries = isDemo ? demoEntries : entries;

  const handleDeleteCustomer = async () => {
    if (!window.confirm(`Delete customer "${customer.name}" and all transaction history? This cannot be undone.`)) return;
    setDeletingCust(true);
    try {
      if (isDemo) {
        onDeleteCustomer(customer.id);
      } else {
        await call("khataDeleteCustomer", { customerId: customer.id });
        onBack();
      }
    } catch (e) {
      alert("Failed to delete customer: " + (e.message || e));
    } finally {
      setDeletingCust(false);
    }
  };

  const handleDeleteEntry = async (entry) => {
    if (!window.confirm(`Delete this ${entry.type === "udhaar" ? "Udhaar" : "Payment"} of Rs. ${Number(entry.amount).toLocaleString()}? Balance will be adjusted automatically.`)) return;
    setDeletingEntryId(entry.id);
    try {
      if (isDemo) {
        const revAmount = entry.type === "udhaar" ? -(Number(entry.amount) || 0) : Number(entry.amount) || 0;
        const newBal = (customer.balance || 0) + revAmount;
        onDeleteDemoEntry(entry.id, newBal);
      } else {
        await call("khataDeleteEntry", { customerId: customer.id, entryId: entry.id });
      }
    } catch (err) {
      alert("Failed to delete entry: " + (err.message || err));
    } finally {
      setDeletingEntryId("");
    }
  };

  const save = async () => {
    setErr("");
    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) { setErr("Please enter a valid amount."); return; }
    setBusy(true);

    if (isDemo) {
      setTimeout(() => {
        const newBalance = type === "udhaar"
          ? (customer.balance || 0) + parsedAmount
          : (customer.balance || 0) - parsedAmount;
        onAddDemoEntry(
          {
            id: "entry_" + Date.now(),
            type,
            amount: parsedAmount,
            note: note.trim(),
            date: todayPK(),
          },
          newBalance
        );
        setAmount("");
        setNote("");
        setBusy(false);
      }, 200);
      return;
    }

    try {
      await call("khataAddEntry", { customerId: customer.id, type, amount: parsedAmount, note: note.trim() });
      setAmount("");
      setNote("");
    } catch (e) {
      setErr(e.message || "Failed to record transaction.");
    } finally {
      setBusy(false);
    }
  };

  const bal = customer.balance || 0;

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: "none", border: "none", color: T.primary, fontWeight: 700,
          fontSize: 14, cursor: "pointer", padding: "8px 0", marginBottom: 10,
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        &larr; Back to Customers
      </button>

      {/* Customer Header Info */}
      <div style={{
        background: T.card, borderRadius: T.radius, padding: 18,
        border: `1px solid ${T.border}`, boxShadow: T.shadowSm, marginBottom: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{customer.name}</div>
            {customer.phone && <div style={{ fontSize: 13, color: T.textMuted }}>{customer.phone}</div>}
          </div>
          <button
            onClick={handleDeleteCustomer}
            disabled={deletingCust}
            title="Delete Customer"
            style={{
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: T.danger,
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 4,
              opacity: deletingCust ? 0.5 : 1,
            }}
          >
            🗑️ Delete Customer
          </button>
        </div>
        <div style={{
          marginTop: 12, fontSize: 28, fontWeight: 900,
          color: bal > 0 ? T.primary : bal < 0 ? T.success : T.textMuted,
        }}>
          Rs. {Math.abs(bal).toLocaleString()}{" "}
          <span style={{ fontSize: 14, fontWeight: 700 }}>
            {bal > 0 ? "(Baqaya / Owes)" : bal < 0 ? "(Advance)" : "(Cleared)"}
          </span>
        </div>
      </div>

      {/* Add Entry Card */}
      <div style={{
        background: T.card, borderRadius: T.radius, padding: 18,
        border: `1px solid ${T.border}`, boxShadow: T.shadowSm, marginBottom: 14,
      }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setType("udhaar")}
            style={{
              flex: 1, padding: "12px", borderRadius: T.radiusSm, fontWeight: 800, fontSize: 14,
              border: `2px solid ${T.primary}`,
              background: type === "udhaar" ? T.primary : "transparent",
              color: type === "udhaar" ? "white" : T.primary,
              cursor: "pointer",
            }}
          >
            Udhaar Diya (+)
          </button>
          <button
            type="button"
            onClick={() => setType("payment")}
            style={{
              flex: 1, padding: "12px", borderRadius: T.radiusSm, fontWeight: 800, fontSize: 14,
              border: `2px solid ${T.success}`,
              background: type === "payment" ? T.success : "transparent",
              color: type === "payment" ? "white" : T.success,
              cursor: "pointer",
            }}
          >
            Payment Mili (-)
          </button>
        </div>

        <input
          placeholder="Amount (Rs.)"
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: T.radiusSm,
            border: `1.5px solid ${T.border}`, fontSize: 15, outline: "none",
            marginBottom: 10, fontWeight: 700, background: T.inputBg, color: T.text,
          }}
        />
        <input
          placeholder="Note (e.g. 5kg Rice, Flour sack, Cash received)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: T.radiusSm,
            border: `1.5px solid ${T.border}`, fontSize: 14, outline: "none", marginBottom: 12,
            background: T.inputBg, color: T.text,
          }}
        />
        {err && <p style={{ color: T.primary, fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
        
        <button
          disabled={busy}
          onClick={save}
          style={{
            width: "100%", padding: "14px", borderRadius: T.radiusSm,
            background: T.heroGradient, color: "white", border: "none",
            fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Recording Entry..." : "Save Entry"}
        </button>
      </div>

      {/* Transaction History */}
      <div style={{
        background: T.card, borderRadius: T.radius, padding: 18,
        border: `1px solid ${T.border}`, boxShadow: T.shadowSm,
      }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 800, color: T.text }}>Ledger History</h4>
        {activeEntries.length === 0 && <p style={{ color: T.textMuted, textAlign: "center", fontSize: 13 }}>No entries yet.</p>}
        {activeEntries.map((e) => (
          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{e.note || (e.type === "udhaar" ? "Udhaar" : "Payment")}</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>{e.date}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: e.type === "udhaar" ? T.primary : T.success }}>
                {e.type === "udhaar" ? "+" : "-"}Rs. {Number(e.amount).toLocaleString()}
              </div>
              <button
                disabled={deletingEntryId === e.id}
                onClick={() => handleDeleteEntry(e)}
                title="Delete Entry"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 6,
                  color: T.danger,
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                  opacity: deletingEntryId === e.id ? 0.4 : 1,
                }}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Alerts View
// ---------------------------------------------------------------------------
function Alerts({ alerts, t, T, isDemo, setDemoAlerts }) {
  const [busy, setBusy] = useState(false);
  const unseen = alerts.filter((a) => !a.seen);

  const markSeen = async () => {
    setBusy(true);
    if (isDemo) {
      setTimeout(() => {
        setDemoAlerts((prev) => prev.map((a) => ({ ...a, seen: true })));
        setBusy(false);
      }, 200);
      return;
    }
    try {
      await call("ackAlerts", { ids: unseen.map((a) => a.id) });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text }}>POS Security Alerts</h3>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: T.textMuted }}>Permanent tamper-detection record</p>
        </div>
        {unseen.length > 0 && (
          <button
            disabled={busy}
            onClick={markSeen}
            style={{
              background: T.heroGradient, color: "white", border: "none",
              borderRadius: T.radiusSm, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            Mark Seen
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div style={{
          background: T.card, borderRadius: T.radius, padding: 30, textAlign: "center",
          border: `1px solid ${T.border}`, color: T.textMuted,
        }}>
          🛡️ No suspicious activity found. POS is clean!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              style={{
                background: a.seen ? T.card : T.primaryLight,
                borderRadius: T.radius, padding: "16px",
                borderLeft: `6px solid ${a.severity === "high" ? T.primary : T.warn}`,
                border: `1px solid ${T.border}`,
                boxShadow: T.shadowSm,
                opacity: a.seen ? 0.75 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, color: a.severity === "high" ? T.primary : T.warn, marginBottom: 4 }}>
                <span>{a.severity === "high" ? "HIGH SEVERITY ALERT" : "CHECK REQUIRED"}</span>
                <span>{a.day}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
                {a.message_en || a.message_roman}
              </div>
              {a.amount > 0 && (
                <div style={{ fontSize: 14, fontWeight: 900, color: T.primary, marginTop: 6 }}>
                  Discrepancy: Rs. {Math.round(a.amount).toLocaleString("en-US")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notify({ shop, t, T, isDemo }) {
  const [supported, setSupported] = useState(false);
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");

  useEffect(() => {
    if (isDemo) return;
    isSupported().then(setSupported).catch(() => setSupported(false));
  }, [isDemo]);

  if (!supported || isDemo) return null;

  const enable = async () => {
    if (typeof Notification !== "undefined") {
      setPerm(await Notification.requestPermission());
    }
  };

  return (
    <div style={{ marginTop: 20, textAlign: "center", fontSize: 12 }}>
      {perm === "granted" && <span style={{ color: T.success, fontWeight: 700 }}>✓ Notifications Active</span>}
      {perm === "default" && (
        <button onClick={enable} style={{ background: T.cardSecondary, color: T.text, border: `1px solid ${T.border}`, padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
          Enable Phone Push Alerts
        </button>
      )}
    </div>
  );
}
