import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Power, X } from 'lucide-react';

/**
 * Asks the server to exit, then waits until /health stops answering so the
 * "stopped" screen is only shown once that is true.
 */
export async function quitOberleaf(): Promise<void> {
  const res = await fetch('/api/system/quit', { method: 'POST' });
  if (!res.ok) throw new Error(`The server answered ${res.status}.`);

  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const health = await fetch('/health', { cache: 'no-store' });
      if (!health.ok) return;
    } catch {
      return;
    }
  }
  throw new Error('The server is still answering after 6 seconds.');
}

interface QuitConfirmModalProps {
  isOpen: boolean;
  hasUnsavedChanges: boolean;
  onCancel: () => void;
  /** Saves pending edits and stops the server. Rejects with a message on failure. */
  onConfirm: () => Promise<void>;
}

export const QuitConfirmModal: React.FC<QuitConfirmModalProps> = ({
  isOpen,
  hasUnsavedChanges,
  onCancel,
  onConfirm,
}) => {
  const [isQuitting, setIsQuitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsQuitting(false);
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsQuitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err: any) {
      setError(err?.message || 'Oberleaf could not be stopped.');
      setIsQuitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quit-title"
        className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-2xl shadow-2xl max-w-sm w-full p-6 text-stone-900 dark:text-stone-100 relative"
      >
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          disabled={isQuitting}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition disabled:opacity-40"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-600 dark:text-stone-300">
            <Power className="w-5 h-5" />
          </div>
          <h3 id="quit-title" className="font-serif font-bold text-base">
            Quit Oberleaf?
          </h3>
        </div>

        <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
          This stops the Oberleaf server running in the background. Your projects stay on disk.
          {hasUnsavedChanges && ' Your open file is saved first.'}
        </p>

        {error && (
          <p className="mt-3 text-xs text-diagnostic dark:text-diagnostic-dark">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isQuitting}
            className="h-9 px-3.5 rounded-lg text-xs font-medium border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={isQuitting}
            className="h-9 px-3.5 rounded-lg text-xs font-semibold bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 transition disabled:opacity-60 inline-flex items-center gap-2"
          >
            {isQuitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isQuitting ? 'Stopping' : 'Quit Oberleaf'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Replaces the whole app once the server has stopped. */
export const OberleafStoppedScreen: React.FC = () => {
  const [closeBlocked, setCloseBlocked] = useState(false);

  useEffect(() => {
    document.title = 'Oberleaf (stopped)';
  }, []);

  const handleClose = () => {
    window.close();
    // Browsers only let a page close a tab that a script opened. If this tab
    // is still here a moment later, say so instead of doing nothing.
    setTimeout(() => setCloseBlocked(true), 300);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4 bg-surface-light dark:bg-surface-dark text-stone-900 dark:text-stone-100">
      <div className="max-w-md w-full rounded-2xl border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel p-7">
        {/* No logo image: the server that would serve it is already gone. */}
        <h1 className="font-serif font-bold text-xl mb-4">Oberleaf has stopped</h1>
        <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
          The background server is no longer running. You can close this tab now.
        </p>
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
          To open Oberleaf again, start it the way you normally do: the Oberleaf shortcut on your desktop or in the Start menu.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="h-9 px-3.5 rounded-lg text-xs font-semibold bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 transition"
          >
            Close this tab
          </button>
          {closeBlocked && (
            <span className="text-xs text-stone-500 dark:text-stone-400">
              The browser did not allow that. Close the tab with Ctrl+W.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
