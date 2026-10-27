import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

export default function Header({
  shop,
  unseenAlerts = 0,
  onOpenAlerts,
  themeMode = 'dark',
  onToggleTheme,
  isDemo = false,
  onExitDemo,
  onLogout,
}) {
  const { lang, toggleLanguage, t, isRtl } = useLanguage();

  return (
    <header className="sticky top-0 z-20 w-full pt-safe bg-slate-card/95 backdrop-blur-md border-b border-slate-border transition-colors duration-200">
      {/* Demo Banner */}
      {isDemo && (
        <div className="bg-amber-warm/15 border-b border-amber-warm/30 px-3 py-1 flex items-center justify-between text-xs text-amber-warm font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-warm animate-pulse" />
            <span>Interactive Demo Mode</span>
          </div>
          {onExitDemo && (
            <button
              onClick={onExitDemo}
              className="px-2.5 py-0.5 rounded-full bg-amber-warm text-slate-base-dark text-[11px] font-bold hover:bg-amber-warm/90 active:scale-95 transition-all"
            >
              {t.exit_demo || 'Exit Demo'}
            </button>
          )}
        </div>
      )}

      {/* Main Header Bar */}
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-2">
        {/* Brand & Shop Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Sky Cyan Brand Accent Icon */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-cyan/15 border border-sky-cyan/30 text-sky-cyan shadow-sm flex-shrink-0">
            <svg
              className="w-5 h-5 text-sky-cyan"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight truncate text-slate-50 dark:text-slate-100 leading-tight">
                {shop?.shop_name || 'HisaabLive'}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {shop?.shop_code && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-slate-800/80 border border-slate-700/60 text-slate-300">
                  {shop.shop_code}
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-mint">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-mint animate-pulse" />
                {t.pos_live || 'POS Live'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Actions: Language Switcher, Alerts Bell, Theme Toggle */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Language Switcher Pill (EN | اردو) */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-slate-border bg-slate-card hover:bg-slate-border/50 text-xs font-bold transition-all min-h-[44px] min-w-[44px] justify-center active:scale-95 shadow-sm"
            title={lang === 'en' ? 'اردو میں تبدیل کریں' : 'Switch to English'}
            aria-label="Toggle language"
          >
            <span
              className={`transition-colors ${
                lang === 'en'
                  ? 'text-sky-cyan font-black'
                  : 'text-slate-muted font-medium'
              }`}
            >
              EN
            </span>
            <span className="text-slate-border font-light">|</span>
            <span
              className={`transition-colors text-[13px] ${
                lang === 'ur'
                  ? 'text-sky-cyan font-black'
                  : 'text-slate-muted font-medium'
              }`}
            >
              اردو
            </span>
          </button>

          {/* Alerts Notification Bell with Unseen Count Badge */}
          {onOpenAlerts && (
            <button
              onClick={onOpenAlerts}
              className="relative p-2 rounded-xl border border-slate-border bg-slate-card text-slate-200 hover:text-sky-cyan hover:bg-slate-border/50 transition-colors flex items-center justify-center min-w-[44px] min-h-[44px] active:scale-95 shadow-sm"
              title={t.tab_alerts || 'Security Alerts'}
              aria-label="Security Alerts"
            >
              <svg
                className="w-5 h-5 text-current"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unseenAlerts > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-crimson text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md min-w-[18px] text-center border border-slate-card animate-pulse">
                  {unseenAlerts > 99 ? '99+' : unseenAlerts}
                </span>
              )}
            </button>
          )}

          {/* Theme Toggle Button (Sun/Moon) */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-xl border border-slate-border bg-slate-card text-slate-200 hover:text-sky-cyan hover:bg-slate-border/50 transition-colors flex items-center justify-center min-w-[44px] min-h-[44px] text-base active:scale-95 shadow-sm"
              title={
                themeMode === 'dark' ? 'Switch to Light' : 'Switch to Dark'
              }
              aria-label="Toggle theme mode"
            >
              {themeMode === 'dark' ? '☀️' : '🌙'}
            </button>
          )}

          {/* Logout Button (if not demo) */}
          {!isDemo && onLogout && (
            <button
              onClick={onLogout}
              className="p-2 rounded-xl border border-rose-crimson/30 bg-rose-crimson/10 text-rose-crimson hover:bg-rose-crimson/20 transition-colors flex items-center justify-center min-w-[44px] min-h-[44px] active:scale-95 shadow-sm"
              title={t.logout || 'Logout'}
              aria-label="Logout"
            >
              <svg
                className="w-5 h-5 text-rose-crimson"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
