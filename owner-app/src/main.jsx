import React from 'react';
import ReactDOM from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';

/* Core Ionic CSS */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Ionic Dark Palette */
import '@ionic/react/css/palettes/dark.class.css';

/* Deep Slate Ionic Custom Variables & Base Tailwind CSS */
import './theme/variables.css';
import './index.css';

import App from './App.jsx';

// Initialize Ionic React with Material Design mode
setupIonicReact({ mode: 'md' });

/**
 * Dark Mode Synchronization Helper
 * Ensures document.documentElement dynamically maintains '.dark' and '.ion-palette-dark'
 * whenever theme is toggled or initialized.
 */
export const syncDarkMode = (theme) => {
  const isDark = theme !== 'light';
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark', 'ion-palette-dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark', 'ion-palette-dark');
    root.style.colorScheme = 'light';
  }
};

// Initial dark mode synchronization on app boot
try {
  const currentTheme = localStorage.getItem('hl_theme') || 'dark';
  syncDarkMode(currentTheme);
} catch (e) {
  syncDarkMode('dark');
}

// Global listener & localStorage interceptor to keep DOM synchronized
if (typeof window !== 'undefined') {
  window.__syncDarkMode = syncDarkMode;
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    originalSetItem(key, value);
    if (key === 'hl_theme') {
      syncDarkMode(value);
    }
  };
  window.addEventListener('storage', (e) => {
    if (e.key === 'hl_theme') {
      syncDarkMode(e.newValue);
    }
  });
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#090d16',
          color: '#f8fafc',
          padding: 24,
          fontFamily: 'sans-serif',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>Something went wrong</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 360, margin: '0 0 20px', lineHeight: 1.5 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                background: '#38bdf8',
                color: '#090d16',
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              Reload App
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem('active_shop_id');
                } catch (e) {}
                window.location.reload();
              }}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              Reset Session
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
