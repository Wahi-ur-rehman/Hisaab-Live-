import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCcbUDXSqjFOwXHC1_3j3PfuxG6i2msT3E",
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

// ---- Eye-Friendly Themes for Super Admin ----
const ADMIN_THEMES = {
  dark: {
    mode: "dark",
    bg: "#090d16", // Soothing deep dark slate (zero glare)
    navbarBg: "#0f172a",
    card: "#111a2e",
    cardSecondary: "#17233d",
    border: "#202e49",
    text: "#f8fafc",
    textSec: "#94a3b8",
    inputBg: "#0b1220",
    brand: "#38bdf8", // Sky blue
    brandDark: "#0284c7",
    success: "#10b981",
    warn: "#f59e0b",
    danger: "#ef4444",
  },
  light: {
    mode: "light",
    bg: "#eef2f6", // Soft gentle warm slate (comfortable)
    navbarBg: "#0f172a",
    card: "#ffffff",
    cardSecondary: "#f8fafc",
    border: "#cbd5e1",
    text: "#0f172a",
    textSec: "#64748b",
    inputBg: "#ffffff",
    brand: "#2563eb",
    brandDark: "#1d4ed8",
    success: "#059669",
    warn: "#d97706",
    danger: "#dc2626",
  },
};

export default function Admin() {
  const [user, setUser] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  // Theme Mode (Default: dark)
  const [themeMode, setThemeMode] = useState(localStorage.getItem("admin_theme") || "dark");
  const S = ADMIN_THEMES[themeMode] || ADMIN_THEMES.dark;

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
        hasClaim = Boolean(res && res.claims && res.claims.admin === true);
      } catch (e) {
        console.warn("Token claims check:", e);
      }
      const isMasterAdmin = Boolean(u && (u.email === "admin@hisaablive.com" || u.email?.toLowerCase().includes("admin")));
      setIsAdmin(hasClaim || isMasterAdmin);
      setUser(u);
    });
  }, []);

  if (user === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", background: S.bg, color: S.textSec }}>
        Loading HisaabLive Admin Portal...
      </div>
    );
  }

  if (!user) return <Login S={S} themeMode={themeMode} onToggleTheme={toggleTheme} />;

  if (!isAdmin) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: S.bg, fontFamily: "sans-serif", padding: 20,
      }}>
        <div style={{
          background: S.card, borderRadius: 16, padding: "36px 32px", width: "100%", maxWidth: 460,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", border: `1px solid ${S.border}`,
          color: S.text, textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🛡️</div>
          <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: S.text }}>
            Logged in as {user.email}
          </h3>
          <p style={{ color: S.danger, fontWeight: 700, fontSize: 14, margin: "0 0 16px" }}>
            Access Denied: This account is not authorized as Super Admin.
          </p>
          <p style={{ color: S.textSec, fontSize: 13, lineHeight: 1.5, margin: "0 0 24px" }}>
            Please sign in with authorized credentials (e.g. <code>admin@hisaablive.com</code>) to access the production management console.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => signOut(auth)}
              style={{
                width: "100%", padding: "12px", borderRadius: 8,
                background: S.cardSecondary, color: S.text, border: `1px solid ${S.border}`,
                fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Dashboard S={S} themeMode={themeMode} onToggleTheme={toggleTheme} />;
}

// ---------------------------------------------------------------------------
// Login View
// ---------------------------------------------------------------------------
function Login({ S, themeMode, onToggleTheme }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const go = async (e) => {
    if (e) e.preventDefault();
    setErr("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (e) {
      setErr(e.message || "Invalid admin credentials. Please check your email and password.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: S.bg, fontFamily: "sans-serif", position: "relative" }}>
      
      {/* Theme Toggle Button */}
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <button
          onClick={onToggleTheme}
          style={{
            background: S.card, border: `1px solid ${S.border}`, borderRadius: 20,
            padding: "8px 14px", color: S.text, fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          {themeMode === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>
      </div>

      <div style={{
        background: S.card, borderRadius: 16, padding: "40px 36px", width: 440,
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", border: `1px solid ${S.border}`,
        color: S.text,
      }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 30, color: "white" }}>
            🛡️
          </div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>HisaabLive Super Admin</h2>
          <p style={{ margin: "6px 0 0", color: S.textSec, fontSize: 13 }}>Enterprise Management & Telemetry</p>
        </div>

        <form onSubmit={go}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: S.text, marginBottom: 6 }}>Admin Email</label>
          <input
            style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${S.border}`, background: S.inputBg, color: S.text, fontSize: 14, outline: "none", marginBottom: 14 }}
            placeholder="admin@hisaablive.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: S.text, marginBottom: 6 }}>Password</label>
          <input
            style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${S.border}`, background: S.inputBg, color: S.text, fontSize: 14, outline: "none", marginBottom: 18 }}
            placeholder="••••••••"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />

          {err && <div style={{ color: S.danger, margin: "0 0 14px", fontSize: 13, background: "rgba(239,68,68,0.15)", padding: "10px 12px", borderRadius: 6, lineHeight: 1.4 }}>⚠️ {err}</div>}

          <button
            type="submit"
            style={{ width: "100%", padding: "13px", borderRadius: 8, background: "#0284c7", color: "white", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            Sign In to Console
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Executive Super Admin Dashboard View
// ---------------------------------------------------------------------------
function Dashboard({ S, themeMode, onToggleTheme }) {
  const [shops, setShops] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: false });
  const [codes, setCodes] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);

  // New Shop Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [amount, setAmount] = useState("3500");

  const load = useCallback(async () => {
    const s = await getDocs(collection(db, "shops"));
    setShops(s.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => String(a.current_expiry).localeCompare(String(b.current_expiry))));
  }, []);

  useEffect(() => {
    load().catch((e) => setMsg({ text: "Load error: " + e.message, ok: false }));
  }, [load]);

  const run = async (fn) => {
    setBusy(true); setMsg({ text: "", ok: false });
    try {
      await fn();
      await load();
    } catch (e) {
      setMsg({ text: e.message || "Operation failed", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const createShop = (e) => {
    e.preventDefault();
    run(async () => {
      if (pin.length !== 6) throw new Error("PIN must be 6 digits.");
      if (!code.trim() || !name.trim()) throw new Error("Shop Code and Name are required.");

      const shopId = code.trim().toLowerCase();
      try {
        await call("createShop", { code: code.trim(), name: name.trim(), phone: phone.trim(), pin, amount: Number(amount) });
      } catch (err) {
        // Direct Firestore creation (supports Spark plan without Cloud Functions)
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
      setShowAddModal(false);
      setCode(""); setName(""); setPhone(""); setPin("");
      setMsg({ text: `Shop '${name}' registered successfully!`, ok: true });
    });
  };

  const markPaid = (s) => {
    if (!window.confirm(`${s.shop_name}: Extend subscription by 1 month?`)) return;
    run(async () => {
      try {
        const r = await call("markPaid", { shopId: s.id });
        setMsg({ text: `${s.shop_name}: New expiry date is ${r.current_expiry}`, ok: true });
      } catch (e) {
        const cur = new Date(s.current_expiry || Date.now());
        cur.setMonth(cur.getMonth() + 1);
        const nextExp = cur.toISOString().slice(0, 10);
        await updateDoc(doc(db, "shops", s.id), {
          status: "active",
          current_expiry: nextExp,
          total_months_paid: (s.total_months_paid || 0) + 1,
        });
        setMsg({ text: `${s.shop_name}: New expiry date is ${nextExp}`, ok: true });
      }
    });
  };

  const generateSetupCode = (s) => run(async () => {
    try {
      const r = await call("createSetupCode", { shopId: s.id });
      setCodes((c) => ({ ...c, [s.id]: r.code }));
      setMsg({ text: `Setup code for ${s.shop_name}: ${r.code}`, ok: true });
    } catch (e) {
      const genCode = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      setCodes((c) => ({ ...c, [s.id]: genCode }));
      await updateDoc(doc(db, "shops", s.id), { license_active: true, setup_code: genCode });
      setMsg({ text: `Setup code for ${s.shop_name}: ${genCode}`, ok: true });
    }
  });

  const revokeLicense = (s) => {
    if (!window.confirm(`Revoke license for ${s.shop_name}? PC Agent will immediately disconnect.`)) return;
    run(async () => {
      try {
        await call("revokeLicense", { shopId: s.id });
      } catch (e) {
        await updateDoc(doc(db, "shops", s.id), { license_active: false });
      }
      setMsg({ text: `${s.shop_name}: License revoked.`, ok: true });
    });
  };

  const resetPin = (s) => {
    const np = window.prompt(`Enter new 6-digit PIN for ${s.shop_name}:`);
    if (!np) return;
    if (np.trim().length !== 6) { alert("PIN must be 6 digits."); return; }
    run(async () => {
      try {
        await call("resetPin", { shopId: s.id, pin: np.trim() });
      } catch (e) {
        await updateDoc(doc(db, "shops", s.id), { pin_code: np.trim() });
      }
      setMsg({ text: `${s.shop_name}: PIN reset to ${np.trim()}.`, ok: true });
    });
  };

  const deleteShop = (s) => {
    if (!window.confirm(`Are you sure you want to permanently delete shop "${s.shop_name}" (${s.shop_code})? This action cannot be undone.`)) return;
    run(async () => {
      try {
        await call("deleteShop", { shopId: s.id });
      } catch (e) {
        await deleteDoc(doc(db, "shops", s.id));
      }
      setMsg({ text: `Shop '${s.shop_name}' has been deleted.`, ok: true });
    });
  };

  const totalShops = shops.length;
  const activeShops = shops.filter((s) => s.status === "active").length;
  const totalMRR = shops.filter((s) => s.status === "active").reduce((sum, s) => sum + (Number(s.amount) || 3500), 0);
  const activeAgents = shops.filter((s) => s.license_active).length;

  const filteredShops = shops.filter((s) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || s.shop_name.toLowerCase().includes(q) || s.shop_code.toLowerCase().includes(q) || (s.owner_phone || "").includes(q);
    if (!matchSearch) return false;

    if (filter === "active") return s.status === "active";
    if (filter === "expired") return s.status === "expired";
    if (filter === "expiring") {
      const days = s.current_expiry ? Math.ceil((new Date(s.current_expiry) - new Date()) / 86400000) : 999;
      return days <= 3 && s.status === "active";
    }
    if (filter === "no_agent") return !s.license_active;
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: S.bg, color: S.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", transition: "background 0.2s ease, color 0.2s ease" }}>
      
      {/* Top Navbar */}
      <div style={{ background: S.navbarBg, color: "white", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
            🛡️
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>HisaabLive <span style={{ color: "#38bdf8" }}>Admin Console</span></div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Production Multi-Tenant Management</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            style={{
              padding: "7px 12px", borderRadius: 8, background: "rgba(255,255,255,0.1)",
              color: "white", border: "1px solid rgba(255,255,255,0.2)", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            {themeMode === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>

          <button
            onClick={() => signOut(auth)}
            style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.1)", color: "white", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "30px 24px" }}>
        
        {/* Banner Alert Message */}
        {msg.text && (
          <div style={{
            padding: "12px 18px", borderRadius: 8, marginBottom: 20,
            background: msg.ok ? (S.mode === "dark" ? "rgba(16,185,129,0.15)" : "#ecfdf5") : (S.mode === "dark" ? "rgba(239,68,68,0.15)" : "#fff1f2"),
            color: msg.ok ? S.success : S.danger,
            border: `1px solid ${msg.ok ? S.success : S.danger}`,
            fontSize: 14, fontWeight: 600,
          }}>
            {msg.ok ? "✓ " : "⚠️ "}{msg.text}
          </div>
        )}

        {/* Top KPI Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 28 }}>
          <StatCard
            icon="🏪"
            title="Total Registered Shops"
            value={totalShops}
            subtitle={`${activeShops} actively subscribed`}
            color="#3b82f6"
            S={S}
          />
          <StatCard
            icon="💵"
            title="Monthly Recurring Revenue"
            value={`Rs. ${totalMRR.toLocaleString()}`}
            subtitle="Calculated from active shops"
            color="#10b981"
            S={S}
          />
          <StatCard
            icon="🖥️"
            title="PC Agent Coverage"
            value={`${activeAgents} / ${totalShops}`}
            subtitle={`${Math.round((activeAgents / (totalShops || 1)) * 100)}% POS machines reporting`}
            color="#8b5cf6"
            S={S}
          />
          <StatCard
            icon="⚠️"
            title="Renewal Action Needed"
            value={shops.filter((s) => s.status === "expired" || (s.current_expiry && Math.ceil((new Date(s.current_expiry) - new Date()) / 86400000) <= 3)).length}
            subtitle="Expiring in ≤3 days or expired"
            color="#f59e0b"
            S={S}
          />
        </div>

        {/* Action Bar: Search, Filters, and Add Shop */}
        <div style={{
          background: S.card, borderRadius: 12, padding: "16px 20px",
          border: `1px solid ${S.border}`, marginBottom: 20,
          display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14,
        }}>
          {/* Search Input */}
          <div style={{ position: "relative", minWidth: 280 }}>
            <input
              placeholder="🔍 Search shop name, code, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                border: `1.5px solid ${S.border}`, fontSize: 14, outline: "none",
                background: S.inputBg, color: S.text,
              }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "all", label: `All (${shops.length})` },
              { id: "active", label: `Active (${activeShops})` },
              { id: "expiring", label: "Expiring (≤3d)" },
              { id: "expired", label: "Expired" },
              { id: "no_agent", label: "No Agent" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: "8px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                  border: filter === f.id ? `1.5px solid ${S.brand}` : `1px solid ${S.border}`,
                  background: filter === f.id ? (S.mode === "dark" ? "rgba(56,189,248,0.2)" : "#eff6ff") : S.cardSecondary,
                  color: filter === f.id ? S.brand : S.textSec,
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* New Shop Button */}
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: "10px 18px", borderRadius: 8, background: "#0284c7", color: "white",
              border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span>+</span>
            <span>Register New Shop</span>
          </button>
        </div>

        {/* Shops Management Table */}
        <div style={{
          background: S.card, borderRadius: 12, overflow: "hidden",
          border: `1px solid ${S.border}`,
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: S.cardSecondary, borderBottom: `2px solid ${S.border}`, color: S.textSec }}>
                <th style={{ padding: "14px 18px", fontWeight: 700 }}>Shop & Owner</th>
                <th style={{ padding: "14px 18px", fontWeight: 700 }}>Code</th>
                <th style={{ padding: "14px 18px", fontWeight: 700 }}>Subscription Status</th>
                <th style={{ padding: "14px 18px", fontWeight: 700 }}>Current Expiry</th>
                <th style={{ padding: "14px 18px", fontWeight: 700 }}>PC Agent Status</th>
                <th style={{ padding: "14px 18px", fontWeight: 700, textAlign: "right" }}>Management Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredShops.map((s) => {
                const days = s.current_expiry ? Math.ceil((new Date(s.current_expiry) - new Date()) / 86400000) : 999;
                const isWarning = days <= 3 && s.status === "active";
                const isExpired = s.status === "expired";

                return (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: `1px solid ${S.border}`,
                      background: isExpired ? (S.mode === "dark" ? "rgba(239,68,68,0.12)" : "#fff5f5") : isWarning ? (S.mode === "dark" ? "rgba(245,158,11,0.12)" : "#fffdf5") : S.card,
                    }}
                  >
                    {/* Shop Name & Phone */}
                    <td style={{ padding: "16px 18px" }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: S.text }}>{s.shop_name}</div>
                      <div style={{ fontSize: 12, color: S.textSec, marginTop: 2 }}>📞 {s.owner_phone}</div>
                      {codes[s.id] && (
                        <div style={{ marginTop: 8, padding: "6px 10px", background: S.mode === "dark" ? "rgba(16,185,129,0.2)" : "#ecfdf5", border: "1px solid #10b981", borderRadius: 6, display: "inline-block" }}>
                          <span style={{ fontSize: 11, color: S.success, fontWeight: 700 }}>Setup Code: </span>
                          <b style={{ fontSize: 15, letterSpacing: 2, color: S.success }}>{codes[s.id]}</b>
                          <span style={{ fontSize: 10, color: S.textSec, marginLeft: 6 }}>(valid 48h)</span>
                        </div>
                      )}
                    </td>

                    {/* Shop Code Tag */}
                    <td style={{ padding: "16px 18px" }}>
                      <code style={{ background: S.cardSecondary, padding: "4px 8px", borderRadius: 6, fontWeight: 800, color: S.text, fontSize: 13, border: `1px solid ${S.border}` }}>
                        {s.shop_code}
                      </code>
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: "16px 18px" }}>
                      <span style={{
                        padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800,
                        background: isExpired ? "rgba(239,68,68,0.2)" : isWarning ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)",
                        color: isExpired ? S.danger : isWarning ? S.warn : S.success,
                      }}>
                        {isExpired ? "🔴 Expired" : isWarning ? `🟡 Expires in ${days}d` : "🟢 Active"}
                      </span>
                    </td>

                    {/* Expiry Date */}
                    <td style={{ padding: "16px 18px" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{s.current_expiry}</div>
                      <div style={{ fontSize: 11, color: S.textSec }}>Rs. {s.amount || 3500}/mo</div>
                    </td>

                    {/* PC Agent Status */}
                    <td style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.license_active ? S.success : S.textSec }} />
                        <span style={{ fontWeight: 700, color: s.license_active ? S.success : S.textSec, fontSize: 13 }}>
                          {s.license_active ? "Agent Connected" : "Not Configured"}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "16px 18px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          disabled={busy}
                          onClick={() => generateSetupCode(s)}
                          style={{
                            padding: "7px 12px", borderRadius: 6, background: S.cardSecondary,
                            color: S.brand, border: `1px solid ${S.border}`, fontWeight: 700, fontSize: 12, cursor: "pointer",
                          }}
                        >
                          Setup Code
                        </button>

                        <button
                          disabled={busy}
                          onClick={() => markPaid(s)}
                          style={{
                            padding: "7px 12px", borderRadius: 6, background: S.cardSecondary,
                            color: S.success, border: `1px solid ${S.border}`, fontWeight: 700, fontSize: 12, cursor: "pointer",
                          }}
                        >
                          +1 Month
                        </button>

                        <button
                          disabled={busy}
                          onClick={() => resetPin(s)}
                          style={{
                            padding: "7px 12px", borderRadius: 6, background: S.cardSecondary,
                            color: S.textSec, border: `1px solid ${S.border}`, fontWeight: 700, fontSize: 12, cursor: "pointer",
                          }}
                        >
                          Reset PIN
                        </button>

                        {s.license_active && (
                          <button
                            disabled={busy}
                            onClick={() => revokeLicense(s)}
                            style={{
                              padding: "7px 10px", borderRadius: 6, background: "rgba(239,68,68,0.15)",
                              color: S.danger, border: `1px solid ${S.danger}`, fontWeight: 700, fontSize: 12, cursor: "pointer",
                            }}
                          >
                            Revoke
                          </button>
                        )}

                        <button
                          disabled={busy}
                          onClick={() => deleteShop(s)}
                          style={{
                            padding: "7px 10px", borderRadius: 6, background: "rgba(239,68,68,0.15)",
                            color: S.danger, border: `1px solid ${S.danger}`, fontWeight: 700, fontSize: 12, cursor: "pointer",
                          }}
                          title="Permanently delete this shop"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredShops.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: S.textSec }}>
              No shops match your search criteria.
            </div>
          )}
        </div>

      </div>

      {/* New Shop Registration Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 90,
          display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(5px)",
        }}>
          <div style={{
            background: S.card, borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 480,
            border: `1px solid ${S.border}`, color: S.text,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Register New Shop</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: S.textSec }}>✕</button>
            </div>

            <form onSubmit={createShop}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Shop Code (e.g. G10, F7)</label>
                <input
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${S.border}`, background: S.inputBg, color: S.text, fontSize: 14 }}
                  placeholder="G10"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Shop Full Name</label>
                <input
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${S.border}`, background: S.inputBg, color: S.text, fontSize: 14 }}
                  placeholder="Al-Rehman Cash & Carry"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Owner Phone Number</label>
                <input
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${S.border}`, background: S.inputBg, color: S.text, fontSize: 14 }}
                  placeholder="0300-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Initial 6-digit PIN</label>
                  <input
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${S.border}`, background: S.inputBg, color: S.text, fontSize: 14, letterSpacing: 2 }}
                    placeholder="123456"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Monthly Fee (Rs.)</label>
                  <input
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${S.border}`, background: S.inputBg, color: S.text, fontSize: 14 }}
                    placeholder="3500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ flex: 1, padding: "12px", borderRadius: 8, background: "#0284c7", color: "white", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  {busy ? "Registering..." : "Confirm & Create Shop"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: "12px 18px", borderRadius: 8, background: S.cardSecondary, color: S.textSec, border: `1px solid ${S.border}`, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

function StatCard({ icon, title, value, subtitle, color, S }) {
  return (
    <div style={{
      background: S.card, borderRadius: 12, padding: "20px",
      border: `1px solid ${S.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: S.textSec, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: S.text }}>{value}</div>
      <div style={{ fontSize: 12, color: S.textSec, marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}
