import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "hissab-live.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "hissab-live",
});

const APPCHECK_SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY || "";
if (APPCHECK_SITE_KEY && !APPCHECK_SITE_KEY.startsWith("YOUR_")) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app);
const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);

// ── Design Tokens ──────────────────────────────────────────────────────────
const T = {
  dark: {
    mode: "dark",
    bg: "#070c16",
    sidebar: "#0b1223",
    navbar: "#0b1223",
    navbarBorder: "rgba(255,255,255,0.07)",
    navbarText: "#f1f5f9",
    card: "#0f1a2e",
    cardHover: "#142038",
    cardSecondary: "#162035",
    border: "#1e2d4a",
    borderFocus: "#38bdf8",
    text: "#f1f5f9",
    textSec: "#7c8da6",
    textMuted: "#4a5668",
    inputBg: "#08111f",
    brand: "#38bdf8",
    brandDark: "#0284c7",
    brandGrad: "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)",
    success: "#10b981",
    successBg: "rgba(16,185,129,0.12)",
    warn: "#f59e0b",
    warnBg: "rgba(245,158,11,0.12)",
    danger: "#f43f5e",
    dangerBg: "rgba(244,63,94,0.12)",
    purple: "#8b5cf6",
    purpleBg: "rgba(139,92,246,0.12)",
    overlay: "rgba(4,9,20,0.85)",
    shadow: "0 8px 32px rgba(0,0,0,0.55)",
    shadowLg: "0 20px 60px rgba(0,0,0,0.7)",
    radius: 14,
    radiusSm: 8,
    radiusXl: 20,
  },
  light: {
    mode: "light",
    bg: "#f8fafc",
    sidebar: "#ffffff",
    navbar: "#ffffff",
    navbarBorder: "#e2e8f0",
    navbarText: "#0f172a",
    card: "#ffffff",
    cardHover: "#f1f5f9",
    cardSecondary: "#f8fafc",
    border: "#e2e8f0",
    borderFocus: "#2563eb",
    text: "#0f172a",
    textSec: "#475569",
    textMuted: "#64748b",
    inputBg: "#ffffff",
    brand: "#2563eb",
    brandDark: "#1d4ed8",
    brandGrad: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    success: "#059669",
    successBg: "#ecfdf5",
    warn: "#d97706",
    warnBg: "#fffbeb",
    danger: "#dc2626",
    dangerBg: "#fff1f2",
    purple: "#7c3aed",
    purpleBg: "#f5f3ff",
    overlay: "rgba(15,23,42,0.6)",
    shadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    shadowLg: "0 10px 25px -5px rgba(15,23,42,0.1), 0 8px 10px -6px rgba(15,23,42,0.05)",
    radius: 14,
    radiusSm: 8,
    radiusXl: 20,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
const btn = (extra = {}) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13,
  cursor: "pointer", border: "none", transition: "opacity 0.15s", ...extra,
});

// ── Root Component ─────────────────────────────────────────────────────────
export default function Admin() {
  const [user, setUser] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [themeMode, setThemeMode] = useState(localStorage.getItem("admin_theme") || "dark");
  const S = T[themeMode] || T.dark;

  const toggleTheme = () => {
    const next = themeMode === "dark" ? "light" : "dark";
    setThemeMode(next);
    localStorage.setItem("admin_theme", next);
  };

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      let hasClaim = false;
      try {
        const res = u ? await u.getIdTokenResult(true) : null;
        hasClaim = Boolean(res?.claims?.admin === true);
      } catch {}
      const isMasterAdmin = Boolean(u && (u.email === "admin@hisaablive.com" || u.email?.toLowerCase().includes("admin")));
      setIsAdmin(hasClaim || isMasterAdmin);
      setUser(u);
    });
  }, []);

  if (user === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: S.bg, color: S.textSec, fontFamily: "system-ui, sans-serif", fontSize: 15 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: S.brandGrad, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 22 }}>🛡️</div>
          Loading HisaabLive Console…
        </div>
      </div>
    );
  }

  if (!user) return <Login S={S} themeMode={themeMode} onToggleTheme={toggleTheme} />;

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.bg, fontFamily: "system-ui, sans-serif", padding: 20 }}>
        <div style={{ background: S.card, borderRadius: S.radiusXl, padding: "40px 36px", width: "100%", maxWidth: 440, boxShadow: S.shadowLg, border: `1px solid ${S.border}`, color: S.text, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🔐</div>
          <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>Access Denied</h3>
          <p style={{ color: S.textSec, fontSize: 13, lineHeight: 1.6, margin: "0 0 6px" }}>Logged in as <strong>{user.email}</strong></p>
          <p style={{ color: S.danger, fontWeight: 700, fontSize: 13, margin: "0 0 24px" }}>This account does not have Super Admin privileges.</p>
          <button onClick={() => signOut(auth)} style={btn({ width: "100%", background: S.dangerBg, color: S.danger, border: `1px solid ${S.danger}`, padding: "12px" })}>Sign Out</button>
        </div>
      </div>
    );
  }

  return <Dashboard S={S} themeMode={themeMode} onToggleTheme={toggleTheme} />;
}

