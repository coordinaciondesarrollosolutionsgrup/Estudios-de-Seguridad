import { useState } from "react";
import api from "../api/axios";
import { useNavigate } from "react-router-dom";
import ThreeBackground from "../components/ThreeBackground";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [msg, setMsg] = useState("");
  const nav = useNavigate();

  const login = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const { data } = await api.post("/api/auth/login/", {
        username: u.trim(),
        password: p,
      });
      localStorage.setItem("token", data.access);
      api.defaults.headers.common.Authorization = `Bearer ${data.access}`;
      const me = (await api.get("/api/auth/me/")).data;
      localStorage.setItem("role", me.rol || "");
      if (me.rol === "CANDIDATO") nav("/candidato");
      else if (me.rol === "ANALISTA" || me.rol === "ADMIN") nav("/analista");
      else if (me.rol === "CLIENTE") nav("/cliente");
      else nav("/");
    } catch (err) {
      setMsg(err.response?.data?.detail || "Credenciales invalidas");
    }
  };

  return (
    <div className="fixed inset-0">
      <ThreeBackground />

      <main className="relative z-10 flex h-full w-full items-center justify-center p-4">
        <form
          onSubmit={login}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md"
        >
          <div className="mb-6 flex w-full justify-center">
            <img
              src="/logo_econfia.png"
              alt="eConfia"
              className="h-11 w-auto opacity-90"
            />
          </div>

          <h1 className="mb-1 text-5xl font-extrabold tracking-tight text-white">
            Bienvenido
          </h1>
          <p className="mb-8 text-sm text-white/70">
            Ingresa con tu usuario y contrasena
          </p>

          <label className="mb-3 block text-sm text-white/80">Usuario</label>
          <input
            className="mb-5 w-full rounded-xl border border-white/10 bg-white/10 p-3 text-white placeholder-white/40 outline-none focus:border-white/30"
            placeholder="tu_usuario"
            value={u}
            onChange={(e) => setU(e.target.value)}
          />

          <label className="mb-3 block text-sm text-white/80">Contrasena</label>
          <input
            className="mb-6 w-full rounded-xl border border-white/10 bg-white/10 p-3 text-white placeholder-white/40 outline-none focus:border-white/30"
            placeholder="********"
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
          />

          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600/90 p-3 font-medium text-white transition hover:bg-blue-600"
          >
            Entrar
          </button>

          {msg && (
            <div className="mt-3 text-center text-sm text-rose-300">{msg}</div>
          )}

          <div className="mt-8 text-center text-xs text-white/50">
            2026 eConfia - Seguridad y verificacion
          </div>
        </form>
      </main>
    </div>
  );
}
