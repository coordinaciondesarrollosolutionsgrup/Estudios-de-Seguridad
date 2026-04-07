import { useNavigate } from "react-router-dom";
import api from "../api/axios";

/**
 * AppNavbar — barra superior elegante con logo eConfia
 *
 * Props:
 *   title      string   — título de la sección (ej: "Panel del analista")
 *   subtitle   string   — subtítulo opcional
 *   right      node     — contenido extra a la derecha (notificaciones, botones, etc.)
 *   username   string   — nombre del usuario para mostrar
 *   role       string   — rol del usuario (ANALISTA, CLIENTE, CANDIDATO, ADMIN)
 */
export default function AppNavbar({ title, subtitle, right, username, role, logoUrl }) {
  const nav = useNavigate();
  const resolvedUsername = username || localStorage.getItem("username") || "";
  const resolvedRole = role || localStorage.getItem("role") || "";
  const rawLogo = logoUrl || localStorage.getItem("empresa_logo_url") || "";
  let resolvedLogo = "/logo-econfia blanco.png";
  if (rawLogo) {
    if (/^https?:\/\//i.test(rawLogo) || rawLogo.startsWith("data:")) {
      resolvedLogo = rawLogo;
    } else {
      const apiBase = api?.defaults?.baseURL || window.location.origin;
      resolvedLogo = new URL(rawLogo, apiBase).toString();
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    localStorage.removeItem("empresa_logo_url");
    nav("/");
  };

  const roleLabel = {
    ANALISTA: "Analista",
    ADMIN: "Administrador",
    CLIENTE: "Cliente",
    CANDIDATO: "Candidato",
  }[resolvedRole] || resolvedRole;

  const roleColor = {
    ANALISTA: "rgba(96,165,250,0.15)",
    ADMIN: "rgba(167,139,250,0.15)",
    CLIENTE: "rgba(52,211,153,0.15)",
    CANDIDATO: "rgba(251,191,36,0.15)",
  }[resolvedRole] || "rgba(255,255,255,0.08)";

  const roleBorder = {
    ANALISTA: "rgba(96,165,250,0.3)",
    ADMIN: "rgba(167,139,250,0.3)",
    CLIENTE: "rgba(52,211,153,0.3)",
    CANDIDATO: "rgba(251,191,36,0.3)",
  }[resolvedRole] || "rgba(255,255,255,0.12)";

  const roleText = {
    ANALISTA: "#93c5fd",
    ADMIN: "#c4b5fd",
    CLIENTE: "#6ee7b7",
    CANDIDATO: "#fde68a",
  }[resolvedRole] || "rgba(255,255,255,0.7)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 20px",
        borderRadius: 20,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
        flexWrap: "wrap",
      }}
    >
      {/* ── Logo + título ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
        {/* Logo */}
        <div
          style={{
            flexShrink: 0,
            padding: "6px 14px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 0 20px rgba(59,130,246,0.2)",
          }}
        >
          <img
            src={resolvedLogo}
            alt="eConfia"
            style={{
              height: 32,
              width: "auto",
              display: "block",
              filter: "drop-shadow(0 0 6px rgba(255,255,255,0.2))",
            }}
          />
        </div>

        {/* Divisor */}
        <div
          style={{
            width: 1,
            height: 36,
            background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.15), transparent)",
            flexShrink: 0,
          }}
        />

        {/* Título */}
        <div style={{ minWidth: 0 }}>
          {title && (
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </h1>
          )}
          {subtitle && (
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.3, marginTop: 1 }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* ── Derecha: extra + usuario + logout ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* Contenido extra (notificaciones, botones, etc.) */}
        {right}

        {/* Chip de usuario */}
        {resolvedUsername && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              borderRadius: 20,
              background: roleColor,
              border: `1px solid ${roleBorder}`,
            }}
          >
            {/* Avatar inicial */}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: roleBorder,
                border: `1px solid ${roleBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: roleText,
                flexShrink: 0,
              }}
            >
              {resolvedUsername.charAt(0).toUpperCase()}
            </div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {resolvedUsername}
              </div>
              {roleLabel && (
                <div style={{ fontSize: 10, color: roleText, fontWeight: 500 }}>{roleLabel}</div>
              )}
            </div>
          </div>
        )}

        {/* Botón logout */}
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 12,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "rgba(252,165,165,0.8)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(239,68,68,0.18)";
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)";
            e.currentTarget.style.color = "#fca5a5";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "rgba(239,68,68,0.08)";
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)";
            e.currentTarget.style.color = "rgba(252,165,165,0.8)";
          }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Salir
        </button>
      </div>
    </div>
  );
}
