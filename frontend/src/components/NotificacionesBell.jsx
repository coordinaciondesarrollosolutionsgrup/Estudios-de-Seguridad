import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

function timeAgo(iso) {
  if (!iso) return "";
  const t = Date.now() - new Date(iso).getTime();
  const s = Math.floor(t / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (s < 60) return `${s}s`;
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

export default function NotificacionesBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const nav = useNavigate();
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/api/notificaciones/?unread=true");
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  // Cerrar al click fuera / Esc
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      const inButton = btnRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inButton && !inPanel) setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function marcarTodasLeidas() {
    await api.post("/api/notificaciones/marcar_todas_leidas/");
    await load();
  }

  async function abrirNoti(n) {
    // marca individual si tu API lo soporta; si no, simplemente continúa
    try {
      await api.post(`/api/notificaciones/${n.id}/marcar_leida/`);
    } catch {
      /* sin drama */
    }
    setOpen(false);
    // navega conservando SPA
    nav(`/analista?open=${n.solicitud || ""}`);
  }

  return (
    <div className="relative">
      {/* Botón campana */}
      <button
        ref={btnRef}
        onClick={() => { setOpen(v => !v); if (!open) load(); }}
        aria-label="Notificaciones"
        className="relative grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white shadow-lg ring-1 ring-white/10 hover:bg-white/15 transition"
      >
        {/* Ícono campana */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="opacity-90">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22ZM20 17h-1V11a7 7 0 0 0-14 0v6H4a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2Z" fill="currentColor"/>
        </svg>

        {!!items.length && (
          <span className="absolute -top-1 -right-1 rounded-full bg-rose-500 text-white text-[10px] px-1.5 py-0.5 ring-2 ring-[#0a0f1a]">
            {items.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-3 w-[28rem] max-w-[92vw] origin-top-right rounded-2xl border border-white/10 bg-[#0b1220]/95 text-white shadow-2xl backdrop-blur-xl z-50
                     animate-[fadeIn_120ms_ease-out] data-[closing=true]:animate-[fadeOut_120ms_ease-in]"
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Notificaciones</span>
              {loading && <span className="text-xs text-white/60">actualizando…</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={load}
                className="text-xs text-white/70 hover:text-white/90 underline-offset-4 hover:underline"
              >
                Refrescar
              </button>
              <button
                onClick={marcarTodasLeidas}
                className="text-xs rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
              >
                Marcar todas
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-auto px-2 py-2">
            {items.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-white/60">
                <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-white/5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-80">
                    <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22ZM20 17h-1V11a7 7 0 0 0-14 0v6H4a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2Z" fill="currentColor"/>
                  </svg>
                </div>
                Sin notificaciones nuevas.
              </div>
            )}

            <ul className="space-y-2">
              {items.map((n) => (
                <li
                  key={n.id}
                  className="group rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/8 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{n.titulo}</span>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                          Nuevo
                        </span>
                        {n.created_at && (
                          <span className="text-[10px] text-white/50">· {timeAgo(n.created_at)}</span>
                        )}
                      </div>
                      {n.cuerpo && (
                        <p className="mt-1 text-sm text-white/70 leading-snug break-words">
                          {n.cuerpo}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      <button
                        onClick={() => abrirNoti(n)}
                        className="rounded-lg bg-indigo-600/90 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-600"
                      >
                        Abrir
                      </button>
                    </div>
                  </div>

                  {n.solicitud && (
                    <div className="mt-2 text-[11px] text-white/50">
                      Solicitud&nbsp;#{n.solicitud}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* tailwind keyframes (añádelas en tu CSS global si quieres la pequeña animación)
@keyframes fadeIn { from { opacity: 0; transform: scale(.98); } to { opacity: 1; transform: scale(1); } }
@keyframes fadeOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.98); } }
*/
