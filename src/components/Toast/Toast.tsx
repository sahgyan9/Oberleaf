import React, { useState, useCallback, useRef } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, variant?: ToastVariant) => void;
  removeToast: (id: string) => void;
}

// useToast — call inside App, pass addToast down where needed
export function useToast(): ToastState {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const removeToast = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
      // Auto-dismiss: errors stay 6 s, others 4 s
      timers.current[id] = setTimeout(
        () => removeToast(id),
        variant === "error" ? 6000 : 4000
      );
    },
    [removeToast]
  );

  return { toasts, addToast, removeToast };
}

// ─── Visual ───────────────────────────────────────────────────────────────────

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-scholarly dark:text-scholarly-dark flex-shrink-0" />,
  error: <XCircle className="w-4 h-4 text-crimson dark:text-crimson-dark flex-shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-diagnostic dark:text-diagnostic-dark flex-shrink-0" />,
  info: <Info className="w-4 h-4 text-citation dark:text-citation-dark flex-shrink-0" />,
};

const BORDER: Record<ToastVariant, string> = {
  success: "border-scholarly/30 dark:border-scholarly-dark/30",
  error:   "border-crimson/30 dark:border-crimson-dark/30",
  warning: "border-diagnostic/30 dark:border-diagnostic-dark/30",
  info:    "border-citation/30 dark:border-citation-dark/30",
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => (
  <div
    role="alert"
    className={
      `flex items-start gap-3 w-80 max-w-[90vw] px-4 py-3 rounded-xl ` +
      `bg-surface-lightPanel dark:bg-surface-darkPanel ` +
      `border ${BORDER[toast.variant]} ` +
      `shadow-lg shadow-black/10 dark:shadow-black/40 ` +
      `text-sm text-[#1C1917] dark:text-[#F5F5F4] ` +
      `animate-in slide-in-from-bottom-2 fade-in duration-200`
    }
  >
    {ICONS[toast.variant]}
    <p className="flex-1 leading-snug font-sans break-words">{toast.message}</p>
    <button
      onClick={() => onRemove(toast.id)}
      className="flex-shrink-0 p-0.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
      aria-label="Dismiss notification"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);

export const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({
  toasts,
  onRemove,
}) => {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 items-end pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
};
