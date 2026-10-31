import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

export default function Header({
  shop,
  unseenAlerts = 0,
  onOpenAlerts,
  onOpenSettings,
  isDemo = false,
  onExitDemo,
}) {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-20 w-full pt-safe bg-slate-card/95 backdrop-blur-md border-b border-slate-border transition-colors duration-200">
      {/* Demo Banner (if applicable) */}
      {isDemo && (
        <div className="bg-amber-warm/15 border-b border-amber-warm/30 px-3 py-1 flex items-center justify-between text-xs text-amber-warm font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-warm animate-pulse" />
            <span>Interactive Demo Mode</span>
          </div>
          {onExitDemo && (
            <button
              onClick={onExitDemo}
              className="px-2.5 py-0.5 rounded-full bg-amber-warm text-slate-950 text-[11px] font-bold hover:bg-amber-warm/90 active:scale-95 transition-all"
            >
              {t.exit_demo || 'Exit Demo'}
            </button>
          )}
        </div>
      )}

      {/* Main Clean Header Bar: Shop Name + POS Status | Alerts + Settings */}
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Left Side: Shop Name & POS Status */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold tracking-tight truncate text-slate-text leading-tight">
            {shop?.shop_name || 'HisaabLive'}
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-mint animate-pulse flex-shrink-0" />
            <span className="text-[11px] font-bold text-emerald-mint tracking-tight">
              {t.pos_live || 'POS Live'}
            </span>
            {shop?.shop_code && (
              <span className="text-[10px] font-semibold text-slate-muted px-1.5 py-0.2 rounded bg-slate-base/80 border border-slate-border/60">
                #{shop.shop_code}
              </span>
            )}
          </div>
        </div>

        {/* Right Side: ONLY Alert Icon + Settings Icon */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* 1. Alerts Icon */}
          <button
            onClick={onOpenAlerts}
            className="relative p-2 rounded-xl border border-slate-border bg-slate-card text-slate-text hover:text-[#1F5C4E] hover:bg-slate-border/50 transition-colors flex items-center justify-center min-w-[44px] min-h-[44px] active:scale-95 shadow-sm"
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
              <span className="absolute -top-1 -right-1 bg-rose-crimson text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-md min-w-[18px] text-center border border-slate-card">
                {unseenAlerts > 99 ? '99+' : unseenAlerts}
              </span>
            )}
          </button>

          {/* 2. Settings Icon */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl border border-slate-border bg-slate-card text-slate-text hover:text-[#1F5C4E] hover:bg-slate-border/50 transition-colors flex items-center justify-center min-w-[44px] min-h-[44px] active:scale-95 shadow-sm"
            title="Settings & Preferences"
            aria-label="Settings"
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
