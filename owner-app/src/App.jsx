import React, { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, orderBy, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import lang from "./language.json";
import { jsPDF } from "jspdf";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import Header from "./components/common/Header";
import TabBar from "./components/common/TabBar";
import ActionSheetModal from "./components/common/ActionSheetModal";
import SettingsModal from "./components/settings/SettingsModal";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "hissab-live.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "hissab-live",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1028486183617",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1028486183617:web:e03c33a79f79c06645f240",
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

const SUPPORT_WA = import.meta.env.VITE_SUPPORT_WA || "https://wa.me/923229772869";

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
    purple: "#a855f7",
    purpleLight: "rgba(168,85,247,0.15)",
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
    purple: "#7c3aed",
    purpleLight: "#f5f3ff",
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
    id: "a0",
    type: "admin_notification",
    title: "📢 System Update & Support Announcement",
    severity: "info",
    day: todayPK(),
    seen: false,
    message_en: "Assalam-o-Alaikum! Real-time POS syncing, instant tamper security alerts, and new settings are now fully active.",
    sender: "admin@hisaablive.com",
  },
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

function AppContent() {
  const { lang: currentLang, t, isRtl, toggleLanguage } = useLanguage();
  const [authReady, setAuthReady] = useState(false);
  const [shopId, setShopId] = useState("");
  const [shop, setShop] = useState(null);
  const [today, setToday] = useState(todayPK());
  const [view, setView] = useState("hisaab");
  const [alerts, setAlerts] = useState([]);
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  // Theme Mode (Default: dark for eye comfort)
  const [themeMode, setThemeMode] = useState(localStorage.getItem("hl_theme") || "dark");
  const T = THEMES[themeMode] || THEMES.dark;

  const toggleTheme = () => {
    const next = themeMode === "dark" ? "light" : "dark";
    setThemeMode(next);
  };

  // Synchronize DOM classes, Ionic palette, and localStorage on themeMode change
  useEffect(() => {
    const isDark = themeMode !== "light";
    const root = document.documentElement;
    const body = document.body;
    if (isDark) {
      root.classList.add("dark", "ion-palette-dark");
      body.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark", "ion-palette-dark");
      body.classList.remove("dark");
      root.style.colorScheme = "light";
    }
    localStorage.setItem("hl_theme", themeMode);
  }, [themeMode]);

  // Settings Screen / Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Swipe Gestures Between Primary Tabs
  const TABS_ORDER = ["hisaab", "expenses", "khata", "reports"];
  const touchStartRef = React.useRef({ x: 0, y: 0, time: 0 });

  const handleTouchStart = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e) => {
    if (!e.changedTouches || e.changedTouches.length !== 1) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const duration = Date.now() - touchStartRef.current.time;

    // Gesture threshold: natural intentional horizontal swipe
    if (duration > 900) return;
    if (Math.abs(deltaX) < 40) return;
    if (Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;

    // Prevent tab swipe if any modal or sheet is open
    if (showAlertsModal || showSettingsModal || showExpenseModal || showMonthlyModal || showLogoutAllSheet) return;

    // Do not intercept if typing inside an input, textarea, or contenteditable
    const target = e.target;
    if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }

    const currentIndex = TABS_ORDER.indexOf(view);
    if (currentIndex === -1) return;

    // LTR vs RTL swipe direction awareness
    // In LTR: swipe left (deltaX < 0) -> next tab; swipe right (deltaX > 0) -> previous tab
    const isNext = isRtl ? deltaX > 0 : deltaX < 0;

    if (isNext && currentIndex < TABS_ORDER.length - 1) {
      setView(TABS_ORDER[currentIndex + 1]);
    } else if (!isNext && currentIndex > 0) {
      setView(TABS_ORDER[currentIndex - 1]);
    }
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
  // Logout All Confirmation Sheet State
  const [showLogoutAllSheet, setShowLogoutAllSheet] = useState(false);

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

  // Real Firebase Auth listener with guaranteed 2.5s fallback unblock
  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthReady((ready) => {
        if (!ready) {
          const saved = localStorage.getItem("active_shop_id") || "";
          setShopId(saved);
          return true;
        }
        return true;
      });
    }, 2500);

    const unsub = onAuthStateChanged(auth, async (u) => {
      clearTimeout(timer);
      if (!isDemo) {
        if (!u) {
          const saved = localStorage.getItem("active_shop_id") || "";
          setShopId(saved);
        } else {
          try {
            const r = await u.getIdTokenResult();
            const sid = (r && r.claims && r.claims.shopId) || localStorage.getItem("active_shop_id") || "";
            setShopId(sid);
          } catch (e) {
            console.warn("Auth token lookup error:", e);
            setShopId(localStorage.getItem("active_shop_id") || "");
          }
        }
      }
      setAuthReady(true);
    });

    return () => {
      clearTimeout(timer);
      unsub();
    };
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

  // Firestore live alerts & admin announcements
  const active = shop && shop.status === "active";
  useEffect(() => {
    if (isDemo) return;
    if (!shopId) { setAlerts([]); return; }

    let shopAlertsList = [];
    let adminNotifsList = [];

    const mergeAndSet = () => {
      const combined = [...shopAlertsList];
      // Add any admin notifications targeted to 'all' or this shopId if not already present
      adminNotifsList.forEach((notif) => {
        if (!combined.some((a) => a.id === notif.id || (a.title === notif.title && a.created_at === notif.created_at))) {
          if (notif.target === "all" || notif.target === shopId) {
            combined.push(notif);
          }
        }
      });
      // Sort newest first
      combined.sort((a, b) => String(b.created_at || b.day || "").localeCompare(String(a.created_at || a.day || "")));
      setAlerts(combined);
    };

    // 1. Listen to shop-specific alerts
    const qShop = query(collection(db, "shops", shopId, "alerts"), orderBy("created_at", "desc"), limit(50));
    const unsubShop = onSnapshot(qShop, (s) => {
      shopAlertsList = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      mergeAndSet();

      // Trigger Web / Mobile Notification for newly received unread notifications
      s.docChanges().forEach((change) => {
        if (change.type === "added") {
          const item = change.doc.data();
          if (!item.seen && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              const title = item.title || (item.type === "admin_notification" ? "📢 HisaabLive Announcement" : "🚨 HisaabLive Alert");
              const body = item.message_en || item.message_roman || "You have a new alert.";
              new Notification(title, {
                body,
                icon: "/favicon.ico",
                badge: "/favicon.ico",
                tag: change.doc.id,
              });
            } catch (err) {
              console.warn("Notification trigger error:", err);
            }
          }
        }
      });
    }, (e) => console.warn("Shop alerts listener:", e));

    // 2. Listen to global admin announcements / broadcasts
    const qGlobal = query(collection(db, "admin_notifications"), orderBy("created_at", "desc"), limit(10));
    const unsubGlobal = onSnapshot(qGlobal, (s) => {
      adminNotifsList = s.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => d.stopped !== true && d.active !== false);
      mergeAndSet();
    }, (e) => console.warn("Admin notifications listener:", e));

    return () => {
      unsubShop();
      unsubGlobal();
    };
  }, [shopId, isDemo]);

  // Firestore live khata customers listener
  const [khataCustomers, setKhataCustomers] = useState([]);
  useEffect(() => {
    if (isDemo || !shopId) {
      if (!isDemo) setKhataCustomers([]);
      return;
    }
    const qCust = collection(db, "shops", shopId, "khata_customers");
    return onSnapshot(
      qCust,
      (s) => setKhataCustomers(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.warn("Khata customers listener error:", e)
    );
  }, [shopId, isDemo]);

  const activeKhataCustomers = isDemo ? demoCustomers : khataCustomers;

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
        if (!auth.currentUser) {
          try {
            await signInAnonymously(auth);
          } catch (eAnon) {
            console.warn("Anonymous sign-in check:", eAnon);
          }
        }
        
        let snap = await getDoc(doc(db, "shops", targetId));
        let shopData = snap.exists() ? snap.data() : null;
        let shopIdFound = snap.exists() ? snap.id : null;

        // If not found by shop code ID, try matching phone number or uppercase code
        if (!shopData) {
          try {
            const rawPhone = code.trim();
            const dashPhone = rawPhone.length === 11 && !rawPhone.includes("-") ? rawPhone.slice(0, 4) + "-" + rawPhone.slice(4) : rawPhone;
            const qPhone = query(collection(db, "shops"), where("owner_phone", "in", [rawPhone, dashPhone]));
            const qSnap = await getDocs(qPhone);
            if (!qSnap.empty) {
              shopData = qSnap.docs[0].data();
              shopIdFound = qSnap.docs[0].id;
            }
          } catch (eQ) {
            console.warn("Phone query fallback:", eQ);
          }
        }

        if (shopData && shopIdFound) {
          if (String(shopData.pin_code) === String(pin)) {
            localStorage.setItem("active_shop_id", shopIdFound);
            setShopId(shopIdFound);
            setShop({ id: shopIdFound, ...shopData });
            setPin("");
            setBusy(false);
            return;
          } else {
            setErr("Incorrect 6-digit PIN. Please try again.");
            setBusy(false);
            return;
          }
        } else {
          setErr(`Shop '${code.trim().toUpperCase()}' does not exist. Please register it in Super Admin first.`);
          setBusy(false);
          return;
        }
      } catch (errDb) {
        console.warn("Direct db check:", errDb);
        setErr("Database error: " + (errDb.message || "Failed to connect to Firestore."));
        setBusy(false);
        return;
      }
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
    localStorage.removeItem("active_shop_id");
    if (isDemo) {
      setIsDemo(false);
      setShopId("");
      setShop(null);
      setLoginStep(1);
      return;
    }
    setShopId("");
    setShop(null);
    setView("hisaab");
    setLoginStep(1);
    return signOut(auth);
  };

  const logoutAll = () => {
    setShowLogoutAllSheet(true);
  };

  const handleConfirmLogoutAll = async () => {
    setShowLogoutAllSheet(false);
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

  // Waiting for live shop document from Firestore
  if (shopId && !shop && !isDemo) {
    return (
      <>
        <style>{globalStyle}</style>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: T.bg, padding: 20 }}>
          <div style={{ textAlign: "center", color: T.textMuted }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.primaryGradient, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 32, boxShadow: T.shadowMd }}>
              ⚡
            </div>
            <p style={{ fontWeight: 700, fontSize: 16, color: T.text, margin: 0 }}>HisaabLive</p>
            <p style={{ fontSize: 13, color: T.textMuted, margin: "6px 0 16px" }}>Connecting to shop...</p>
            <button
              onClick={logout}
              style={{
                background: T.cardSecondary, color: T.text, border: `1.5px solid ${T.border}`,
                borderRadius: T.radiusSm, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer"
              }}
            >
              Back to Login
            </button>
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
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          maxWidth: 460,
          margin: "0 auto",
          minHeight: "100vh",
          background: T.bg,
          position: "relative",
          touchAction: "pan-y",
        }}
      >
        
        {/* Notch-Safe Header */}
        <Header
          shop={shop}
          unseenAlerts={unseen}
          onOpenAlerts={() => setShowAlertsModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          isDemo={isDemo}
          onExitDemo={logout}
        />

        {/* Live Admin Broadcast Banner (Visible directly below Header) */}
        {(() => {
          const latestAdminBroadcast = liveAlerts.find((a) => a.type === "admin_notification" && !a.seen);
          if (!latestAdminBroadcast) return null;
          const isUrgent = latestAdminBroadcast.severity === "high";
          const isWarning = latestAdminBroadcast.severity === "medium";
          const badgeColor = isUrgent ? T.danger : isWarning ? T.warn : (T.purple || "#8b5cf6");
          const bgShade = isUrgent
            ? (T.primaryLight || "rgba(244,63,94,0.15)")
            : isWarning
            ? "rgba(245,158,11,0.15)"
            : (T.purpleLight || "rgba(139,92,246,0.15)");

          return (
            <div
              onClick={() => setShowAlertsModal(true)}
              style={{
                background: bgShade,
                borderBottom: `1.5px solid ${badgeColor}`,
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                cursor: "pointer",
                boxShadow: T.shadowSm,
                animation: "fadeIn 0.25s ease-in",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: badgeColor,
                    flexShrink: 0,
                    boxShadow: `0 0 6px ${badgeColor}`,
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 900, color: badgeColor, textTransform: "uppercase", flexShrink: 0 }}>
                  {isUrgent ? "Urgent" : isWarning ? "Notice" : "Announcement"}:
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {latestAdminBroadcast.title || latestAdminBroadcast.message_en || latestAdminBroadcast.message_roman}
                </span>
              </div>
              <span style={{ fontSize: 11, color: badgeColor, fontWeight: 800, flexShrink: 0 }}>
                View ➔
              </span>
            </div>
          );
        })()}

        {/* Dedicated Settings Feature / Modal */}
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          shop={shop}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
          isDemo={isDemo}
          onExitDemo={logout}
          onLogout={logout}
          onLogoutAll={() => setShowLogoutAllSheet(true)}
          supportUrl={SUPPORT_WA}
        />

        {/* Main Content Area with Native Touch & Swipe Gesture Navigation */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            padding: "16px",
            paddingBottom: 110,
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
            minHeight: "calc(100vh - 70px)",
          }}
        >
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
              demoCustomers={demoCustomers}
              customers={activeKhataCustomers}
              onAlerts={() => setShowAlertsModal(true)}
              onOpenExpenseDetails={() => setShowExpenseModal(true)}
              onOpenMonthlyStatement={(sale, exp) => {
                setMonthlyData({ mSale: sale, mExp: exp });
                setShowMonthlyModal(true);
              }}
            />
          )}

          {view === "expenses" && (
            <ExpensesTabContent
              today={today}
              shopId={shopId}
              T={T}
              t={t}
              isDemo={isDemo}
              demoExpenses={demoExpenses}
              setDemoExpenses={setDemoExpenses}
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

          {view === "reports" && (
            <ReportsTabContent
              shop={shop}
              shopId={shopId}
              today={today}
              T={T}
              t={t}
              isDemo={isDemo}
              demoExpenses={demoExpenses}
              customers={activeKhataCustomers}
            />
          )}

          {view === "alerts" && (
            <Alerts
              alerts={liveAlerts}
              t={t}
              T={T}
              isDemo={isDemo}
              setDemoAlerts={setDemoAlerts}
              shopId={shopId}
            />
          )}

          <Notify shop={shop} t={t} T={T} isDemo={isDemo} />
        </div>

        {/* Fixed 4-Tab Bottom Navigation Bar */}
        <TabBar
          activeTab={view}
          onTabChange={(newTab) => setView(newTab)}
          unseenAlerts={unseen}
        />

        {/* Security Alerts Modal */}
        {showAlertsModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              zIndex: 99,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              backdropFilter: "blur(5px)",
            }}
            onClick={() => setShowAlertsModal(false)}
          >
            <div
              style={{
                background: T.card,
                width: "100%",
                maxWidth: 460,
                maxHeight: "88vh",
                borderTopLeftRadius: T.radiusXl,
                borderTopRightRadius: T.radiusXl,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: T.shadowLg,
                animation: "slideUp 0.25s ease-out",
                border: `1px solid ${T.border}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: `1px solid ${T.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🔔</span>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>
                    {t.alerts_title || "POS Activity & Security Alerts"}
                  </h3>
                </div>
                <button
                  onClick={() => setShowAlertsModal(false)}
                  style={{
                    background: T.cardSecondary,
                    border: `1px solid ${T.border}`,
                    color: T.textMuted,
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ overflowY: "auto", padding: "16px" }}>
                <Alerts
                  alerts={liveAlerts}
                  t={t}
                  T={T}
                  isDemo={isDemo}
                  setDemoAlerts={setDemoAlerts}
                  shopId={shopId}
                />
              </div>
            </div>
          </div>
        )}

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
            customers={activeKhataCustomers}
            onClose={() => setShowMonthlyModal(false)}
          />
        )}

        {/* Logout All ActionSheet Confirmation */}
        <ActionSheetModal
          isOpen={showLogoutAllSheet}
          title={t.logout_all || "Logout All Devices"}
          message={t.logout_all_confirm || "Logout from every phone/device? You will need your PIN to sign in again."}
          confirmText={t.logout_all || "Logout All Devices"}
          cancelText={t.cancel || "Cancel"}
          isDestructive={true}
          icon="🚪"
          onClose={() => setShowLogoutAllSheet(false)}
          onConfirm={handleConfirmLogoutAll}
        />

      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dedicated Expenses Tab Content View
