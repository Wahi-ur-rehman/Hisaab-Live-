import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

export default function SettingsModal({
  isOpen,
  onClose,
  shop,
  themeMode = 'dark',
  onToggleTheme,
  isDemo = false,
  onExitDemo,
  onLogout,
  onLogoutAll,
  supportUrl = 'https://wa.me/923229772869',
}) {
  const { lang, toggleLanguage, t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] bg-slate-card rounded-t-xl sm:rounded-xl border border-slate-border flex flex-col overflow-hidden animate-slide-up pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-4 py-3 border-b border-slate-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#1F5C4E]/15 border border-[#1F5C4E]/30 flex items-center justify-center text-[#1F5C4E]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-text leading-tight">
                {lang === 'ur' ? 'ترتیبات و ترجیحات' : 'Settings & Preferences'}
              </h2>
              <p className="text-xs text-slate-muted">
                {shop?.shop_name || 'HisaabLive'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg border border-slate-border bg-slate-card hover:bg-slate-border/50 text-slate-muted hover:text-slate-text flex items-center justify-center text-xs font-bold active:scale-95 transition-all"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 overscroll-contain">
          {/* SECTION 1: Theme & Display Mode */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-muted">
              {lang === 'ur' ? 'ڈسپلے تھیم' : 'Appearance & Theme'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => themeMode !== 'dark' && onToggleTheme()}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 ${
                  themeMode === 'dark'
                    ? 'border-[#1F5C4E] bg-[#1F5C4E]/10 text-[#1F5C4E] ring-1 ring-[#1F5C4E]/40'
                    : 'border-slate-border bg-slate-card text-slate-muted hover:border-slate-border/80'
                }`}
              >
                <div className="text-center">
                  <div className={`text-xs font-bold ${themeMode === 'dark' ? 'text-[#1F5C4E]' : 'text-slate-text'}`}>
                    {lang === 'ur' ? 'ڈارک موڈ' : 'Dark Mode'}
                  </div>
                  <div className="text-xs text-slate-muted mt-0.5">
                    {lang === 'ur' ? 'آنکھوں کے لیے نرم' : 'Eye-Friendly'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => themeMode !== 'light' && onToggleTheme()}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 ${
                  themeMode === 'light'
                    ? 'border-[#1F5C4E] bg-[#1F5C4E]/10 text-[#1F5C4E] ring-1 ring-[#1F5C4E]/40'
                    : 'border-slate-border bg-slate-card text-slate-muted hover:border-slate-border/80'
                }`}
              >
                <div className="text-center">
                  <div className={`text-xs font-bold ${themeMode === 'light' ? 'text-[#1F5C4E]' : 'text-slate-text'}`}>
                    {lang === 'ur' ? 'لائٹ موڈ' : 'Light Mode'}
                  </div>
                  <div className="text-xs text-slate-muted mt-0.5">
                    {lang === 'ur' ? 'دن کے وقت کے لیے' : 'Clean Daylight'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* SECTION 2: Language Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-muted">
              {lang === 'ur' ? 'زبان کا انتخاب' : 'Language'}
            </label>
            <div className="flex rounded-xl p-1 bg-slate-base border border-slate-border gap-1">
              <button
                type="button"
                onClick={() => lang !== 'en' && toggleLanguage()}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                  lang === 'en'
                    ? 'bg-slate-card text-[#1F5C4E] border border-slate-border'
                    : 'text-slate-muted hover:text-slate-text'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => lang !== 'ur' && toggleLanguage()}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                  lang === 'ur'
                    ? 'bg-slate-card text-[#1F5C4E] border border-slate-border'
                    : 'text-slate-muted hover:text-slate-text'
                }`}
              >
                اردو (Urdu)
              </button>
            </div>
          </div>

          {/* SECTION 3: Shop & POS Overview */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-muted">
              {lang === 'ur' ? 'دکان اور پی او ایس معلومات' : 'Shop & POS Profile'}
            </label>
            <div className="p-3 rounded-xl bg-slate-base/60 border border-slate-border space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-muted">{lang === 'ur' ? 'دکان کا نام:' : 'Shop Name:'}</span>
                <span className="font-bold text-slate-text">{shop?.shop_name || 'HisaabLive'}</span>
              </div>
              {shop?.shop_code && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-muted">{lang === 'ur' ? 'شاپ کوڈ:' : 'Shop Code:'}</span>
                  <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-card border border-slate-border text-slate-text">
                    {shop.shop_code}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-muted">{lang === 'ur' ? 'پی او ایس کنکشن:' : 'POS Live Status:'}</span>
                <span className="flex items-center gap-1.5 font-bold text-emerald-mint">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-mint" />
                  {t.pos_live || 'POS Live'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-muted">{lang === 'ur' ? 'لائیو اپ ڈیٹس (OTA):' : 'OTA Live Updates:'}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#1F5C4E]/15 text-[#1F5C4E] border border-[#1F5C4E]/30">
                  Capgo Active
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 4: Support */}
          {supportUrl && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-muted">
                {lang === 'ur' ? 'مدد اور سپورٹ' : 'Support'}
              </label>
              <a
                href={supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full p-2.5 rounded-xl border border-emerald-mint/30 bg-emerald-mint/10 text-emerald-mint hover:bg-emerald-mint/20 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <span>{t.support_btn || 'Contact Support on WhatsApp'}</span>
              </a>
            </div>
          )}

          {/* SECTION 5: Logout & Session Security */}
          <div className="pt-2 border-t border-slate-border space-y-2">
            {isDemo ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onExitDemo && onExitDemo();
                }}
                className="w-full p-2.5 rounded-xl bg-amber-warm text-slate-950 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <span>{t.exit_demo || 'Exit Demo Mode'}</span>
              </button>
            ) : (
              <div className="space-y-2">
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLogout();
                    }}
                    className="w-full p-2.5 rounded-xl border border-rose-crimson/30 bg-rose-crimson/10 text-rose-crimson hover:bg-rose-crimson/20 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <span>{t.logout || 'Logout'}</span>
                  </button>
                )}
                {onLogoutAll && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLogoutAll();
                    }}
                    className="w-full p-2 text-center text-xs font-semibold text-slate-muted hover:text-rose-crimson transition-colors"
                  >
                    {t.logout_all || 'Logout All Devices'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
