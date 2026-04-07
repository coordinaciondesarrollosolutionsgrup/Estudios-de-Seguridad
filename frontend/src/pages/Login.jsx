import { useState } from "react";
import api from "../api/axios";
import { useNavigate, Link } from "react-router-dom";
import ThreeBackground from "../components/ThreeBackground";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [msg, setMsg] = useState("");
  const [focusU, setFocusU] = useState(false);
  const [focusP, setFocusP] = useState(false);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const login = async (e) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login/", {
        username: u.trim(),
        password: p,
      });
      localStorage.setItem("token", data.access);
      api.defaults.headers.common.Authorization = `Bearer ${data.access}`;
      const me = (await api.get("/api/auth/me/")).data;
      localStorage.setItem("role", me.rol || "");
      localStorage.setItem("username", me.username || "");
      localStorage.setItem("empresa_logo_url", me.empresa_logo_url || "");
      if (me.rol === "CANDIDATO") nav("/candidato");
      else if (me.rol === "ADMIN") nav("/admin");
      else if (me.rol === "ANALISTA") nav("/analista");
      else if (me.rol === "CLIENTE") nav("/cliente");
      else nav("/");
    } catch (err) {
      setMsg(err.response?.data?.detail || "Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0">
      <ThreeBackground />

      {/* Dark overlay to deepen background */}
      <div
        className="absolute inset-0 z-0"
        style={{ background: "rgba(4,6,16,0.55)" }}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          70%  { transform: scale(1.35); opacity: 0; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes float-orb {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-18px) scale(1.05); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-card { animation: fadeUp 0.5s ease both; }

        @media (max-width: 700px) {
          .login-split { flex-direction: column !important; }
          .login-brand { border-radius: 20px 20px 0 0 !important; padding: 32px 28px 24px !important; min-height: unset !important; }
          .login-form-panel { border-radius: 0 0 20px 20px !important; padding: 28px 24px 24px !important; }
          .brand-orb1, .brand-orb2 { display: none; }
        }
      `}</style>

      <main
        className="relative z-10 flex h-full w-full items-center justify-center"
        style={{ padding: "16px" }}
      >
        <div
          className="login-card"
          style={{
            width: "100%",
            maxWidth: 820,
            borderRadius: 24,
            overflow: "hidden",
            boxShadow:
              "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)",
          }}
        >
          <div
            className="login-split"
            style={{ display: "flex", minHeight: 520 }}
          >
            {/* ══════════ PANEL IZQUIERDO — MARCA ══════════ */}
            <div
              className="login-brand"
              style={{
                flex: "0 0 46%",
                position: "relative",
                overflow: "hidden",
                background:
                  "linear-gradient(145deg, #050c1f 0%, #0a1535 45%, #0d1d44 100%)",
                padding: "52px 44px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              {/* Decorative grid lines */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "linear-gradient(rgba(59,130,246,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.07) 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                  pointerEvents: "none",
                }}
              />

              {/* Glowing orbs */}
              <div
                className="brand-orb1"
                style={{
                  position: "absolute",
                  width: 280,
                  height: 280,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)",
                  top: -60,
                  right: -80,
                  animation: "float-orb 6s ease-in-out infinite",
                  pointerEvents: "none",
                }}
              />
              <div
                className="brand-orb2"
                style={{
                  position: "absolute",
                  width: 200,
                  height: 200,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)",
                  bottom: -40,
                  left: -40,
                  animation: "float-orb 8s ease-in-out infinite reverse",
                  pointerEvents: "none",
                }}
              />

              {/* Top: Logo */}
              <div style={{ position: "relative" }}>
                {/* Glow difuso detrás del logo */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 260,
                    height: 80,
                    borderRadius: "50%",
                    background: "radial-gradient(ellipse, rgba(59,130,246,0.35) 0%, transparent 70%)",
                    filter: "blur(18px)",
                    pointerEvents: "none",
                  }}
                />

                {/* Contenedor rectangular del logo */}
                <div
                  style={{
                    position: "relative",
                    marginBottom: 28,
                    padding: "18px 24px",
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow:
                      "0 0 40px rgba(59,130,246,0.25), 0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
                    backdropFilter: "blur(12px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Línea de brillo superior */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "20%",
                      right: "20%",
                      height: 1,
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                      borderRadius: 1,
                    }}
                  />
                  <img
                    src="/logo-econfia blanco.png"
                    alt="Econfia"
                    style={{
                      width: "100%",
                      maxWidth: 210,
                      height: "auto",
                      objectFit: "contain",
                      display: "block",
                      filter: "drop-shadow(0 0 12px rgba(255,255,255,0.25))",
                    }}
                  />
                </div>

                {/* Título */}
                <h2
                  style={{
                    margin: "0 0 6px",
                    fontSize: 26,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color: "#fff",
                    lineHeight: 1.1,
                  }}
                >
                  Estudios de{" "}
                  <span
                    style={{
                      background: "linear-gradient(90deg, #60a5fa, #a78bfa)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Seguridad
                  </span>
                </h2>

                {/* Tagline */}
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.4)",
                    letterSpacing: "0.03em",
                    lineHeight: 1.6,
                  }}
                >
                  Plataforma integral de seguridad<br />y verificación de candidatos
                </p>
              </div>

              {/* Bottom: Feature pills */}
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    width: "100%",
                    height: 1,
                    background:
                      "linear-gradient(90deg, rgba(59,130,246,0.5), rgba(139,92,246,0.3), transparent)",
                    marginBottom: 20,
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { icon: "🔒", text: "Acceso seguro y cifrado" },
                    { icon: "✅", text: "Verificación en tiempo real" },
                    { icon: "🛡️", text: "Datos protegidos" },
                  ].map((f) => (
                    <div
                      key={f.text}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: "rgba(59,130,246,0.08)",
                        border: "1px solid rgba(59,130,246,0.15)",
                      }}
                    >
                      <span style={{ fontSize: 15 }}>{f.icon}</span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ══════════ PANEL DERECHO — FORMULARIO ══════════ */}
            <div
              className="login-form-panel"
              style={{
                flex: 1,
                background: "rgba(8,12,28,0.92)",
                backdropFilter: "blur(32px)",
                padding: "52px 44px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                borderLeft: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Header */}
              <div style={{ marginBottom: 36 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(59,130,246,0.12)",
                    border: "1px solid rgba(59,130,246,0.25)",
                    borderRadius: 20,
                    padding: "4px 12px",
                    marginBottom: 16,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#22c55e",
                      boxShadow: "0 0 6px #22c55e",
                      display: "inline-block",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.08em" }}>
                    PORTAL SEGURO
                  </span>
                </div>

                <h1
                  style={{
                    margin: "0 0 6px",
                    fontSize: 30,
                    fontWeight: 800,
                    color: "#fff",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Iniciar sesión
                </h1>
                <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
                  Ingresa tus credenciales para continuar
                </p>
              </div>

              {/* Formulario */}
              <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Usuario */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      color: focusU ? "#60a5fa" : "rgba(255,255,255,0.5)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      transition: "color 0.2s",
                    }}
                  >
                    Usuario
                  </label>
                  <div
                    style={{
                      position: "relative",
                      borderRadius: 14,
                      background: focusU
                        ? "rgba(59,130,246,0.08)"
                        : "rgba(255,255,255,0.04)",
                      border: focusU
                        ? "1.5px solid rgba(96,165,250,0.6)"
                        : "1.5px solid rgba(255,255,255,0.08)",
                      boxShadow: focusU
                        ? "0 0 0 4px rgba(37,99,235,0.12), inset 0 1px 0 rgba(255,255,255,0.05)"
                        : "inset 0 1px 0 rgba(255,255,255,0.03)",
                      transition: "all 0.25s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 15,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: focusU ? "#60a5fa" : "rgba(255,255,255,0.3)",
                        transition: "color 0.2s",
                        lineHeight: 0,
                      }}
                    >
                      <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <input
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        padding: "14px 16px 14px 44px",
                        color: "#fff",
                        fontSize: 15,
                        boxSizing: "border-box",
                        fontWeight: 400,
                      }}
                      placeholder="nombre_usuario"
                      value={u}
                      onChange={(e) => setU(e.target.value)}
                      onFocus={() => setFocusU(true)}
                      onBlur={() => setFocusU(false)}
                      autoComplete="username"
                    />
                  </div>
                </div>

                {/* Contraseña */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      color: focusP ? "#60a5fa" : "rgba(255,255,255,0.5)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      transition: "color 0.2s",
                    }}
                  >
                    Contraseña
                  </label>
                  <div
                    style={{
                      position: "relative",
                      borderRadius: 14,
                      background: focusP
                        ? "rgba(59,130,246,0.08)"
                        : "rgba(255,255,255,0.04)",
                      border: focusP
                        ? "1.5px solid rgba(96,165,250,0.6)"
                        : "1.5px solid rgba(255,255,255,0.08)",
                      boxShadow: focusP
                        ? "0 0 0 4px rgba(37,99,235,0.12), inset 0 1px 0 rgba(255,255,255,0.05)"
                        : "inset 0 1px 0 rgba(255,255,255,0.03)",
                      transition: "all 0.25s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 15,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: focusP ? "#60a5fa" : "rgba(255,255,255,0.3)",
                        transition: "color 0.2s",
                        lineHeight: 0,
                      }}
                    >
                      <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </span>
                    <input
                      style={{
                        width: "100%",
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        padding: "14px 16px 14px 44px",
                        color: "#fff",
                        fontSize: 15,
                        boxSizing: "border-box",
                      }}
                      placeholder="••••••••••••"
                      type="password"
                      value={p}
                      onChange={(e) => setP(e.target.value)}
                      onFocus={() => setFocusP(true)}
                      onBlur={() => setFocusP(false)}
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {/* Error */}
                {msg && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      borderRadius: 12,
                      padding: "10px 14px",
                      color: "#fca5a5",
                      fontSize: 13,
                    }}
                  >
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    {msg}
                  </div>
                )}

                {/* Botón */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: 4,
                    width: "100%",
                    padding: "15px",
                    borderRadius: 14,
                    border: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "#fff",
                    position: "relative",
                    overflow: "hidden",
                    background: loading
                      ? "rgba(37,99,235,0.4)"
                      : "linear-gradient(135deg, #1d4ed8 0%, #2563eb 40%, #6d28d9 100%)",
                    boxShadow: loading
                      ? "none"
                      : "0 6px 28px rgba(37,99,235,0.5), 0 2px 8px rgba(0,0,0,0.3)",
                    transition: "opacity 0.2s, box-shadow 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  {/* Shimmer overlay */}
                  {!loading && (
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
                        backgroundSize: "200% auto",
                        animation: "shimmer 2.5s linear infinite",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  {loading ? (
                    <>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ animation: "spin 0.8s linear infinite" }}
                      >
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
                        <path d="M12 2a10 10 0 0110 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Verificando…
                    </>
                  ) : (
                    <>
                      Ingresar
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>

                {/* Olvidé mi contraseña */}
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <Link
                    to="/forgot-password"
                    style={{
                      fontSize: 13,
                      color: "rgba(96,165,250,0.7)",
                      textDecoration: "none",
                      fontWeight: 500,
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={e => e.target.style.color = "#60a5fa"}
                    onMouseLeave={e => e.target.style.color = "rgba(96,165,250,0.7)"}
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              </form>

              {/* Footer */}
              <div
                style={{
                  marginTop: 32,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.2)" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: "0.05em" }}>
                  © 2026 eConfia — Seguridad y Verificación
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
