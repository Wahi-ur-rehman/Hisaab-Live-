import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const TABS = [
  {
    id: 'hisaab',
    key: 'tab_hisaab',
    labelEn: 'Live Hisaab',
    labelUr: 'لائیو حساب',
    icon: (isActive) => (
      <svg
        className={`w-5 h-5 transition-transform duration-150 ${
          isActive ? 'scale-110 text-sky-cyan' : 'text-slate-muted'
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={isActive ? 2.5 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    id: 'expenses',
    key: 'tab_expenses',
    labelEn: 'Expenses',
    labelUr: 'اخراجات',
    icon: (isActive) => (
      <svg
        className={`w-5 h-5 transition-transform duration-150 ${
          isActive ? 'scale-110 text-sky-cyan' : 'text-slate-muted'
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={isActive ? 2.5 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
  },
  {
    id: 'khata',
    key: 'tab_khata',
    labelEn: 'Khata Ledger',
    labelUr: 'کھاتہ لیجر',
    icon: (isActive) => (
      <svg
        className={`w-5 h-5 transition-transform duration-150 ${
          isActive ? 'scale-110 text-sky-cyan' : 'text-slate-muted'
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={isActive ? 2.5 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    id: 'reports',
    key: 'tab_reports',
    labelEn: 'Monthly Reports',
    labelUr: 'ماہانہ رپورٹ',
    icon: (isActive) => (
      <svg
        className={`w-5 h-5 transition-transform duration-150 ${
          isActive ? 'scale-110 text-sky-cyan' : 'text-slate-muted'
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={isActive ? 2.5 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
];

export default function TabBar({
  activeTab = 'hisaab',
  onTabChange,
  unseenAlerts = 0,
}) {
  const { lang, t, isRtl } = useLanguage();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 pb-safe bg-slate-card/95 backdrop-blur-md border-t border-slate-border shadow-lg transition-colors duration-200"
      aria-label="Bottom Navigation Tabs"
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const label = isRtl
            ? (t[tab.key] || tab.labelUr)
            : (t[tab.key] || tab.labelEn);

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange && onTabChange(tab.id)}
              role="tab"
              aria-selected={isActive}
              className={`flex-1 flex flex-col items-center justify-center min-h-[48px] min-w-[48px] py-2 px-1 relative transition-all duration-150 active:scale-95 group focus:outline-none`}
            >
              {/* Active Accent Indicator Bar */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-sky-cyan shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
              )}

              {/* Icon */}
              <div className="relative mb-1">
                {tab.icon(isActive)}
              </div>

              {/* Label */}
              <span
                className={`text-[11px] leading-tight truncate max-w-full tracking-tight transition-colors ${
                  isActive
                    ? 'text-sky-cyan font-bold'
                    : 'text-slate-muted group-hover:text-slate-300 font-medium'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
