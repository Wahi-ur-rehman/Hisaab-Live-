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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
