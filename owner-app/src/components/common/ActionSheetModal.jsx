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
  icon = null,
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
        className="w-full max-w-md bg-slate-card border-t border-x border-slate-border rounded-t-xl p-4 pb-safe animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle Bar */}
        <div className="w-10 h-1 bg-slate-700/60 rounded-full mx-auto mb-4" />

        {/* Content Header */}
        <div className="flex items-start gap-3 mb-4">
          {icon && (
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                isDestructive
                  ? 'bg-rose-crimson/15 text-rose-crimson border border-rose-crimson/30'
                  : 'bg-[#1F5C4E]/15 text-[#1F5C4E] border border-[#1F5C4E]/30'
              }`}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-100 leading-snug">
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
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-[0.98] border flex items-center justify-center gap-2 ${
              isDestructive
                ? 'bg-rose-crimson text-white border-rose-crimson hover:bg-rose-crimson/90'
                : 'bg-[#1F5C4E] text-white border-[#1F5C4E] hover:bg-[#1F5C4E]/90'
            }`}
          >
            {confirmText}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-xs text-slate-300 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-all active:scale-[0.98]"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
