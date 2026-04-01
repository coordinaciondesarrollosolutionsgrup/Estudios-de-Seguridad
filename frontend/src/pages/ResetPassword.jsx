import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import ThreeBackground from "../components/ThreeBackground";

export default function ResetPassword() {
  const { uid, token } = useParams();
  const nav = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [focusNew, setFocusNew] = useState(false);
  const [focusConfirm, setFocusConfirm] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Strength indicator
  const strength = (() => {
    if (!newPassword) return 0;
    let s = 0;
    if (newPassword.length >= 8) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    return s;
  })();
  const strengthLabel = ["", "Débil", "Regular", "Buena", "Fuerte"][strength];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#3b82f6", "#22c55e"][strength];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/auth/password-reset/confirm/", {
        uid,
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setSuccess(true);
      setTimeout(() => nav("/"), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "El enlace es inválido o ha expirado.");
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
        .rp-card { animation: fadeUp 0.45s ease both; }
      `}</style>

      <main className="relative z-10 flex h-full w-full items-center justify-center p-4">
        <div className="rp-card w-full max-w-sm">

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
            {success ? (
              /* ── Estado: éxito ── */
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px", animation: "checkPop 0.4s ease both",
                  boxShadow: "0 0 24px rgba(34,197,94,0.25)",
                }}>
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#fff" }}>
                  ¡Contraseña actualizada!
                </h2>
                <p style={{ margin: "0 0 6px", fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                  Tu contraseña fue restablecida correctamente.
                </p>
                <p style={{ margin: "0 0 24px", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
                  Redirigiendo al inicio de sesión…
                </p>
                <Link to="/" style={{
                  display: "inline-block", padding: "11px 28px", borderRadius: 12,
                  background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                  color: "#60a5fa", fontSize: 14, fontWeight: 600, textDecoration: "none",
                }}>
                  Ir al inicio de sesión
                </Link>
              </div>
            ) : (
              /* ── Formulario ── */
              <>
                <div style={{ marginBottom: 28 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)",
                    borderRadius: 20, padding: "4px 12px", marginBottom: 14,
                  }}>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#60a5fa" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.08em" }}>
                      NUEVA CONTRASEÑA
                    </span>
                  </div>
                  <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
                    Restablecer contraseña
                  </h1>
                  <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                    Crea una contraseña segura para tu cuenta.
                  </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                  {/* Nueva contraseña */}
                  <div>
                    <label style={{
                      display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                      color: focusNew ? "#60a5fa" : "rgba(255,255,255,0.5)",
                      marginBottom: 8, textTransform: "uppercase", transition: "color 0.2s",
                    }}>
                      Nueva contraseña
                    </label>
                    <div style={{
                      position: "relative", borderRadius: 14,
                      background: focusNew ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.04)",
                      border: focusNew ? "1.5px solid rgba(96,165,250,0.6)" : "1.5px solid rgba(255,255,255,0.08)",
                      boxShadow: focusNew ? "0 0 0 4px rgba(37,99,235,0.12)" : "none",
                      transition: "all 0.25s",
                    }}>
                      <span style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: focusNew ? "#60a5fa" : "rgba(255,255,255,0.3)", lineHeight: 0, transition: "color 0.2s" }}>
                        <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                      <input
                        type={showNew ? "text" : "password"}
                        placeholder="Mínimo 8 caracteres"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        onFocus={() => setFocusNew(true)}
                        onBlur={() => setFocusNew(false)}
                        style={{
                          width: "100%", background: "transparent", border: "none", outline: "none",
                          padding: "14px 44px 14px 44px", color: "#fff", fontSize: 15, boxSizing: "border-box",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(v => !v)}
                        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", lineHeight: 0, padding: 0 }}
                      >
                        {showNew ? (
                          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {/* Barra de fortaleza */}
                    {newPassword && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} style={{
                              flex: 1, height: 3, borderRadius: 2,
                              background: i <= strength ? strengthColor : "rgba(255,255,255,0.1)",
                              transition: "background 0.3s",
                            }} />
                          ))}
                        </div>
                        <span style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>
                          {strengthLabel}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirmar contraseña */}
                  <div>
                    <label style={{
                      display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                      color: focusConfirm ? "#60a5fa" : "rgba(255,255,255,0.5)",
                      marginBottom: 8, textTransform: "uppercase", transition: "color 0.2s",
                    }}>
                      Confirmar contraseña
                    </label>
                    <div style={{
                      position: "relative", borderRadius: 14,
                      background: focusConfirm ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.04)",
                      border: confirmPassword && confirmPassword !== newPassword
                        ? "1.5px solid rgba(239,68,68,0.6)"
                        : focusConfirm
                          ? "1.5px solid rgba(96,165,250,0.6)"
                          : "1.5px solid rgba(255,255,255,0.08)",
                      boxShadow: focusConfirm ? "0 0 0 4px rgba(37,99,235,0.12)" : "none",
                      transition: "all 0.25s",
                    }}>
                      <span style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: focusConfirm ? "#60a5fa" : "rgba(255,255,255,0.3)", lineHeight: 0, transition: "color 0.2s" }}>
                        <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                      <input
                        type={showConfirm ? "text" : "password"}
                        placeholder="Repite la contraseña"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onFocus={() => setFocusConfirm(true)}
                        onBlur={() => setFocusConfirm(false)}
                        style={{
                          width: "100%", background: "transparent", border: "none", outline: "none",
                          padding: "14px 44px 14px 44px", color: "#fff", fontSize: 15, boxSizing: "border-box",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", lineHeight: 0, padding: 0 }}
                      >
                        {showConfirm ? (
                          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#f87171" }}>Las contraseñas no coinciden</p>
                    )}
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
                      width: "100%", padding: "14px", borderRadius: 14, border: "none",
                      cursor: loading ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 700,
                      letterSpacing: "0.06em", color: "#fff",
                      background: loading ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#6d28d9 100%)",
                      boxShadow: loading ? "none" : "0 6px 24px rgba(37,99,235,0.45)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s",
                    }}
                  >
                    {loading ? (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
                          <path d="M12 2a10 10 0 0110 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Guardando…
                      </>
                    ) : "Guardar nueva contraseña"}
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
