import { useEffect, useState } from "react";

export default function SessionExpiredModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener("session:expired", handler);
    return () => window.removeEventListener("session:expired", handler);
  }, []);

  const handleAceptar = () => {
    localStorage.removeItem("token");
    window.location.href = "/";
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-title"
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b1220] p-8 shadow-2xl text-white text-center">
        {/* Ícono */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-400/30">
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-amber-400">
            <path
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 id="session-title" className="text-lg font-semibold mb-2">
          Sesión expirada
        </h2>
        <p className="text-sm text-white/60 mb-6 leading-relaxed">
          Tu sesión ha expirado por inactividad. Por favor inicia sesión nuevamente para continuar.
        </p>

        <button
          onClick={handleAceptar}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-sm font-semibold text-white transition"
        >
          Aceptar e iniciar sesión
        </button>
      </div>
    </div>
  );
}
