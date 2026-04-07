import { createContext, useCallback, useContext, useRef, useState } from "react";

/* ─────────────── Context ─────────────── */
const ToastContext = createContext(null);

let _uid = 0;
const uid = () => ++_uid;

/* ─────────────── Provider ─────────────── */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const remove = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (type, message, duration = 4000) => {
      const id = uid();
      setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
      if (duration > 0) {
        timers.current[id] = setTimeout(() => remove(id), duration);
      }
      return id;
    },
    [remove]
  );

  const toast = {
    success: (msg, d) => add("success", msg, d),
    error: (msg, d) => add("error", msg, d ?? 6000),
    info: (msg, d) => add("info", msg, d),
    loading: (msg) => add("loading", msg, 0), // manual dismiss
    dismiss: (id) => remove(id),
    update: (id, type, message, duration = 4000) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, type, message } : t))
      );
      clearTimeout(timers.current[id]);
      if (duration > 0) {
        timers.current[id] = setTimeout(() => remove(id), duration);
      }
    },
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toaster toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

/* ─────────────── Hook ─────────────── */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/* ─────────────── Icons ─────────────── */
const icons = {
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  loading: (
    <svg className="w-5 h-5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  ),
};

const styles = {
  success: "bg-emerald-900/95 border-emerald-500/40 text-emerald-100",
  error:   "bg-red-900/95 border-red-500/40 text-red-100",
  info:    "bg-blue-900/95 border-blue-500/40 text-blue-100",
  loading: "bg-slate-800/95 border-slate-600/40 text-slate-100",
};

const iconColor = {
  success: "text-emerald-400",
  error:   "text-red-400",
  info:    "text-blue-400",
  loading: "text-slate-300",
};

/* ─────────────── Toaster ─────────────── */
function Toaster({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur pointer-events-auto
            ${styles[t.type] ?? styles.info}
            animate-[slideUp_0.2s_ease-out]`}
          style={{ animation: "slideUp 0.2s ease-out" }}
        >
          <span className={iconColor[t.type]}>{icons[t.type]}</span>
          <span className="text-sm leading-snug flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="opacity-50 hover:opacity-100 text-lg leading-none ml-1 shrink-0"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