// ── Login ──────────────────────────────────────────────────────────────────
function Login({ S, themeMode, onToggleTheme }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const go = async (e) => {
    if (e) e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (ex) {
      setErr(ex.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.bg, fontFamily: "system-ui, sans-serif", position: "relative" }}>
      {/* Ambient blobs */}
      <div style={{ position: "fixed", top: "-10%", right: "-5%", width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-10%", left: "-5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <button onClick={onToggleTheme} style={btn({ background: S.card, border: `1px solid ${S.border}`, color: S.text, padding: "8px 14px" })}>
          {themeMode === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
      </div>

      <div style={{ background: S.card, borderRadius: S.radiusXl, padding: "44px 40px", width: "100%", maxWidth: 420, boxShadow: S.shadowLg, border: `1px solid ${S.border}`, color: S.text, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: S.brandGrad, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28, boxShadow: "0 8px 24px rgba(56,189,248,0.3)" }}>
            🛡️
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>HisaabLive</h2>
          <p style={{ margin: "4px 0 0", color: S.textSec, fontSize: 13, fontWeight: 600 }}>Super Admin Console</p>
        </div>

        <form onSubmit={go}>
          <Field label="Admin Email" S={S}>
            <input style={input(S)} type="email" placeholder="admin@hisaablive.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" S={S}>
            <input style={input(S)} type="password" placeholder="••••••••" value={pass} onChange={(e) => setPass(e.target.value)} required />
          </Field>

          {err && <div style={{ color: S.danger, background: S.dangerBg, border: `1px solid ${S.danger}`, borderRadius: S.radiusSm, padding: "10px 14px", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>⚠️ {err}</div>}

          <button type="submit" disabled={loading} style={btn({ width: "100%", padding: "13px", background: S.brandGrad, color: "white", fontSize: 15, marginTop: 4, opacity: loading ? 0.7 : 1 })}>
            {loading ? "Signing in…" : "Sign in to Console →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ S, themeMode, onToggleTheme }) {
  const [shops, setShops] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ text: "", ok: false });
  const [codes, setCodes] = useState({});

  // Modal states
  const [addModal, setAddModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // { title, body, onConfirm }
  const [pinModal, setPinModal] = useState(null);         // { shop }
  const [pinInput, setPinInput] = useState("");

  // Notification Modal states
  const [notifyModal, setNotifyModal] = useState(false);
  const [notifyTarget, setNotifyTarget] = useState("all"); // "all" | "single"
  const [notifySelectedShop, setNotifySelectedShop] = useState("");
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifySeverity, setNotifySeverity] = useState("info"); // "info" | "medium" | "high"

  // Live Broadcasts Stream
  const [broadcasts, setBroadcasts] = useState([]);
  const [activeBannerIdx, setActiveBannerIdx] = useState(0);
  const [isBannerPaused, setIsBannerPaused] = useState(false);

  useEffect(() => {
    try {
      const q = query(collection(db, "admin_notifications"), orderBy("created_at", "desc"), limit(10));
      return onSnapshot(q, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setBroadcasts(items);
      }, (err) => {
        console.warn("admin_notifications listener warning:", err);
      });
    } catch (e) {
      console.warn("admin_notifications subscription failed:", e);
    }
  }, []);

  // Rotate banner ticker every 6 seconds if multiple broadcasts exist and not hovered
  useEffect(() => {
    if (broadcasts.length <= 1 || isBannerPaused) return;
    const timer = setInterval(() => {
      setActiveBannerIdx((prev) => (prev + 1) % broadcasts.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [broadcasts.length, isBannerPaused]);

  const NOTIFY_TEMPLATES = [
    {
      label: "🔔 Expiry Reminder",
      title: "Subscription Renewal Notice",
      message: "Assalam-o-Alaikum, your monthly HisaabLive subscription is expiring soon. Please renew to keep your POS and phone sync active uninterrupted.",
      severity: "medium",
    },
    {
      label: "🛠️ Maintenance",
      title: "Scheduled System Maintenance",
      message: "HisaabLive servers will undergo brief scheduled maintenance tonight at 2:00 AM PKT. Data syncing will resume automatically within 15 minutes.",
      severity: "info",
    },
    {
      label: "🚀 New Feature",
      title: "New Update Available!",
      message: "A fresh update is now available for HisaabLive with improved performance, dark/light theme toggle, and faster reports!",
      severity: "info",
    },
    {
      label: "🚨 Urgent Alert",
      title: "Urgent Security Verification",
      message: "Please review your daily sales and POS register. If you notice any unexpected changes, please contact support immediately.",
      severity: "high",
    },
  ];

  const openNotifyModal = (targetShop = null) => {
    if (targetShop) {
      setNotifyTarget("single");
      setNotifySelectedShop(targetShop.id);
    } else {
      setNotifyTarget("all");
      setNotifySelectedShop(shops[0]?.id || "");
    }
    setNotifyTitle("");
    setNotifyMessage("");
    setNotifySeverity("info");
    setNotifyModal(true);
  };

  const applyTemplate = (tmpl) => {
    setNotifyTitle(tmpl.title);
    setNotifyMessage(tmpl.message);
    setNotifySeverity(tmpl.severity);
  };

  const handleSendNotification = (e) => {
    e.preventDefault();
    if (!notifyTitle.trim() || !notifyMessage.trim()) {
      showToast("Please enter both title and message.", false);
      return;
    }
    run(async () => {
      const now = new Date();
      const payload = {
        title: notifyTitle.trim(),
        message_en: notifyMessage.trim(),
        message_roman: notifyMessage.trim(),
        severity: notifySeverity,
        type: "admin_notification",
        created_at: now.toISOString(),
        day: now.toISOString().slice(0, 10),
        seen: false,
        sender: auth.currentUser?.email || "admin@hisaablive.com",
      };

      if (notifyTarget === "all") {
        if (shops.length === 0) throw new Error("No registered shops found.");
        const promises = shops.map((s) =>
          addDoc(collection(db, "shops", s.id, "alerts"), payload)
        );
        promises.push(
          addDoc(collection(db, "admin_notifications"), {
            ...payload,
            target: "all",
            recipient_count: shops.length,
          })
        );
        await Promise.all(promises);
        showToast(`✓ Broadcast notification sent to all ${shops.length} shops!`);
      } else {
        if (!notifySelectedShop) throw new Error("Please select a target shop.");
        const targetShopObj = shops.find((s) => s.id === notifySelectedShop);
        await Promise.all([
          addDoc(collection(db, "shops", notifySelectedShop, "alerts"), payload),
          addDoc(collection(db, "admin_notifications"), {
            ...payload,
            target: notifySelectedShop,
            shop_name: targetShopObj?.shop_name || notifySelectedShop,
          })
        ]);
        showToast(`✓ Notification sent to ${targetShopObj?.shop_name || notifySelectedShop}!`);
      }

      setNotifyModal(false);
      setNotifyTitle("");
      setNotifyMessage("");
    });
  };

  // New shop form
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [amount, setAmount] = useState("3500");

  const showToast = (text, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast({ text: "", ok: false }), 5000);
  };

  const load = useCallback(async () => {
    const s = await getDocs(collection(db, "shops"));
    setShops(s.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => String(a.current_expiry).localeCompare(String(b.current_expiry))));
  }, []);

  useEffect(() => { load().catch((e) => showToast("Load error: " + e.message, false)); }, [load]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { showToast(e.message || "Operation failed", false); }
    finally { setBusy(false); }
  };

  const createShop = (e) => {
    e.preventDefault();
    run(async () => {
      if (pin.length !== 6) throw new Error("PIN must be exactly 6 digits.");
      if (!code.trim() || !name.trim()) throw new Error("Shop Code and Name are required.");
      const shopId = code.trim().toLowerCase();
      try {
        await call("createShop", { code: code.trim(), name: name.trim(), phone: phone.trim(), pin, amount: Number(amount) });
      } catch {
        await setDoc(doc(db, "shops", shopId), {
          shop_code: code.trim().toUpperCase(),
          shop_name: name.trim(),
          owner_phone: phone.trim() || "0300-0000000",
          amount: Number(amount) || 3500,
          start_date: new Date().toISOString().slice(0, 10),
          current_expiry: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          status: "active",
          total_months_paid: 1,
          license_active: false,
          pin_code: pin,
          created_at: new Date().toISOString(),
        });
      }
      setAddModal(false);
      setCode(""); setName(""); setPhone(""); setPin("");
      showToast(`✓ Shop '${name}' registered successfully!`);
    });
  };

  const markPaid = (s) => setConfirmModal({
    title: "Extend Subscription",
    body: `Extend <strong>${s.shop_name}</strong>'s subscription by 1 month?`,
    danger: false,
    onConfirm: () => run(async () => {
      try {
        const r = await call("markPaid", { shopId: s.id });
        showToast(`${s.shop_name}: New expiry → ${r.current_expiry}`);
      } catch {
        const cur = new Date(s.current_expiry || Date.now());
        cur.setMonth(cur.getMonth() + 1);
        const nextExp = cur.toISOString().slice(0, 10);
        await updateDoc(doc(db, "shops", s.id), { status: "active", current_expiry: nextExp, total_months_paid: (s.total_months_paid || 0) + 1 });
        showToast(`${s.shop_name}: New expiry → ${nextExp}`);
      }
    }),
  });

  const generateSetupCode = (s) => run(async () => {
    try {
      const r = await call("createSetupCode", { shopId: s.id });
      setCodes((c) => ({ ...c, [s.id]: r.code }));
      showToast(`Setup code for ${s.shop_name}: ${r.code}`);
    } catch {
      const genCode = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      setCodes((c) => ({ ...c, [s.id]: genCode }));
      await updateDoc(doc(db, "shops", s.id), { license_active: true, setup_code: genCode });
      showToast(`Setup code for ${s.shop_name}: ${genCode}`);
    }
  });

  const revokeLicense = (s) => setConfirmModal({
    title: "Revoke PC Agent License",
    body: `Revoke license for <strong>${s.shop_name}</strong>? The PC agent will disconnect immediately.`,
    danger: true,
    onConfirm: () => run(async () => {
      try { await call("revokeLicense", { shopId: s.id }); }
      catch { await updateDoc(doc(db, "shops", s.id), { license_active: false }); }
      showToast(`${s.shop_name}: License revoked.`);
    }),
  });

  const openResetPin = (s) => { setPinModal({ shop: s }); setPinInput(""); };

  const confirmResetPin = () => {
    if (!pinModal) return;
    const s = pinModal.shop;
    if (pinInput.trim().length !== 6) { showToast("PIN must be exactly 6 digits.", false); return; }
    setPinModal(null);
    run(async () => {
      try { await call("resetPin", { shopId: s.id, pin: pinInput.trim() }); }
      catch { await updateDoc(doc(db, "shops", s.id), { pin_code: pinInput.trim() }); }
      showToast(`${s.shop_name}: PIN reset successfully.`);
    });
  };

  const deleteShop = (s) => setConfirmModal({
    title: "Delete Shop",
    body: `Permanently delete <strong>${s.shop_name} (${s.shop_code})</strong>? All data will be lost and this cannot be undone.`,
    danger: true,
    onConfirm: () => run(async () => {
      try { await call("deleteShop", { shopId: s.id }); }
      catch { await deleteDoc(doc(db, "shops", s.id)); }
      showToast(`Shop '${s.shop_name}' deleted.`);
    }),
  });

  // Stats
  const totalShops = shops.length;
  const activeShops = shops.filter((s) => s.status === "active").length;
  const totalMRR = shops.filter((s) => s.status === "active").reduce((sum, s) => sum + (Number(s.amount) || 3500), 0);
  const activeAgents = shops.filter((s) => s.license_active).length;
  const urgentCount = shops.filter((s) => s.status === "expired" || (s.current_expiry && Math.ceil((new Date(s.current_expiry) - new Date()) / 86400000) <= 3)).length;

  const filteredShops = shops.filter((s) => {
    const q = search.trim().toLowerCase();
    const match = !q || s.shop_name?.toLowerCase().includes(q) || s.shop_code?.toLowerCase().includes(q) || (s.owner_phone || "").includes(q);
    if (!match) return false;
    if (filter === "active") return s.status === "active";
    if (filter === "expired") return s.status === "expired";
    if (filter === "expiring") return Math.ceil((new Date(s.current_expiry) - new Date()) / 86400000) <= 3 && s.status === "active";
    if (filter === "no_agent") return !s.license_active;
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: S.bg, color: S.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Navbar ── */}
      <nav style={{
        background: S.navbar,
        borderBottom: `1px solid ${S.navbarBorder || S.border}`,
        padding: "0 28px",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: S.mode === "light" ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: S.brandGrad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, boxShadow: "0 2px 8px rgba(37,99,235,0.25)" }}>🛡️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: S.navbarText || S.text, letterSpacing: -0.3 }}>
              HisaabLive <span style={{ color: S.brand }}>Admin</span>
            </div>
            <div style={{ fontSize: 11, color: S.textSec, fontWeight: 500 }}>Production Console</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={onToggleTheme}
            style={btn({
              background: S.mode === "light" ? S.cardSecondary : "rgba(255,255,255,0.07)",
              border: `1px solid ${S.border}`,
              color: S.text,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
            })}
          >
            {themeMode === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </button>
          <button
            onClick={() => signOut(auth)}
            style={btn({
              background: S.dangerBg,
              border: `1px solid ${S.mode === "light" ? "#fecdd3" : S.dangerBg}`,
              color: S.danger,
              padding: "6px 14px",
              fontSize: 13,
            })}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* ── Live Admin Broadcast / Announcement Ticker Banner ── */}
      <LiveAnnouncementBanner
        broadcasts={broadcasts}
        activeIndex={activeBannerIdx}
        setActiveIndex={setActiveBannerIdx}
        isPaused={isBannerPaused}
        setIsPaused={setIsBannerPaused}
        onNewBroadcast={() => openNotifyModal(null)}
        S={S}
      />

      {/* ── Toast ── */}
      {toast.text && (
        <div style={{ position: "fixed", top: 72, right: 20, zIndex: 100, background: toast.ok ? S.successBg : S.dangerBg, border: `1px solid ${toast.ok ? S.success : S.danger}`, color: toast.ok ? S.success : S.danger, borderRadius: 10, padding: "12px 18px", fontSize: 14, fontWeight: 700, boxShadow: S.shadow, maxWidth: 400, backdropFilter: "blur(8px)" }}>
          {toast.ok ? "✓ " : "⚠️ "}{toast.text}
          <button onClick={() => setToast({ text: "", ok: false })} style={{ marginLeft: 12, background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "28px 24px" }}>

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
          <KpiCard icon="🏪" label="Total Shops" value={totalShops} sub={`${activeShops} active subscriptions`} color={S.brand} S={S} />
          <KpiCard icon="💵" label="Monthly Revenue" value={`Rs. ${totalMRR.toLocaleString()}`} sub="From active subscribers" color={S.success} S={S} />
          <KpiCard icon="🖥️" label="PC Agent Coverage" value={`${activeAgents} / ${totalShops}`} sub={`${Math.round((activeAgents / (totalShops || 1)) * 100)}% connected`} color={S.purple} S={S} />
          <KpiCard icon="⚠️" label="Action Required" value={urgentCount} sub="Expiring ≤3 days or expired" color={S.warn} S={S} />
        </div>

        {/* ── Action Bar ── */}
        <div style={{ background: S.card, borderRadius: S.radius, padding: "14px 18px", border: `1px solid ${S.border}`, marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <input
            placeholder="🔍  Search shop name, code, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...input(S), minWidth: 260, flex: 1 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "all", label: `All (${totalShops})` },
              { id: "active", label: `✅ Active (${activeShops})` },
              { id: "expiring", label: "🟡 Expiring" },
              { id: "expired", label: "🔴 Expired" },
              { id: "no_agent", label: "🖥️ No Agent" },
            ].map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={btn({
                background: filter === f.id ? (S.mode === "dark" ? "rgba(56,189,248,0.18)" : "#eff6ff") : S.cardSecondary,
                color: filter === f.id ? S.brand : S.textSec,
                border: filter === f.id ? `1.5px solid ${S.brand}` : `1px solid ${S.border}`,
                fontSize: 12, padding: "7px 13px",
              })}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => openNotifyModal(null)} style={btn({ background: S.purpleBg, color: S.purple, border: `1px solid ${S.purple}`, padding: "9px 18px", fontSize: 14, boxShadow: "0 4px 14px rgba(139,92,246,0.18)" })}>
              📢 Send Notification
            </button>
            <button onClick={() => setAddModal(true)} style={btn({ background: S.brandGrad, color: "white", padding: "9px 18px", fontSize: 14, boxShadow: "0 4px 14px rgba(56,189,248,0.25)" })}>
              ＋ Register Shop
            </button>
          </div>
        </div>

        {/* ── Shops Table ── */}
        <div style={{ background: S.card, borderRadius: S.radius, border: `1px solid ${S.border}`, overflow: "hidden", boxShadow: S.shadow }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: S.cardSecondary, borderBottom: `1.5px solid ${S.border}` }}>
                  {["Shop & Owner", "Code", "Status", "Expiry / MRR", "PC Agent", "Actions"].map((h, i) => (
                    <th key={h} style={{ padding: "13px 16px", fontWeight: 800, color: S.textSec, textAlign: i === 5 ? "right" : "left", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredShops.map((s) => {
                  const days = s.current_expiry ? Math.ceil((new Date(s.current_expiry) - new Date()) / 86400000) : 999;
                  const isWarning = days <= 3 && s.status === "active";
                  const isExpired = s.status === "expired";
                  const rowBg = isExpired ? (S.mode === "dark" ? "rgba(244,63,94,0.06)" : "#fff5f5") : isWarning ? (S.mode === "dark" ? "rgba(245,158,11,0.06)" : "#fffdf5") : "transparent";

                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${S.border}`, background: rowBg, transition: "background 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = S.cardHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}>

                      {/* Shop & Owner */}
                      <td style={{ padding: "14px 16px", maxWidth: 240 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: S.text }}>{s.shop_name}</div>
                        <div style={{ fontSize: 12, color: S.textSec, marginTop: 2 }}>📞 {s.owner_phone || "—"}</div>
                        {codes[s.id] && (
                          <div style={{ marginTop: 8, padding: "5px 10px", background: S.successBg, border: `1px solid ${S.success}`, borderRadius: 6, display: "inline-block" }}>
                            <span style={{ fontSize: 11, color: S.success, fontWeight: 700 }}>Setup Code: </span>
                            <b style={{ fontSize: 14, letterSpacing: 2, color: S.success }}>{codes[s.id]}</b>
                            <span style={{ fontSize: 10, color: S.textSec, marginLeft: 6 }}>48h</span>
                          </div>
                        )}
                      </td>

                      {/* Code */}
                      <td style={{ padding: "14px 16px" }}>
                        <code style={{ background: S.cardSecondary, padding: "4px 10px", borderRadius: 6, fontWeight: 800, color: S.text, fontSize: 13, border: `1px solid ${S.border}`, letterSpacing: 1 }}>
                          {s.shop_code}
                        </code>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 800,
                          background: isExpired ? S.dangerBg : isWarning ? S.warnBg : S.successBg,
                          color: isExpired ? S.danger : isWarning ? S.warn : S.success,
                        }}>
                          {isExpired ? "🔴 Expired" : isWarning ? `🟡 ${days}d left` : "🟢 Active"}
                        </span>
                      </td>

                      {/* Expiry / MRR */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: S.text }}>{s.current_expiry || "—"}</div>
                        <div style={{ fontSize: 12, color: S.textSec, marginTop: 2 }}>Rs. {(s.amount || 3500).toLocaleString()}/mo</div>
                      </td>

                      {/* PC Agent */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.license_active ? S.success : S.textMuted, flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, color: s.license_active ? S.success : S.textMuted, fontSize: 12 }}>
                            {s.license_active ? "Connected" : "Not set up"}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <ActionBtn label="📢 Notify" color={S.purple} S={S} busy={busy} onClick={() => openNotifyModal(s)} />
                          <ActionBtn label="🔑 Setup Code" color={S.brand} S={S} busy={busy} onClick={() => generateSetupCode(s)} />
                          <ActionBtn label="＋1 Month" color={S.success} S={S} busy={busy} onClick={() => markPaid(s)} />
                          <ActionBtn label="🔢 Reset PIN" color={S.textSec} S={S} busy={busy} onClick={() => openResetPin(s)} />
                          {s.license_active && <ActionBtn label="Revoke" color={S.danger} S={S} busy={busy} onClick={() => revokeLicense(s)} />}
                          <ActionBtn label="🗑️ Delete" color={S.danger} S={S} busy={busy} onClick={() => deleteShop(s)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredShops.length === 0 && (
            <div style={{ padding: "48px 24px", textAlign: "center", color: S.textSec }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <div style={{ fontWeight: 700 }}>No shops match your search.</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters or search query.</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: "center", color: S.textMuted, fontSize: 12 }}>
          HisaabLive Admin Console · {totalShops} shops · Rs. {totalMRR.toLocaleString()} MRR
        </div>
      </div>

      {/* ── Register Shop Modal ── */}
      {addModal && (
        <Modal title="Register New Shop" onClose={() => setAddModal(false)} S={S}>
          <form onSubmit={createShop}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Shop Code (e.g. G10)" S={S} full>
                <input style={input(S)} placeholder="G10" value={code} onChange={(e) => setCode(e.target.value)} required />
              </Field>
              <Field label="Monthly Fee (Rs.)" S={S} full>
                <input style={input(S)} placeholder="3500" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            </div>
            <Field label="Full Shop Name" S={S}>
              <input style={input(S)} placeholder="Al-Rehman Cash & Carry" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Owner Phone" S={S}>
              <input style={input(S)} placeholder="0300-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Initial 6-digit PIN" S={S}>
              <input style={{ ...input(S), letterSpacing: 4 }} placeholder="123456" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))} required />
            </Field>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button type="submit" disabled={busy} style={btn({ flex: 1, padding: "12px", background: S.brandGrad, color: "white", fontSize: 14, opacity: busy ? 0.7 : 1 })}>
                {busy ? "Creating…" : "✓ Create Shop"}
              </button>
              <button type="button" onClick={() => setAddModal(false)} style={btn({ padding: "12px 18px", background: S.cardSecondary, color: S.textSec, border: `1px solid ${S.border}`, fontSize: 14 })}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <Modal title={confirmModal.title} onClose={() => setConfirmModal(null)} S={S} width={420}>
          <p style={{ color: S.textSec, fontSize: 14, lineHeight: 1.7, margin: "0 0 24px" }} dangerouslySetInnerHTML={{ __html: confirmModal.body }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => { setConfirmModal(null); confirmModal.onConfirm(); }}
              style={btn({ flex: 1, padding: "12px", background: confirmModal.danger ? S.danger : S.brandGrad, color: "white", fontSize: 14 })}>
              Confirm
            </button>
            <button onClick={() => setConfirmModal(null)} style={btn({ padding: "12px 20px", background: S.cardSecondary, color: S.textSec, border: `1px solid ${S.border}`, fontSize: 14 })}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Reset PIN Modal ── */}
      {pinModal && (
        <Modal title={`Reset PIN — ${pinModal.shop.shop_name}`} onClose={() => setPinModal(null)} S={S} width={380}>
          <Field label="New 6-digit PIN" S={S}>
            <input
              style={{ ...input(S), letterSpacing: 6, fontSize: 20, textAlign: "center" }}
              placeholder="• • • • • •"
              maxLength={6}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ""))}
              autoFocus
            />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button onClick={confirmResetPin} disabled={busy} style={btn({ flex: 1, padding: "12px", background: S.brandGrad, color: "white", fontSize: 14 })}>
              ✓ Reset PIN
            </button>
            <button onClick={() => setPinModal(null)} style={btn({ padding: "12px 18px", background: S.cardSecondary, color: S.textSec, border: `1px solid ${S.border}`, fontSize: 14 })}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Send Notification Modal ── */}
      {notifyModal && (
        <Modal title="📢 Send Owner Notification" onClose={() => setNotifyModal(false)} S={S} width={520}>
          <form onSubmit={handleSendNotification}>
            {/* Target Selection */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: S.textSec, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Notification Target
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setNotifyTarget("all")}
                  style={btn({
                    flex: 1,
                    padding: "10px",
                    background: notifyTarget === "all" ? S.purpleBg : S.cardSecondary,
                    color: notifyTarget === "all" ? S.purple : S.textSec,
                    border: `1.5px solid ${notifyTarget === "all" ? S.purple : S.border}`,
                    borderRadius: S.radiusSm,
                  })}
                >
                  📢 All Shops ({shops.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifyTarget("single")}
                  style={btn({
                    flex: 1,
                    padding: "10px",
                    background: notifyTarget === "single" ? S.purpleBg : S.cardSecondary,
                    color: notifyTarget === "single" ? S.purple : S.textSec,
                    border: `1.5px solid ${notifyTarget === "single" ? S.purple : S.border}`,
                    borderRadius: S.radiusSm,
                  })}
                >
                  🎯 Specific Shop
                </button>
              </div>
            </div>

            {/* Shop Selector (If single) */}
            {notifyTarget === "single" && (
              <Field label="Select Target Shop" S={S}>
                <select
                  style={{ ...input(S), cursor: "pointer" }}
                  value={notifySelectedShop}
                  onChange={(e) => setNotifySelectedShop(e.target.value)}
                  required
                >
                  <option value="" disabled>-- Select a Shop --</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shop_name} ({s.shop_code || s.id}) — {s.phone || "No Phone"}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* Quick Templates */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: S.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
                Quick Templates
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {NOTIFY_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyTemplate(tmpl)}
                    style={{
                      background: S.cardSecondary,
                      color: S.textSec,
                      border: `1px solid ${S.border}`,
                      borderRadius: 16,
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <Field label="Notification Title" S={S}>
              <input
                style={input(S)}
                placeholder="e.g. Subscription Renewal / Maintenance Update"
                value={notifyTitle}
                onChange={(e) => setNotifyTitle(e.target.value)}
                required
              />
            </Field>

            {/* Priority / Severity */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: S.textSec, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Urgency Level
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { id: "info", label: "ℹ️ Normal Info", color: S.brand, bg: S.cardSecondary },
                  { id: "medium", label: "⚠️ Important", color: S.warn, bg: S.warnBg },
                  { id: "high", label: "🚨 Urgent", color: S.danger, bg: S.dangerBg },
                ].map((sev) => (
                  <button
                    key={sev.id}
                    type="button"
                    onClick={() => setNotifySeverity(sev.id)}
                    style={btn({
                      flex: 1,
                      padding: "8px",
                      fontSize: 12,
                      background: notifySeverity === sev.id ? sev.bg : S.cardSecondary,
                      color: notifySeverity === sev.id ? sev.color : S.textSec,
                      border: `1.5px solid ${notifySeverity === sev.id ? sev.color : S.border}`,
                      borderRadius: S.radiusSm,
                    })}
                  >
                    {sev.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Body */}
            <Field label="Notification Message" S={S}>
              <textarea
                style={{
                  ...input(S),
                  minHeight: 90,
                  maxHeight: 180,
                  resize: "vertical",
                  lineHeight: 1.5,
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
                placeholder="Write your message here in English or Urdu/Roman Urdu..."
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                required
              />
            </Field>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                type="submit"
                disabled={busy}
                style={btn({
                  flex: 1,
                  padding: "12px",
                  background: notifyTarget === "all" ? "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)" : S.brandGrad,
                  color: "white",
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: "0 4px 14px rgba(139,92,246,0.3)",
                  opacity: busy ? 0.7 : 1,
                })}
              >
                {busy
                  ? "Sending…"
                  : notifyTarget === "all"
                  ? `📢 Broadcast to All Shops (${shops.length})`
                  : "📢 Send Notification"}
              </button>
              <button
                type="button"
                onClick={() => setNotifyModal(false)}
                style={btn({
                  padding: "12px 18px",
                  background: S.cardSecondary,
                  color: S.textSec,
                  border: `1px solid ${S.border}`,
                  fontSize: 14,
                })}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}

// ── Shared Sub-components ──────────────────────────────────────────────────
function LiveAnnouncementBanner({ broadcasts, activeIndex, setActiveIndex, isPaused, setIsPaused, onNewBroadcast, S }) {
  const current = broadcasts[activeIndex];
  const isLight = S.mode === "light";

  if (!current) {
    // Elegant fallback ticker when no broadcasts sent yet
    return (
      <div
        style={{
          background: isLight
            ? "linear-gradient(90deg, #f0fdf4 0%, #eff6ff 100%)"
            : "linear-gradient(90deg, rgba(16,185,129,0.08) 0%, rgba(56,189,248,0.08) 100%)",
          borderBottom: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.07)"}`,
          padding: "8px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 600,
          color: S.textSec,
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: S.success, fontWeight: 800, flexShrink: 0, fontSize: 11, letterSpacing: 0.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: S.success, boxShadow: `0 0 8px ${S.success}` }} />
            POS CLOUD SYNC ACTIVE
          </span>
          <span style={{ color: S.textMuted }}>•</span>
          <span style={{ color: S.text, fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
            All systems nominal · Zero database latency · Real-time owner phone alerts live
          </span>
        </div>
        <button
          onClick={onNewBroadcast}
          style={btn({
            background: isLight ? "#ffffff" : S.cardSecondary,
            color: S.purple,
            border: `1px solid ${isLight ? "#cbd5e1" : S.border}`,
            padding: "4px 10px",
            fontSize: 11,
            borderRadius: 6,
            fontWeight: 700,
            flexShrink: 0,
            boxShadow: isLight ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
          })}
        >
          📢 Broadcast Announcement
        </button>
      </div>
    );
  }

  const isUrgent = current.severity === "high";
  const isWarning = current.severity === "medium";
  const badgeColor = isUrgent ? S.danger : isWarning ? S.warn : S.purple;
  const badgeBg = isUrgent ? S.dangerBg : isWarning ? S.warnBg : S.purpleBg;

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        background: isLight
          ? isUrgent
            ? "linear-gradient(90deg, #fff1f2 0%, #fff7ed 100%)"
            : isWarning
            ? "linear-gradient(90deg, #fffbeb 0%, #fefce8 100%)"
            : "linear-gradient(90deg, #f5f3ff 0%, #eff6ff 100%)"
          : isUrgent
          ? "linear-gradient(90deg, rgba(244,63,94,0.14) 0%, rgba(245,158,11,0.08) 100%)"
          : isWarning
          ? "linear-gradient(90deg, rgba(245,158,11,0.14) 0%, rgba(56,189,248,0.08) 100%)"
          : "linear-gradient(90deg, rgba(139,92,246,0.15) 0%, rgba(56,189,248,0.10) 100%)",
        borderBottom: `1px solid ${isLight ? (isUrgent ? "#fecdd3" : isWarning ? "#fde68a" : "#ddd6fe") : "rgba(255,255,255,0.08)"}`,
        padding: "8px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 12,
        position: "sticky",
        top: 60,
        zIndex: 45,
        backdropFilter: "blur(8px)",
        boxShadow: isLight ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
        transition: "all 0.25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, overflow: "hidden", flex: 1, minWidth: 0 }}>
        {/* Pulsing Live indicator */}
        <span
          style={{
            background: badgeBg,
            color: badgeColor,
            border: `1px solid ${badgeColor}`,
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
            letterSpacing: 0.3,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: badgeColor,
              boxShadow: `0 0 6px ${badgeColor}`,
            }}
          />
          {isUrgent ? "🚨 URGENT BROADCAST" : isWarning ? "⚠️ ALERT NOTICE" : "📢 LIVE ANNOUNCEMENT"}
        </span>

        {/* Target Indicator */}
        <span
          style={{
            background: isLight ? "#e2e8f0" : "rgba(255,255,255,0.07)",
            color: S.textSec,
            padding: "2px 7px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {current.target === "all" ? `To All Shops (${current.recipient_count || "All"})` : `To: ${current.shop_name || "Specific Shop"}`}
        </span>

        {/* Ticker Content */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          <strong style={{ color: S.text, fontWeight: 800 }}>{current.title}:</strong>
          <span style={{ color: S.textSec, overflow: "hidden", textOverflow: "ellipsis" }}>
            {current.message_en || current.message_roman}
          </span>
        </div>
      </div>

      {/* Controls & New Broadcast */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 16 }}>
        {broadcasts.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => setActiveIndex((prev) => (prev - 1 + broadcasts.length) % broadcasts.length)}
              style={{
                background: isLight ? "#ffffff" : S.cardSecondary,
                border: `1px solid ${S.border}`,
                color: S.textSec,
                width: 24,
                height: 24,
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
              }}
              title="Previous Announcement"
            >
              ◀
            </button>
            <span style={{ fontSize: 11, color: S.textMuted, fontWeight: 700, minWidth: 32, textAlign: "center" }}>
              {activeIndex + 1}/{broadcasts.length}
            </span>
            <button
              onClick={() => setActiveIndex((prev) => (prev + 1) % broadcasts.length)}
              style={{
                background: isLight ? "#ffffff" : S.cardSecondary,
                border: `1px solid ${S.border}`,
                color: S.textSec,
                width: 24,
                height: 24,
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
              }}
              title="Next Announcement"
            >
              ▶
            </button>
          </div>
        )}

        <button
          onClick={onNewBroadcast}
          style={btn({
            background: isLight ? "#ffffff" : S.cardSecondary,
            color: S.purple,
            border: `1px solid ${isLight ? "#cbd5e1" : S.border}`,
            padding: "4px 10px",
            fontSize: 11,
            borderRadius: 6,
            fontWeight: 700,
            boxShadow: isLight ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
          })}
        >
          ＋ New Broadcast
        </button>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color, S }) {
  return (
    <div style={{ background: S.card, borderRadius: S.radius, padding: "20px 22px", border: `1px solid ${S.border}`, boxShadow: S.shadow, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: "14px 14px 0 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: S.textSec, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: S.text, letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 12, color: S.textMuted, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function ActionBtn({ label, color, S, busy, onClick }) {
  const isLight = S.mode === "light";
  let bg = S.cardSecondary;
  let border = `1px solid ${S.border}`;

  if (color === S.danger) {
    bg = S.dangerBg;
    border = `1px solid ${isLight ? "#fecdd3" : S.danger}`;
  } else if (color === S.success) {
    bg = S.successBg;
    border = `1px solid ${isLight ? "#a7f3d0" : S.success}`;
  } else if (color === S.purple) {
    bg = S.purpleBg;
    border = `1px solid ${isLight ? "#ddd6fe" : S.purple}`;
  } else if (color === S.brand) {
    bg = isLight ? "#eff6ff" : S.cardSecondary;
    border = `1px solid ${isLight ? "#bfdbfe" : S.border}`;
  }

  return (
    <button disabled={busy} onClick={onClick} style={btn({
      background: bg,
      color,
      border,
      fontSize: 12,
      fontWeight: 700,
      opacity: busy ? 0.6 : 1,
      padding: "6px 11px",
      borderRadius: S.radiusSm,
      boxShadow: isLight ? "0 1px 2px rgba(0,0,0,0.03)" : "none",
    })}>
      {label}
    </button>
  );
}

function Modal({ title, onClose, S, children, width = 520 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, background: S.overlay, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)", padding: 20 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: S.card, borderRadius: S.radiusXl, padding: "28px 32px", width: "100%", maxWidth: width, border: `1px solid ${S.border}`, color: S.text, boxShadow: S.shadowLg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ background: S.cardSecondary, border: `1px solid ${S.border}`, borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: S.textSec, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, S, full }) {
  return (
    <div style={{ marginBottom: 14, gridColumn: full ? "span 2" : undefined }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: S.textSec, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}

function input(S) {
  return {
    width: "100%", padding: "10px 13px", borderRadius: 8,
    border: `1.5px solid ${S.border}`, background: S.inputBg,
    color: S.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", transition: "border-color 0.15s",
  };
}
