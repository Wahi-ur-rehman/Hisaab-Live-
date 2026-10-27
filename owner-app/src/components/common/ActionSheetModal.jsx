import React, { useEffect } from 'react';

/**
 * ActionSheetModal
 * Mobile-first touch-friendly action sheet and confirmation dialog.
 * Replaces intrusive desktop window.confirm with an eye-friendly
 * Deep Slate modal featuring smooth slide-up ergonomics and safe-area padding.
 */
export default function ActionSheetModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = true,
  icon = '🗑️',
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-card border-t border-x border-slate-border rounded-t-3xl p-5 pb-safe shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle Bar */}
        <div className="w-10 h-1 bg-slate-700/60 rounded-full mx-auto mb-4" />

        {/* Content Header */}
        <div className="flex items-start gap-3.5 mb-5">
          {icon && (
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ${
                isDestructive
                  ? 'bg-rose-crimson/15 text-rose-crimson border border-rose-crimson/30'
                  : 'bg-sky-cyan/15 text-sky-cyan border border-sky-cyan/30'
              }`}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-100 leading-snug">
              {title}
            </h3>
            {message && (
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {message}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onConfirm}
            className={`w-full min-h-[48px] px-4 py-3 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 ${
              isDestructive
                ? 'bg-rose-crimson text-white hover:bg-rose-crimson/90 shadow-rose-crimson/25'
                : 'bg-sky-cyan text-slate-950 hover:bg-sky-cyan/90 font-black shadow-sky-cyan/25'
            }`}
          >
            {confirmText}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl font-semibold text-sm text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all active:scale-[0.98]"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
