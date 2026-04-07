import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import ThreeBackground from "../components/ThreeBackground";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Ingresa tu correo electrónico.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/password-reset/", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Error al enviar el correo. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0">
      <ThreeBackground />
      <div className="absolute inset-0 z-0" style={{ background: "rgba(4,6,16,0.55)" }} />

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes checkPop { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }
        .fp-card { animation: fadeUp 0.45s ease both; }
      `}</style>

      <main className="relative z-10 flex h-full w-full items-center justify-center p-4">
        <div className="fp-card w-full max-w-sm">

          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <img
              src="/logo-econfia blanco.png"
              alt="eConfia"
              style={{
                height: 48,
                width: "auto",
                display: "inline-block",
                filter: "drop-shadow(0 0 10px rgba(255,255,255,0.2))",
              }}
            />
          </div>

          <div
            style={{
              background: "rgba(8,12,28,0.92)",
              border: "1.5px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: "40px 36px 32px",
              backdropFilter: "blur(32px)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            {sent ? (
              /* ── Estado: enviado ── */
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "rgba(34,197,94,0.15)",
                    border: "2px solid rgba(34,197,94,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                    animation: "checkPop 0.4s ease both",
                    boxShadow: "0 0 24px rgba(34,197,94,0.25)",
                  }}
                >
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#fff" }}>
                  ¡Correo enviado!
                </h2>
                <p style={{ margin: "0 0 28px", fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                  Si <strong style={{ color: "rgba(255,255,255,0.75)" }}>{email}</strong> está registrado,
                  recibirás un enlace para restablecer tu contraseña. Revisa también tu carpeta de spam.
                </p>
                <Link
                  to="/"
                  style={{
                    display: "inline-block",
                    padding: "11px 28px",
                    borderRadius: 12,
                    background: "rgba(59,130,246,0.15)",
                    border: "1px solid rgba(59,130,246,0.3)",
                    color: "#60a5fa",
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  ← Volver al inicio de sesión
                </Link>
              </div>
            ) : (
              /* ── Formulario ── */
              <>
                <div style={{ marginBottom: 28 }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "rgba(59,130,246,0.12)",
                      border: "1px solid rgba(59,130,246,0.25)",
                      borderRadius: 20,
                      padding: "4px 12px",
                      marginBottom: 14,
                    }}
                  >
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#60a5fa" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.08em" }}>
                      RECUPERAR ACCESO
                    </span>
                  </div>
                  <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
                    ¿Olvidaste tu contraseña?
                  </h1>
                  <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                    Ingresa tu correo y te enviaremos un enlace para restablecerla.
                  </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      color: focused ? "#60a5fa" : "rgba(255,255,255,0.5)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      transition: "color 0.2s",
                    }}>
                      Correo electrónico
                    </label>
                    <div style={{
                      position: "relative",
                      borderRadius: 14,
                      background: focused ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.04)",
                      border: focused ? "1.5px solid rgba(96,165,250,0.6)" : "1.5px solid rgba(255,255,255,0.08)",
                      boxShadow: focused ? "0 0 0 4px rgba(37,99,235,0.12)" : "none",
                      transition: "all 0.25s",
                    }}>
                      <span style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: focused ? "#60a5fa" : "rgba(255,255,255,0.3)", lineHeight: 0, transition: "color 0.2s" }}>
                        <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </span>
                      <input
                        type="email"
                        placeholder="tu@correo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        autoComplete="email"
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
                      />
                    </div>
                  </div>

                  {error && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                      borderRadius: 12, padding: "10px 14px", color: "#fca5a5", fontSize: 13,
                    }}>
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: 14,
                      border: "none",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: "#fff",
                      background: loading ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#6d28d9 100%)",
                      boxShadow: loading ? "none" : "0 6px 24px rgba(37,99,235,0.45)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      transition: "all 0.2s",
                    }}
                  >
                    {loading ? (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
                          <path d="M12 2a10 10 0 0110 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Enviando…
                      </>
                    ) : "Enviar enlace de recuperación"}
                  </button>
                </form>

                <div style={{ marginTop: 24, textAlign: "center" }}>
                  <Link to="/" style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
                    ← Volver al inicio de sesión
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
