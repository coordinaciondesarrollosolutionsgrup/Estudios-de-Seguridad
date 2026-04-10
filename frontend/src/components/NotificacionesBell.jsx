import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [pollEnabled, setPollEnabled] = useState(true);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  const nav = useNavigate();
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  function recalcPos() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPanelPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }

  async function load() {
    const token = localStorage.getItem("token");
    if (!token || !pollEnabled) return;
    setLoading(true);
    try {
      const { data } = await api.get("/api/notificaciones/?unread=true");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e?.response?.status === 401) setPollEnabled(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!pollEnabled) return;
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [pollEnabled]);

  // Cerrar al click fuera / Esc
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      const inButton = btnRef.current?.contains(e.target);
      const inPanel = panelRef.current?.contains(e.target);
      if (!inButton && !inPanel) setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    const onResize = () => recalcPos();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  async function marcarTodasLeidas() {
    await api.post("/api/notificaciones/marcar_leidas/");
    await load();
  }

  async function abrirNoti(n) {
    try {
      await api.post(`/api/notificaciones/${n.id}/marcar_leida/`);
    } catch { /* sin drama */ }
    setOpen(false);
    nav(`/analista?open=${n.solicitud || ""}`);
  }

  function handleToggle() {
    if (!open) recalcPos();
    setOpen(v => !v);
    if (!open) load();
  }

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: panelPos.top,
        right: panelPos.right,
        zIndex: 2147483647,
        width: "28rem",
        maxWidth: "92vw",
        borderRadius: "1rem",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(11,18,32,0.97)",
        color: "#fff",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.8)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Notificaciones</span>
          {loading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>actualizando…</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={load}
            style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Refrescar
          </button>
          <button
            onClick={marcarTodasLeidas}
            style={{ fontSize: 12, borderRadius: 6, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "4px 8px", cursor: "pointer" }}
          >
            Marcar todas
          </button>
        </div>
      </div>

      {/* Lista */}
      <div style={{ maxHeight: 320, overflowY: "auto", padding: "8px" }}>
        {items.length === 0 && !loading && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.7 }}>
                <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22ZM20 17h-1V11a7 7 0 0 0-14 0v6H4a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2Z" fill="currentColor"/>
              </svg>
            </div>
            Sin notificaciones nuevas.
          </div>
        )}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((n) => (
            <li
              key={n.id}
              style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", padding: 16 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.titulo}</span>
                    <span style={{ borderRadius: 999, background: "rgba(16,185,129,0.2)", padding: "2px 8px", fontSize: 10, color: "#6ee7b7" }}>
                      Nuevo
                    </span>
                    {n.created_at && (
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>· {timeAgo(n.created_at)}</span>
                    )}
                  </div>
                  {n.cuerpo && (
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.4, wordBreak: "break-word" }}>
                      {n.cuerpo}
                    </p>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  <button
                    onClick={() => abrirNoti(n)}
                    style={{ borderRadius: 8, background: "rgba(99,102,241,0.85)", border: "none", color: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                  >
                    Abrir
                  </button>
                </div>
              </div>
              {n.solicitud && (
                <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  Solicitud&nbsp;#{n.solicitud}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div>
      {/* Boton campana */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        aria-label="Notificaciones"
        className="relative grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white shadow-lg ring-1 ring-white/10 hover:bg-white/15 transition"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="opacity-90">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22ZM20 17h-1V11a7 7 0 0 0-14 0v6H4a1 1 0 0 0 0 2h16a1 1 0 1 0 0-2Z" fill="currentColor"/>
        </svg>
        {!!items.length && (
          <span className="absolute -top-1 -right-1 rounded-full bg-rose-500 text-white text-[10px] px-1.5 py-0.5 ring-2 ring-[#0a0f1a]">
            {items.length}
          </span>
        )}
      </button>

      {/* Panel renderizado en document.body via portal para escapar cualquier stacking context */}
      {panel}
    </div>
  );
}