// ---------------------------------------------------------------------------
function ExpensesTabContent({
  today,
  shopId,
  T,
  t,
  isDemo,
  demoExpenses,
  setDemoExpenses,
}) {
  const [liveExpenses, setLiveExpenses] = useState(isDemo ? demoExpenses : []);
  const [selectedCat, setSelectedCat] = useState("All");
  const [deletingId, setDeletingId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);

  useEffect(() => {
    if (isDemo) {
      setLiveExpenses(demoExpenses);
      return;
    }
    if (!shopId) return;
    const q = query(
      collection(db, "shops", shopId, "expenses"),
      where("date", "==", today)
    );
    return onSnapshot(
      q,
      (s) => setLiveExpenses(s.docs.map((x) => ({ id: x.id, ...x.data() }))),
      (e) => console.error("Expenses fetch error:", e)
    );
  }, [shopId, today, isDemo, demoExpenses]);

  const handleDeletePrompt = (e, item) => {
    e.stopPropagation();
    setExpenseToDelete(item);
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;
    const item = expenseToDelete;
    setExpenseToDelete(null);
    setDeletingId(item.id);
    try {
      if (isDemo) {
        setDemoExpenses((prev) => prev.filter((x) => x.id !== item.id));
      } else {
        try {
          await call("deleteExpense", { expenseId: item.id });
        } catch (fnErr) {
          // Direct Firestore write fallback
          await deleteDoc(doc(db, "shops", shopId, "expenses", item.id));
        }
      }
    } catch (err) {
      alert("Failed to delete expense: " + (err.message || err));
    } finally {
      setDeletingId("");
    }
  };

  const total = liveExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const filteredItems = selectedCat === "All"
    ? liveExpenses
    : liveExpenses.filter((e) => e.category === selectedCat);

  return (
    <div>
      {/* Header Summary Card */}
      <div className="rounded-2xl bg-slate-card border border-slate-border p-4 shadow-sm mb-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
              {t.total_expense || "Today's Expenses"}
            </span>
            <div className="text-2xl font-black text-rose-crimson mt-0.5">
              Rs. {Number(total).toLocaleString()}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm flex items-center gap-1.5 ${
              showAddForm
                ? "bg-slate-800 text-slate-300 border border-slate-700"
                : "bg-sky-cyan text-slate-950 hover:bg-sky-cyan/90 shadow-sky-cyan/20"
            }`}
          >
            {showAddForm ? (t.close || "Close Form") : (t.add_expense || "+ Add Expense")}
          </button>
        </div>

        {/* Category Pills Filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {["All", ...CATS.map((c) => c.name)].map((cat) => {
            const isSelected = selectedCat === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCat(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap active:scale-95 flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-sky-cyan text-slate-950 shadow-sm shadow-sky-cyan/25"
                    : "bg-slate-800/80 text-slate-300 border border-slate-700/60 hover:border-slate-500"
                }`}
              >
                {cat === "All" ? (t.all_categories || "All") : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Expense Form */}
      {showAddForm && (
        <div className="mb-4">
          <ExpenseForm
            shopId={shopId}
            T={T}
            isDemo={isDemo}
            onAddDemoExpense={(newExp) => {
              setDemoExpenses((prev) => [newExp, ...prev]);
              setShowAddForm(false);
            }}
          />
        </div>
      )}

      {/* Expenses List */}
      <div className="rounded-2xl bg-slate-card border border-slate-border p-4 shadow-sm">
        <div className="text-sm font-bold text-slate-100 mb-3 flex items-center justify-between">
          <span>{selectedCat === "All" ? (t.today_expenses || "Today's Expenses") : selectedCat}</span>
          <span className="text-xs text-slate-400 font-medium">({filteredItems.length})</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            {t.no_entries || "No expenses recorded today."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 transition-all"
              >
                <div className="min-w-0 flex-1 mr-3">
                  <div className="font-bold text-sm text-slate-100 truncate">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span className="inline-block px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-medium text-slate-300 border border-slate-700/50">
                      {item.category || "Other"}
                    </span>
                    {item.time && <span>• {item.time}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-sm font-black text-rose-crimson">
                    Rs. {Number(item.amount || 0).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleDeletePrompt(e, item)}
                    disabled={deletingId === item.id}
                    title="Delete Expense"
                    className="w-8 h-8 rounded-lg bg-rose-crimson/10 border border-rose-crimson/30 text-rose-crimson hover:bg-rose-crimson/20 active:scale-90 flex items-center justify-center text-xs transition-all disabled:opacity-40"
                  >
                    {deletingId === item.id ? "..." : "🗑️"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ActionSheet Confirmation Dialog */}
      <ActionSheetModal
        isOpen={Boolean(expenseToDelete)}
        title={t.confirm_delete || "Delete Expense"}
        message={
          expenseToDelete
            ? `Delete expense "${expenseToDelete.title}" (Rs. ${Number(expenseToDelete.amount || 0).toLocaleString()})? This cannot be undone.`
            : ""
        }
        confirmText={t.delete || "Delete Expense"}
        cancelText={t.cancel || "Cancel"}
        isDestructive={true}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dedicated Monthly Reports & Statement Tab Content View
// ---------------------------------------------------------------------------
function ReportsTabContent({
  shop,
  shopId,
  today,
  T,
  t,
  isDemo,
  demoExpenses,
  customers = [],
}) {
  const ym = today.slice(0, 7);
  const [items, setItems] = useState([]);
  const [monthSummary, setMonthSummary] = useState(null);
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
    if (!shopId) return;

    const qExp = query(
      collection(db, "shops", shopId, "expenses"),
      where("date", ">=", `${ym}-01`),
      where("date", "<=", `${ym}-31`),
      orderBy("date", "desc")
    );
    const unsubExp = onSnapshot(qExp, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error("Monthly expenses fetch error:", e));

    const docMonth = doc(db, "shops", shopId, "monthly_summary", ym);
    const unsubMonth = onSnapshot(docMonth, (d) => setMonthSummary(d.exists() ? d.data() : {}), (e) => console.error("Monthly summary fetch error:", e));

    return () => {
      unsubExp();
      unsubMonth();
    };
  }, [shopId, ym, isDemo, demoExpenses]);

  const totalExpense = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalSale = isDemo ? 540000 : ((monthSummary && monthSummary.sale) || 0);
  const netProfit = totalSale - totalExpense;
  const margin = totalSale > 0 ? ((netProfit / totalSale) * 100).toFixed(1) : "0.0";

  // Category breakdown
  const catBreakdown = CATS.map((cat) => {
    const catItems = items.filter((it) => it.category === cat.name);
    const total = catItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    return { ...cat, total, count: catItems.length };
  });

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
        customers,
      });
    } catch (e) {
      console.error("PDF generation failed:", e);
      alert("Failed to generate PDF: " + (e.message || e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      {/* Month Header & Download Action */}
      <div className="rounded-2xl bg-slate-card border border-slate-border p-4 shadow-sm mb-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 m-0">
              {t.month_title || "This Month Summary"}
            </h3>
            <span className="text-xs text-slate-400 font-semibold">{ym}</span>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-cyan text-slate-950 hover:bg-sky-cyan/90 transition-all active:scale-95 shadow-sm shadow-sky-cyan/25 flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>📄</span>
            <span>{downloading ? "Preparing..." : (t.download_pdf || "Download PDF")}</span>
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              {t.month_sale || "Monthly Sales"}
            </span>
            <div className="text-lg font-black text-emerald-mint mt-1">
              Rs. {Number(totalSale).toLocaleString()}
            </div>
          </div>
          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              {t.month_expense || "Monthly Expenses"}
            </span>
            <div className="text-lg font-black text-rose-crimson mt-1">
              Rs. {Number(totalExpense).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Net Profit & Margin Hero Banner */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-3.5 rounded-xl border border-slate-700 flex justify-between items-center">
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">
              {t.month_profit || "Net Profit"}
            </span>
            <div className="text-xl font-black text-sky-cyan mt-0.5">
              Rs. {Number(netProfit).toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 font-bold">Margin</span>
            <div className="text-sm font-black text-emerald-mint bg-emerald-mint/15 border border-emerald-mint/30 px-2.5 py-0.5 rounded-full mt-0.5">
              {margin}%
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown with Progress Bars */}
      <div className="rounded-2xl bg-slate-card border border-slate-border p-4 shadow-sm">
        <div className="text-sm font-bold text-slate-100 mb-3 flex items-center justify-between">
          <span>Category Expenses Breakdown</span>
          <span className="text-xs text-slate-400 font-medium">{catBreakdown.filter(c => c.total > 0).length} active</span>
        </div>
        <div className="flex flex-col gap-2.5">
          {catBreakdown.map((cat) => {
            const pct = totalExpense > 0 ? ((cat.total / totalExpense) * 100).toFixed(1) : "0.0";
            return (
              <div
                key={cat.name}
                className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50"
              >
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{cat.icon}</span>
                    <span className="text-xs font-bold text-slate-200">{cat.name}</span>
                    <span className="text-[11px] text-slate-400">({cat.count})</span>
                  </div>
                  <div className="text-right flex items-baseline gap-1.5">
                    <span className={`text-xs font-black ${cat.total > 0 ? "text-slate-100" : "text-slate-400"}`}>
                      Rs. {Number(cat.total).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">({pct}%)</span>
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: cat.color || "#38bdf8",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App Export wrapped in LanguageProvider
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
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
  demoCustomers,
  customers = [],
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
  
  const sale = (shop && shop.today_sale_date === today) ? (shop.today_sale || 0) : 0;
  const missing = (shop && shop.today_sale_date === today) ? (shop.today_missing || 0) : 0;
  const netProfit = sale - totalExp;
  const todayMargin = sale > 0 ? ((netProfit / sale) * 100).toFixed(1) : "0.0";
  const khataReceivable = isDemo
    ? ((demoCustomers || []).reduce((a, c) => a + (c.balance > 0 ? c.balance : 0), 0))
    : ((customers && customers.length > 0)
        ? customers.reduce((a, c) => a + (c.balance > 0 ? c.balance : 0), 0)
        : ((shop && (shop.khata_receivables || shop.khata_total)) || 0));
  const khataAdvance = isDemo
    ? ((demoCustomers || []).reduce((a, c) => a + (c.balance < 0 ? Math.abs(c.balance) : 0), 0))
    : ((customers && customers.length > 0)
        ? customers.reduce((a, c) => a + (c.balance < 0 ? Math.abs(c.balance) : 0), 0)
        : ((shop && shop.khata_advance) || 0));

  const mSale = isDemo ? 540000 : ((month && month.sale) || 0);
  const mExp = isDemo ? (110000 + totalExp) : ((month && month.expense) || 0);

  return (
    <div>
      {/* Missing Sales Warning Banner (Rose Crimson) */}
      {missing > 0 && (
        <div
          onClick={onAlerts}
          className="cursor-pointer mb-4 p-3.5 rounded-2xl bg-rose-crimson/10 border border-rose-crimson/30 text-rose-crimson shadow-sm flex items-center gap-3 transition-all active:scale-[0.99]"
        >
          <span className="text-xl flex-shrink-0">🚨</span>
          <span className="flex-1 font-bold text-xs leading-snug">
            {t.missing_today.replace("{x}", Math.round(missing).toLocaleString("en-US"))}
          </span>
          <span className="text-xs font-black text-rose-crimson uppercase tracking-wide flex items-center gap-1 flex-shrink-0">
            Review &rarr;
          </span>
        </div>
      )}

      {/* Net Profit Hero Card with prominent visual hierarchy */}
      <div
        className={`rounded-2xl p-5 mb-4 text-white shadow-lg relative overflow-hidden border ${
          netProfit >= 0
            ? "bg-gradient-to-br from-slate-900 via-slate-850 to-slate-800 border-slate-700/80"
            : "bg-gradient-to-br from-rose-950/70 via-slate-900 to-slate-900 border-rose-crimson/40"
        }`}
      >
        {/* Subtle Ambient Radial Glow */}
        <div
          className={`absolute top-0 right-0 w-36 h-36 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10 ${
            netProfit >= 0 ? "bg-emerald-mint/15" : "bg-rose-crimson/15"
          }`}
        />

        <div className="flex justify-between items-center relative z-10">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            {t.profit || "Today's Net Munafa (Profit)"}
          </span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/10 text-slate-200 border border-white/15">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-mint animate-pulse" />
              Live
            </span>
          </div>
        </div>

        <div className="text-3xl font-black my-2.5 tracking-tight text-white relative z-10 flex items-baseline gap-2.5 flex-wrap">
          <span>Rs. {netProfit.toLocaleString()}</span>
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
              netProfit >= 0
                ? "bg-emerald-mint/15 text-emerald-mint border border-emerald-mint/30"
                : "bg-rose-crimson/15 text-rose-crimson border border-rose-crimson/30"
            }`}
          >
            Margin: {todayMargin}%
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-300 pt-2.5 border-t border-white/10 relative z-10">
          <span>Sales: <b className="text-emerald-mint font-bold">Rs. {sale.toLocaleString()}</b></span>
          <span className="text-slate-500">•</span>
          <span>Kharcha: <b className="text-rose-crimson font-bold">Rs. {totalExp.toLocaleString()}</b></span>
        </div>
      </div>

      {/* Interactive KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Today's Sale Card (Emerald Mint) */}
        <div className="rounded-2xl bg-slate-card border border-slate-border p-3.5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-emerald-mint text-xs font-bold uppercase tracking-wide">
            <span>📈</span>
            <span>{t.total_sale || "TODAY'S SALE"}</span>
          </div>
          <div className="text-xl font-black text-slate-100 my-1.5">
            Rs. {sale.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">Auto-synced from POS</div>
        </div>

        {/* CLICKABLE Today's Expense Card (Rose Crimson) */}
        <div
          onClick={onOpenExpenseDetails}
          className="rounded-2xl bg-slate-card border border-rose-crimson/30 p-3.5 shadow-sm cursor-pointer hover:border-rose-crimson/60 active:scale-[0.99] transition-all flex flex-col justify-between"
        >
          <div className="flex justify-between items-center text-rose-crimson text-xs font-bold uppercase tracking-wide">
            <div className="flex items-center gap-1.5">
              <span>💸</span>
              <span>{t.total_expense || "TODAY'S KHARCHA"}</span>
            </div>
            <span className="text-[11px] text-sky-cyan font-bold">View &rarr;</span>
          </div>
          <div className="text-xl font-black text-rose-crimson my-1.5">
            Rs. {totalExp.toLocaleString()}
          </div>
          <div className="text-[11px] text-rose-crimson font-semibold">
            Tap for breakdown 🔍
          </div>
        </div>
      </div>

      {/* Khata Receivables & Advance Payments Banner */}
      {(khataReceivable > 0 || khataAdvance > 0) && (
        <div className="rounded-2xl bg-slate-card border border-amber-warm/30 p-3.5 shadow-sm mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-warm/15 border border-amber-warm/30 text-amber-warm flex items-center justify-center font-bold text-base flex-shrink-0">
              📒
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-amber-warm uppercase tracking-wide">
                  {t.receivables || "Khata Receivables"}
                </span>
                {khataAdvance > 0 && (
                  <span className="text-[10px] font-bold text-emerald-mint bg-emerald-mint/15 px-1.5 py-0.2 rounded">
                    +Rs. {Math.round(khataAdvance).toLocaleString()} Advance
                  </span>
                )}
              </div>
              <div className="text-lg font-black text-amber-warm">
                Rs. {Math.round(khataReceivable).toLocaleString()}
              </div>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium">Baqaya</span>
        </div>
      )}

      {/* Monthly Summary Card (Clickable for Statement & PDF) */}
      <div
        onClick={() => onOpenMonthlyStatement && onOpenMonthlyStatement(mSale, mExp)}
        className="rounded-2xl bg-slate-card border border-slate-border hover:border-sky-cyan/40 p-4 shadow-sm mb-4 cursor-pointer transition-all active:scale-[0.99]"
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-100 m-0">{t.month_title || "This Month Summary"}</h4>
            <span className="text-[11px] text-slate-400 font-medium">Month: {ym}</span>
          </div>
          <span className="text-xs font-bold text-sky-cyan bg-sky-cyan/15 border border-sky-cyan/30 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-sm">
            <span>📄 Statement & PDF</span>
            <span>&rarr;</span>
          </span>
        </div>
        <Row label={t.month_sale || "Monthly Sales"} value={mSale} color="text-emerald-mint" />
        <Row label={t.month_expense || "Monthly Expenses"} value={mExp} color="text-rose-crimson" />
        <div className="h-px bg-slate-border my-2" />
        <Row label={t.month_profit || "Monthly Profit"} value={mSale - mExp} bold isProfit color="text-emerald-mint" />
        <div className="text-right mt-2">
          <span className="text-[11px] text-slate-400 font-medium">
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

function Row({ label, value, bold, isProfit, color, T }) {
  return (
    <div className={`flex justify-between items-center my-1.5 text-sm ${bold ? "font-bold text-slate-100" : "font-medium text-slate-300"}`}>
      <span className={bold ? "text-slate-100" : "text-slate-400"}>{label}</span>
      <span className={color || (isProfit ? "text-emerald-mint font-bold" : bold ? "text-slate-100" : "text-slate-200")}>
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
  const [expenseToDelete, setExpenseToDelete] = useState(null);

  useEffect(() => {
    if (isDemo) {
      setLiveExpenses(expenses);
      return;
    }
    const q = query(collection(db, "shops", shopId, "expenses"), where("date", "==", today));
    return onSnapshot(q, (s) => setLiveExpenses(s.docs.map((x) => ({ id: x.id, ...x.data() }))), (e) => console.error(e));
  }, [shopId, today, isDemo, expenses]);

  const handleDeletePrompt = (e, item) => {
    e.stopPropagation();
    setExpenseToDelete(item);
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;
    const item = expenseToDelete;
    setExpenseToDelete(null);
    setDeletingId(item.id);
    try {
      if (isDemo) {
        onDeleteExpense(item.id);
      } else {
        try {
          await call("deleteExpense", { expenseId: item.id });
        } catch (fnErr) {
          await deleteDoc(doc(db, "shops", shopId, "expenses", item.id));
        }
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
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end justify-center backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-card w-full max-w-md max-h-[88vh] rounded-t-3xl flex flex-col overflow-hidden shadow-2xl border-t border-x border-slate-border animate-slide-up pb-safe">
        {/* Header */}
        <div className="p-4 border-b border-slate-border">
          <div className="w-10 h-1 rounded-full bg-slate-700/60 mx-auto mb-3" />
          <div className="flex justify-between items-center">
            <div>
              <h3 className="m-0 text-base font-bold text-slate-100">Today's Expenses Breakdown</h3>
              <p className="m-0 text-xs text-slate-400 mt-0.5">
                Total spent: <b className="text-rose-crimson font-black">Rs. {total.toLocaleString()}</b>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold flex items-center justify-center text-sm hover:bg-slate-700 active:scale-95 transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Category Progress Bars */}
          <div className="mb-5">
            <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-2.5">
              Category Breakdown
            </div>
            <div className="flex flex-col gap-2">
              {Object.values(catBreakdown)
                .filter((c) => c.total > 0)
                .map((cat) => {
                  const pct = total > 0 ? Math.round((cat.total / total) * 100) : 0;
                  const isSelected = selectedCat === cat.name;
                  return (
                    <div
                      key={cat.name}
                      onClick={() => setSelectedCat(isSelected ? "All" : cat.name)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-slate-800/80 border-sky-cyan shadow-sm"
                          : "bg-slate-800/40 border-slate-700/50 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold flex items-center gap-1.5 text-slate-200">
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </span>
                        <span className="text-xs font-black text-slate-100">
                          Rs. {cat.total.toLocaleString()} <small className="text-slate-400 font-normal">({pct}%)</small>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: cat.color }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Itemized List */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                Itemized Expenses {selectedCat !== "All" && `(${selectedCat})`}
              </div>
              {selectedCat !== "All" && (
                <button
                  type="button"
                  onClick={() => setSelectedCat("All")}
                  className="text-xs font-bold text-sky-cyan hover:underline p-0"
                >
                  Show All
                </button>
              )}
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center text-slate-400 py-6 text-xs">No items recorded.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredItems.map((item) => {
                  const catInfo = CATS.find((c) => c.name === item.category) || { icon: "📦", color: "#64748b" };
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex justify-between items-center hover:border-slate-600 transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-sm flex-shrink-0">
                          {catInfo.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-slate-100 truncate">{item.title}</div>
                          <div className="text-[11px] text-slate-400">
                            {item.category} {item.time ? `• ${item.time}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-xs font-black text-rose-crimson">
                          Rs. {Number(item.amount).toLocaleString()}
                        </div>
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={(e) => handleDeletePrompt(e, item)}
                          title="Delete Expense"
                          className="w-7 h-7 rounded-lg bg-rose-crimson/10 border border-rose-crimson/30 text-rose-crimson hover:bg-rose-crimson/20 active:scale-90 flex items-center justify-center text-xs transition-all disabled:opacity-40"
                        >
                          {deletingId === item.id ? "..." : "🗑️"}
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
        <div className="p-3.5 border-t border-slate-border bg-slate-850">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs border border-slate-700 active:scale-[0.99] transition-all"
          >
            Done
          </button>
        </div>
      </div>

      {/* ActionSheet Confirmation Dialog */}
      <ActionSheetModal
        isOpen={Boolean(expenseToDelete)}
        title="Delete Expense"
        message={
          expenseToDelete
            ? `Delete expense "${expenseToDelete.title}" (Rs. ${Number(expenseToDelete.amount || 0).toLocaleString()})? This cannot be undone.`
            : ""
        }
        confirmText="Delete Expense"
        cancelText="Cancel"
        isDestructive={true}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
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
  customers = [],
}) {
  const cleanAscii = (str, fallback = "") => {
    if (!str) return fallback;
    const cleaned = String(str).replace(/[^\x20-\x7E]/g, "").trim();
    return (cleaned && /[A-Za-z0-9]/.test(cleaned)) ? cleaned : fallback;
  };

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
  doc.text(cleanAscii(shopName, "Al-Madina General Store"), pageWidth - marginX, 12, { align: "right" });

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
    doc.text(cleanAscii(cat.name, "Other"), marginX + 4, y + 4.2);
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
    doc.text(cleanAscii(item.title, "Expense").slice(0, 48), marginX + 28, y + 4.2);
    doc.text(cleanAscii(item.category, "Other"), marginX + 115, y + 4.2);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(225, 29, 72);
    doc.text(`Rs. ${Number(item.amount || 0).toLocaleString()}`, pageWidth - marginX - 4, y + 4.2, { align: "right" });

    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, y + 5.5, pageWidth - marginX, y + 5.5);
    y += 5.8;
  });

  // -------------------------------------------------------------------------
  // DEDICATED SEPARATE PAGE: PERSONAL EXPENSE & KHATA CREDIT LEDGER
  // -------------------------------------------------------------------------
  doc.addPage();
  y = 14;

  // Header Banner for Ledger Page
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("HisaabLive", marginX, 12);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(245, 158, 11); // Amber
  doc.text("PERSONAL EXPENSE & KHATA CREDIT LEDGER", marginX, 18);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(cleanAscii(shopName, "Al-Madina General Store"), pageWidth - marginX, 12, { align: "right" });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text(`Shop Code: ${(shopCode || "G10").toUpperCase()} • Full Credit & Advance Audit`, pageWidth - marginX, 18, { align: "right" });

  y = 35;

  // Ledger Headline
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Personal Khata Ledger & Advance Payment Summary", marginX, y);

  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Includes all registered customer balances, debt receivables (Baqaya), and advance credit balances.", marginX, y);

  y += 8;

  // Calculate Ledger Statistics
  const totalReceivable = customers.reduce((acc, c) => acc + (c.balance > 0 ? Number(c.balance) : 0), 0);
  const totalAdvancePaid = customers.reduce((acc, c) => acc + (c.balance < 0 ? Math.abs(Number(c.balance)) : 0), 0);
  const netLedger = totalReceivable - totalAdvancePaid;

  // Ledger KPI Cards
  const kpiW = (pageWidth - marginX * 2 - gap * 2) / 3;
  const ledgerKpis = [
    { label: "TOTAL BAQAYA (OWED TO SHOP)", val: `Rs. ${Math.round(totalReceivable).toLocaleString()}`, color: [217, 119, 6] },
    { label: "TOTAL ADVANCE PAYMENTS RECEIVED", val: `+Rs. ${Math.round(totalAdvancePaid).toLocaleString()}`, color: [16, 185, 129] },
    { label: "NET LEDGER BALANCE", val: `Rs. ${Math.round(netLedger).toLocaleString()}`, color: [37, 99, 235] },
  ];

  ledgerKpis.forEach((kpi, idx) => {
    const x = marginX + idx * (kpiW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, kpiW, 16, 2, 2, "FD");

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3.5, y + 5);

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.val, x + 3.5, y + 12);
  });

  y += 22;

  // Customer Ledger Table Section
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`Customer Ledger Accounts (${customers.length} Registered Accounts)`, marginX, y);
  y += 4;

  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(marginX, y, pageWidth - marginX * 2, 6.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Customer Name", marginX + 4, y + 4.2);
  doc.text("Phone Number", marginX + 65, y + 4.2);
  doc.text("Status", marginX + 115, y + 4.2);
  doc.text("Balance / Amount (PKR)", pageWidth - marginX - 4, y + 4.2, { align: "right" });
  y += 6.5;

  if (customers.length === 0) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(148, 163, 184);
    doc.text("No Khata customer accounts registered yet.", marginX + 4, y + 6);
    y += 10;
  } else {
    // Sort by largest balance first
    const sortedCustomers = [...customers].sort((a, b) => (b.balance || 0) - (a.balance || 0));

    sortedCustomers.forEach((cust) => {
      if (y > 270) {
        doc.addPage();
        y = 14;
        // Repeat table header on continuation page
        doc.setFillColor(241, 245, 249);
        doc.rect(marginX, y, pageWidth - marginX * 2, 6.5, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("Customer Name", marginX + 4, y + 4.2);
        doc.text("Phone Number", marginX + 65, y + 4.2);
        doc.text("Status", marginX + 115, y + 4.2);
        doc.text("Balance / Amount (PKR)", pageWidth - marginX - 4, y + 4.2, { align: "right" });
        y += 6.5;
      }

      const balNum = Number(cust.balance || 0);
      const isOwed = balNum > 0;
      const isAdv = balNum < 0;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(cleanAscii(cust.name, "Customer").slice(0, 36), marginX + 4, y + 4.2);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(cust.phone || "-", marginX + 65, y + 4.2);

      // Status Badge
      if (isOwed) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(217, 119, 6); // Amber
        doc.text("Baqaya (Owes)", marginX + 115, y + 4.2);
      } else if (isAdv) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(16, 185, 129); // Emerald
        doc.text("Advance Received", marginX + 115, y + 4.2);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184);
        doc.text("Cleared / Nil", marginX + 115, y + 4.2);
      }

      // Balance Amount
      doc.setFont("helvetica", "bold");
      if (isOwed) {
        doc.setTextColor(217, 119, 6);
        doc.text(`Rs. ${Math.round(balNum).toLocaleString()}`, pageWidth - marginX - 4, y + 4.2, { align: "right" });
      } else if (isAdv) {
        doc.setTextColor(16, 185, 129);
        doc.text(`+Rs. ${Math.round(Math.abs(balNum)).toLocaleString()}`, pageWidth - marginX - 4, y + 4.2, { align: "right" });
      } else {
        doc.setTextColor(100, 116, 139);
        doc.text("Rs. 0", pageWidth - marginX - 4, y + 4.2, { align: "right" });
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(marginX, y + 5.5, pageWidth - marginX, y + 5.5);
      y += 5.8;
    });
  }

  // Multi-page footer across all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("HisaabLive Verified Statement • Powered by AI Surveillance & Tamper Guard", marginX, pageHeight - 8);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 8, { align: "right" });
  }

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
  customers = [],
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
        customers,
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
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center backdrop-blur-md animate-fade-in">
      <div
        id="printable-statement"
        className="bg-slate-card w-full max-w-lg max-h-[92vh] rounded-t-3xl flex flex-col overflow-hidden shadow-2xl border-t border-x border-slate-border animate-slide-up pb-safe"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-border no-print">
          <div className="w-10 h-1 rounded-full bg-slate-700/60 mx-auto mb-3" />
          <div className="flex justify-between items-center">
            <div>
              <h3 className="m-0 text-base font-bold text-slate-100">Monthly Statement</h3>
              <p className="m-0 text-xs text-slate-400 mt-0.5">
                Month: <b className="text-sky-cyan">{ym}</b> • {shop ? shop.shop_name : "Al-Madina Store"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold flex items-center justify-center text-sm hover:bg-slate-700 active:scale-95 transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Action Download & Print Bar */}
          <div className="flex gap-2.5 mb-4 no-print">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadPdf}
              className="flex-1 py-2.5 px-4 rounded-xl bg-sky-cyan text-slate-950 hover:bg-sky-cyan/90 font-black text-xs shadow-md shadow-sky-cyan/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{downloading ? "⏳ Generating..." : "📥 Download PDF Statement"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="py-2.5 px-4 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <span>🖨️ Print</span>
            </button>
          </div>

          {/* 4 Financial KPI Summary Cards */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                Total Sale
              </div>
              <div className="text-lg font-black text-emerald-mint mt-1">
                Rs. {Math.round(totalSale).toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
              <div className="text-[11px] font-bold text-rose-crimson uppercase tracking-wide">
                Total Kharcha
              </div>
              <div className="text-lg font-black text-rose-crimson mt-1">
                Rs. {Math.round(totalExpense).toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
              <div className="text-[11px] font-bold text-emerald-mint uppercase tracking-wide">
                Net Profit (Munafa)
              </div>
              <div className={`text-lg font-black mt-1 ${netProfit >= 0 ? "text-emerald-mint" : "text-rose-crimson"}`}>
                Rs. {Math.round(netProfit).toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/60">
              <div className="text-[11px] font-bold text-sky-cyan uppercase tracking-wide">
                Profit Margin
              </div>
              <div className="text-lg font-black text-sky-cyan mt-1">
                {margin}%
              </div>
            </div>
          </div>

          {/* Category Breakdown with Progress Bars */}
          <div className="mb-5">
            <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-2.5">
              Monthly Expense Categories
            </div>
            <div className="flex flex-col gap-2">
              {catBreakdown
                .filter((c) => c.total > 0)
                .map((cat) => {
                  const pct = totalExpense > 0 ? Math.round((cat.total / totalExpense) * 100) : 0;
                  const isSelected = selectedCat === cat.name;
                  return (
                    <div
                      key={cat.name}
                      onClick={() => setSelectedCat(isSelected ? "All" : cat.name)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-slate-800/80 border-sky-cyan shadow-sm"
                          : "bg-slate-800/40 border-slate-700/50 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold flex items-center gap-1.5 text-slate-200">
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                          <span className="text-[11px] text-slate-400">({cat.count} txns)</span>
                        </span>
                        <span className="text-xs font-black text-slate-100">
                          Rs. {cat.total.toLocaleString()} <small className="text-slate-400 font-normal">({pct}%)</small>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: cat.color }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Itemized Expenses List */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                Monthly Expenses ({filteredItems.length}) {selectedCat !== "All" && `• ${selectedCat}`}
              </div>
              {selectedCat !== "All" && (
                <button
                  type="button"
                  onClick={() => setSelectedCat("All")}
                  className="text-xs font-bold text-sky-cyan hover:underline p-0"
                >
                  Show All
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {filteredItems.map((item) => {
                const catInfo = CATS.find((c) => c.name === item.category) || { icon: "📦", color: "#64748b" };
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 flex justify-between items-center hover:border-slate-600 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-sm flex-shrink-0">
                        {catInfo.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-100 truncate">{item.title}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.date} • {item.category}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs font-black text-rose-crimson flex-shrink-0">
                      Rs. {Number(item.amount).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-border bg-slate-850 no-print">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs border border-slate-700 active:scale-[0.99] transition-all"
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
    <div className="rounded-2xl bg-slate-card border border-slate-border p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h4 className="m-0 text-sm font-bold text-slate-100">+ Add Kharcha (Expense)</h4>
        <span className="text-[11px] text-slate-400 font-semibold px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700">Quick Entry</span>
      </div>

      {err && <div className="text-rose-crimson text-xs mb-2 font-semibold">⚠️ {err}</div>}
      {success && <div className="text-emerald-mint text-xs mb-2 font-bold">✓ Kharcha saved successfully!</div>}

      <form onSubmit={save}>
        <input
          placeholder="Title (e.g. Bijli Bill, Petrol, Staff Lunch)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-sky-cyan focus:ring-1 focus:ring-sky-cyan text-sm text-slate-100 placeholder-slate-500 outline-none mb-2.5 transition-all"
        />

        <div className="grid grid-cols-[1fr_1.3fr] gap-2.5 mb-3">
          <input
            placeholder="Amount (Rs.)"
            type="number"
            min="1"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-sky-cyan focus:ring-1 focus:ring-sky-cyan text-sm font-bold text-slate-100 placeholder-slate-500 outline-none transition-all"
          />

          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-sky-cyan focus:ring-1 focus:ring-sky-cyan text-xs font-semibold text-slate-200 outline-none cursor-pointer transition-all"
          >
            {CATS.map((c) => (
              <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        <button
          disabled={busy}
          type="submit"
          className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-rose-crimson to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold text-sm shadow-md shadow-rose-crimson/20 active:scale-[0.99] transition-all flex items-center justify-center disabled:opacity-50"
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
  const totalAdvance = activeCustomers.reduce((a, c) => a + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
  const netKhataBalance = activeCustomers.reduce((a, c) => a + (Number(c.balance) || 0), 0);
  const q = search.trim().toLowerCase();
  const list = activeCustomers
    .filter((c) => !q || (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q))
    .sort((a, b) => (b.balance || 0) - (a.balance || 0));

  return (
    <div>
      {/* Khata Hero Card with Baqaya & Advance Totals */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-800 border border-amber-warm/30 p-5 text-white mb-4 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-amber-warm/10 blur-3xl pointer-events-none -mr-8 -mt-8" />
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-warm/90">
              Total Khata to Receive (Baqaya)
            </div>
            <div className="text-3xl font-black text-amber-warm my-1.5 tracking-tight">
              Rs. {Math.round(receivable).toLocaleString("en-US")}
            </div>
          </div>
          {totalAdvance > 0 && (
            <div className="text-right bg-emerald-mint/10 border border-emerald-mint/30 rounded-xl px-3 py-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-mint">
                Advance Received (+)
              </div>
              <div className="text-base font-black text-emerald-mint">
                +Rs. {Math.round(totalAdvance).toLocaleString("en-US")}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between items-center text-xs text-slate-400 mt-1 pt-2 border-t border-slate-700/50">
          <span>{activeCustomers.length} registered customers</span>
          {totalAdvance > 0 && (
            <span className="font-semibold text-slate-300">
              Net Balance: <strong className={netKhataBalance >= 0 ? "text-amber-warm" : "text-emerald-mint"}>Rs. {Math.round(netKhataBalance).toLocaleString("en-US")}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Clean Search Bar */}
      <div className="relative mb-3">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
        <input
          placeholder={t.search || "Search customer by name or phone..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-slate-card border border-slate-border focus:border-sky-cyan rounded-xl text-sm text-slate-100 placeholder-slate-400 outline-none shadow-sm transition-all"
        />
      </div>

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
          type="button"
          onClick={() => setAdding(true)}
          className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-sky-cyan to-blue-500 hover:from-sky-cyan/90 hover:to-blue-600 text-slate-950 font-black text-sm shadow-md shadow-sky-cyan/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 mb-4"
        >
          <span>+</span>
          <span>{t.add_customer || "Add New Customer to Khata"}</span>
        </button>
      )}

      {/* Customer List */}
      <div className="flex flex-col gap-2">
        {list.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="rounded-2xl bg-slate-card border border-slate-border hover:border-slate-700 p-3.5 flex justify-between items-center cursor-pointer shadow-sm active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${
                  c.balance > 0
                    ? "bg-amber-warm/15 text-amber-warm border border-amber-warm/30"
                    : c.balance < 0
                    ? "bg-emerald-mint/15 text-emerald-mint border border-emerald-mint/30"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {(c.name || "U")[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-slate-100 truncate">{c.name}</div>
                {c.phone && <div className="text-xs text-slate-400 mt-0.5">{c.phone}</div>}
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <div
                className={`font-black text-base ${
                  c.balance > 0
                    ? "text-amber-warm"
                    : c.balance < 0
                    ? "text-emerald-mint"
                    : "text-slate-400"
                }`}
              >
                Rs. {Math.abs(c.balance || 0).toLocaleString()}
              </div>
              <div
                className={`text-[11px] font-bold ${
                  c.balance > 0
                    ? "text-amber-warm"
                    : c.balance < 0
                    ? "text-emerald-mint"
                    : "text-slate-400"
                }`}
              >
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
    <div className="rounded-2xl bg-slate-card border border-sky-cyan/40 p-4 mb-4 shadow-sm">
      <h4 className="m-0 mb-3 text-sm font-bold text-slate-100">+ Add Khata Customer</h4>
      <input
        placeholder="Customer Full Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-sky-cyan text-sm text-slate-100 placeholder-slate-500 outline-none mb-2.5"
      />
      <input
        placeholder="Phone Number (e.g. 0300-1234567)"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-sky-cyan text-sm text-slate-100 placeholder-slate-500 outline-none mb-3"
      />
      {err && <p className="text-rose-crimson text-xs mb-2.5">{err}</p>}
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="flex-1 py-2.5 px-4 rounded-xl bg-sky-cyan text-slate-950 font-bold text-xs hover:bg-sky-cyan/90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save Customer"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-700 active:scale-[0.98] transition-all"
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
  const [showDeleteCustSheet, setShowDeleteCustSheet] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);

  useEffect(() => {
    if (isDemo) return;
    const q = query(collection(db, "shops", shopId, "khata_customers", customer.id, "entries"), orderBy("created_at", "desc"), limit(50));
    return onSnapshot(q, (s) => setEntries(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
  }, [shopId, customer.id, isDemo]);

  const activeEntries = isDemo ? demoEntries : entries;

  const confirmDeleteCustomer = async () => {
    setShowDeleteCustSheet(false);
    setDeletingCust(true);
    try {
      if (isDemo) {
        onDeleteCustomer(customer.id);
      } else {
        try {
          await call("khataDeleteCustomer", { customerId: customer.id });
        } catch (cfErr) {
          console.warn("Cloud function khataDeleteCustomer failed, falling back to direct delete:", cfErr);
          await deleteDoc(doc(db, "shops", shopId, "khata_customers", customer.id));
        }
        onBack();
      }
    } catch (e) {
      alert("Failed to delete customer: " + (e.message || e));
    } finally {
      setDeletingCust(false);
    }
  };

  const confirmDeleteEntry = async () => {
    if (!entryToDelete) return;
    const entry = entryToDelete;
    setEntryToDelete(null);
    setDeletingEntryId(entry.id);
    try {
      if (isDemo) {
        const revAmount = entry.type === "udhaar" ? -(Number(entry.amount) || 0) : Number(entry.amount) || 0;
        const newBal = (customer.balance || 0) + revAmount;
        onDeleteDemoEntry(entry.id, newBal);
      } else {
        try {
          await call("khataDeleteEntry", { customerId: customer.id, entryId: entry.id });
        } catch (cfErr) {
          console.warn("Cloud function khataDeleteEntry failed, falling back to direct delete:", cfErr);
          await deleteDoc(doc(db, "shops", shopId, "khata_customers", customer.id, "entries", entry.id));
        }
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
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sky-cyan font-bold text-sm mb-3.5 hover:underline active:scale-98 transition-all"
      >
        <span>&larr;</span> Back to Customers
      </button>

      {/* Customer Header Info */}
      <div className="rounded-2xl bg-slate-card border border-slate-border p-4 sm:p-5 mb-4 shadow-sm">
        <div className="flex justify-between items-start gap-3">
          <div>
            <div className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">{customer.name}</div>
            {customer.phone && <div className="text-xs text-slate-400 mt-0.5">{customer.phone}</div>}
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteCustSheet(true)}
            disabled={deletingCust}
            title="Delete Customer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-crimson/10 border border-rose-crimson/25 text-rose-crimson text-xs font-bold hover:bg-rose-crimson/20 active:scale-95 transition-all disabled:opacity-50"
          >
            🗑️ {deletingCust ? "Deleting..." : "Delete Customer"}
          </button>
        </div>
        <div className="mt-3.5 flex items-baseline gap-2.5">
          <span
            className={`text-2xl sm:text-3xl font-black tracking-tight ${
              bal > 0 ? "text-amber-warm" : bal < 0 ? "text-emerald-mint" : "text-slate-400"
            }`}
          >
            Rs. {Math.abs(bal).toLocaleString()}
          </span>
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
              bal > 0
                ? "bg-amber-warm/15 text-amber-warm border-amber-warm/30"
                : bal < 0
                ? "bg-emerald-mint/15 text-emerald-mint border-emerald-mint/30"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {bal > 0 ? "Baqaya / Owes" : bal < 0 ? "Advance" : "Cleared"}
          </span>
        </div>
      </div>

      {/* Add Entry Card */}
      <div className="rounded-2xl bg-slate-card border border-slate-border p-4 sm:p-5 mb-4 shadow-sm">
        <div className="flex gap-2.5 mb-3.5">
          <button
            type="button"
            onClick={() => setType("udhaar")}
            className={`flex-1 py-3 px-3 rounded-xl font-black text-sm tracking-wide transition-all active:scale-[0.98] ${
              type === "udhaar"
                ? "bg-amber-warm text-slate-950 shadow-sm"
                : "bg-slate-900/60 text-slate-400 border border-slate-700/60 hover:text-slate-200"
            }`}
          >
            Udhaar Diya (+)
          </button>
          <button
            type="button"
            onClick={() => setType("payment")}
            className={`flex-1 py-3 px-3 rounded-xl font-black text-sm tracking-wide transition-all active:scale-[0.98] ${
              type === "payment"
                ? "bg-emerald-mint text-slate-950 shadow-sm"
                : "bg-slate-900/60 text-slate-400 border border-slate-700/60 hover:text-slate-200"
            }`}
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
          className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-sky-cyan text-base font-bold text-slate-100 placeholder-slate-500 outline-none mb-2.5"
        />
        <input
          placeholder="Note (e.g. 5kg Rice, Flour sack, Cash received)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-sky-cyan text-sm text-slate-100 placeholder-slate-500 outline-none mb-3"
        />
        {err && <p className="text-rose-crimson text-xs mb-2.5 font-medium">{err}</p>}
        
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-sky-cyan hover:bg-sky-cyan/90 text-slate-950 font-black text-sm tracking-wide transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
        >
          {busy ? "Recording Entry..." : "Save Entry"}
        </button>
      </div>

      {/* Transaction History */}
      <div className="rounded-2xl bg-slate-card border border-slate-border p-4 sm:p-5 shadow-sm">
        <h4 className="m-0 mb-3 text-sm font-bold text-slate-100">Ledger History</h4>
        {activeEntries.length === 0 && (
          <p className="text-slate-500 text-center py-6 text-xs">No entries yet.</p>
        )}
        {activeEntries.map((e) => (
          <div
            key={e.id}
            className="flex justify-between items-center py-2.5 border-b border-slate-800/80 last:border-0"
          >
            <div>
              <div className="text-sm font-bold text-slate-200">
                {e.note || (e.type === "udhaar" ? "Udhaar" : "Payment")}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{e.date}</div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`font-black text-sm ${
                  e.type === "udhaar" ? "text-amber-warm" : "text-emerald-mint"
                }`}
              >
                {e.type === "udhaar" ? "+" : "-"}Rs. {Number(e.amount).toLocaleString()}
              </div>
              <button
                type="button"
                disabled={deletingEntryId === e.id}
                onClick={() => setEntryToDelete(e)}
                title="Delete Entry"
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-crimson/10 border border-rose-crimson/25 text-rose-crimson hover:bg-rose-crimson/20 active:scale-95 transition-all text-xs disabled:opacity-40"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Action Sheets for Confirmations */}
      <ActionSheetModal
        isOpen={showDeleteCustSheet}
        title={`Delete Customer "${customer.name}"?`}
        message="This will permanently delete this customer and all their transaction history. This action cannot be undone."
        confirmText={deletingCust ? "Deleting..." : "Delete Customer"}
        cancelText="Cancel"
        isDestructive={true}
        icon="🗑️"
        onConfirm={confirmDeleteCustomer}
        onClose={() => setShowDeleteCustSheet(false)}
      />

      <ActionSheetModal
        isOpen={Boolean(entryToDelete)}
        title={entryToDelete ? `Delete ${entryToDelete.type === "udhaar" ? "Udhaar" : "Payment"} Entry?` : ""}
        message={
          entryToDelete
            ? `Delete this ${entryToDelete.type === "udhaar" ? "Udhaar" : "Payment"} of Rs. ${Number(entryToDelete.amount).toLocaleString()}? Balance will be adjusted automatically.`
            : ""
        }
        confirmText="Delete Entry"
        cancelText="Cancel"
        isDestructive={true}
        icon="🗑️"
        onConfirm={confirmDeleteEntry}
        onClose={() => setEntryToDelete(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Alerts View
// ---------------------------------------------------------------------------
function Alerts({ alerts, t, T, isDemo, setDemoAlerts, shopId }) {
  const [busy, setBusy] = useState(false);
  const unseen = alerts.filter((a) => !a.seen);

  const markSeen = async () => {
    setBusy(true);
    if (isDemo) {
      setTimeout(() => {
        if (setDemoAlerts) setDemoAlerts((prev) => prev.map((a) => ({ ...a, seen: true })));
        setBusy(false);
      }, 200);
      return;
    }
    try {
      await call("ackAlerts", { ids: unseen.map((a) => a.id) });
    } catch (e) {
      console.warn("ackAlerts fallback to direct update:", e);
      if (shopId) {
        await Promise.all(
          unseen.map((a) =>
            updateDoc(doc(db, "shops", shopId, "alerts", a.id), { seen: true, seen_at: new Date().toISOString() }).catch(() => {})
          )
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text }}>
            {t?.alerts_title || "Notifications & Alerts"}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: T.textMuted }}>
            Admin announcements & POS security records
          </p>
        </div>
        {unseen.length > 0 && (
          <button
            disabled={busy}
            onClick={markSeen}
            style={{
              background: T.heroGradient,
              color: "white",
              border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: T.shadowSm,
            }}
          >
            {busy ? "Updating…" : (t?.alerts_mark_seen || "Mark All as Seen")}
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div style={{
          background: T.card, borderRadius: T.radius, padding: 30, textAlign: "center",
          border: `1px solid ${T.border}`, color: T.textMuted,
        }}>
          🛡️ No suspicious activity or announcements found. All clear!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map((a) => {
            const isAdminNotif = a.type === "admin_notification";
            const isUrgent = a.severity === "high";
            const isWarning = a.severity === "medium";

            const accentColor = isAdminNotif
              ? (isUrgent ? (T.danger || T.primary) : isWarning ? T.warn : (T.purple || "#8b5cf6"))
              : (isUrgent ? T.primary : T.warn);

            const bgColor = a.seen
              ? T.card
              : isAdminNotif
              ? (isUrgent ? (T.primaryLight || "rgba(244,63,94,0.12)") : isWarning ? "rgba(245,158,11,0.12)" : (T.purpleLight || "rgba(139,92,246,0.12)"))
              : T.primaryLight;

            return (
              <div
                key={a.id}
                style={{
                  background: bgColor,
                  borderRadius: T.radius,
                  padding: "16px",
                  borderLeft: `5px solid ${accentColor}`,
                  border: `1px solid ${T.border}`,
                  boxShadow: T.shadowSm,
                  opacity: a.seen ? 0.78 : 1,
                  transition: "all 0.2s ease",
                }}
              >
                {/* Header row: badge and timestamp */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: accentColor,
                      letterSpacing: 0.3,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {isAdminNotif ? (
                      isUrgent ? "🚨 URGENT ANNOUNCEMENT" :
                      isWarning ? "⚠️ IMPORTANT NOTICE" :
                      "📢 ADMIN ANNOUNCEMENT"
                    ) : (
                      isUrgent ? "🚨 HIGH SEVERITY ALERT" : "⚠️ CHECK REQUIRED"
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>
                    {a.day || (a.created_at ? a.created_at.slice(0, 10) : "")}
                  </span>
                </div>

                {/* Admin Notification Title */}
                {isAdminNotif && a.title && (
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 5, lineHeight: 1.3 }}>
                    {a.title}
                  </div>
                )}

                {/* Message Body */}
                <div style={{ fontSize: 13, fontWeight: isAdminNotif ? 500 : 700, color: T.text, lineHeight: 1.5 }}>
                  {a.message_en || a.message_roman}
                </div>

                {/* Financial Discrepancy for POS alerts */}
                {a.amount > 0 && (
                  <div style={{ fontSize: 14, fontWeight: 900, color: T.primary, marginTop: 8 }}>
                    Discrepancy: Rs. {Math.round(a.amount).toLocaleString("en-US")}
                  </div>
                )}

                {/* Sender footer */}
                {isAdminNotif && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${T.border}` }}>
                    <span style={{ fontSize: 10, color: T.textMuted }}>
                      HisaabLive System Administrator
                    </span>
                    {!a.seen && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>
                        ● Unread
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Notify({ shop, t, T, isDemo }) {
  const [perm, setPerm] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied"
  );

  if (isDemo || typeof window === "undefined" || !("Notification" in window)) return null;

  const enable = async () => {
    try {
      const res = await Notification.requestPermission();
      setPerm(res);
    } catch (e) {
      console.warn("Notification permission error:", e);
    }
  };

  if (perm === "granted") return null;

  return (
    <div style={{ marginTop: 16, marginBottom: 8, textAlign: "center", fontSize: 12 }}>
      {perm === "default" && (
        <button
          onClick={enable}
          style={{
            background: T.cardSecondary,
            color: T.primary,
            border: `1px solid ${T.border}`,
            padding: "8px 16px",
            borderRadius: T.radiusSm,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>🔔</span> Enable Instant Push Notifications
        </button>
      )}
    </div>
  );
}
