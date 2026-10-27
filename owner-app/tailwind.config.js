import tailwindcssSafeArea from 'tailwindcss-safe-area';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'slate-base': {
          DEFAULT: 'var(--color-slate-base, #090d16)',
          dark: '#090d16',
          light: '#f1f5f9',
        },
        'slate-card': {
          DEFAULT: 'var(--color-slate-card, #1a243b)',
          dark: '#1a243b',
          light: '#ffffff',
        },
        'slate-border': {
          DEFAULT: 'var(--color-slate-border, #223354)',
          dark: '#223354',
          light: '#e2e8f0',
        },
        'slate-muted': '#94a3b8',
        'emerald-mint': '#10b981',
        'amber-warm': '#f59e0b',
        'rose-crimson': '#f43f5e',
        'sky-cyan': '#38bdf8',
        slate: {
          950: '#090d16',
          900: '#0f172a',
          850: '#131d31',
          800: '#1a243b',
          750: '#223354',
          700: '#334155',
          600: '#475569',
          500: '#64748b',
          400: '#94a3b8',
          300: '#cbd5e1',
          200: '#e2e8f0',
          100: '#f1f5f9',
          50: '#f8fafc',
        },
        brand: {
          50: '#fff1f2',
          100: '#ffe4e6',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          cyan: '#38bdf8',
          mint: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
        },
      },
    },
  },
  plugins: [
    tailwindcssSafeArea,
  ],
};
