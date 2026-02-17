// src/pages/Login.jsx
import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [msg, setMsg] = useState("");
  const nav = useNavigate();

  const mountRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- escena / cámara ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 30;

    // --- renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0a1320, 1); // fondo azul oscuro visible
    Object.assign(renderer.domElement.style, {
      position: "fixed",
      inset: "0",
      zIndex: "-1",
    });
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- estrellas (más cantidad / más tamaño / color suave) ---
    const makeStars = (count, size, depth, opacity, color = 0x9fd3ff) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 0] = (Math.random() - 0.5) * 300;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 300;
        pos[i * 3 + 2] = -Math.random() * depth;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size,
        transparent: true,
        opacity,
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      return new THREE.Points(geo, mat);
    };

    const nearStars = makeStars(2200, 2.2, 140, 0.95);
    const midStars  = makeStars(2600, 1.6, 220, 0.85);
    const farStars  = makeStars(3200, 1.2, 320, 0.75, 0x7fbfff);

    scene.add(farStars, midStars, nearStars);

    // --- animación (parallax + “twinkle”) ---
    let t = 0;
    let raf = 0;
    const animate = () => {
      t += 0.0035;

      farStars.rotation.y += 0.0009;
      midStars.rotation.y += 0.0012;
      nearStars.rotation.y += 0.0016;

      camera.position.x = Math.sin(t) * 1.0;
      camera.position.y = Math.cos(t * 0.8) * 0.7;
      camera.lookAt(0, 0, -50);

      // “twinkle”
      nearStars.material.size = 2.2 + Math.sin(t * 3.0) * 0.25;
      midStars.material.size  = 1.6 + Math.cos(t * 2.3) * 0.2;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    // --- resize ---
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // --- cleanup ---
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      [farStars, midStars, nearStars].forEach((m) => {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

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
      setMsg(err.response?.data?.detail || "Credenciales inválidas");
    }
  };

  return (
    <div className="fixed inset-0">
      {/* Canvas 3D */}
      <div ref={mountRef} />

      {/* Overlay más transparente para que luzca el 3D */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_700px_at_20%_30%,rgba(255,255,255,0.05),transparent_65%),linear-gradient(180deg,rgba(11,18,32,0.6)_0%,rgba(10,15,26,0.6)_100%)]" />

      {/* Form centrado */}
      <main className="relative z-10 flex h-full w-full items-center justify-center p-4">
        <form
          onSubmit={login}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md"
        >
          {/* LOGO */}
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
            Ingresa con tu usuario y contraseña
          </p>

          <label className="mb-3 block text-sm text-white/80">Usuario</label>
          <input
            className="mb-5 w-full rounded-xl border border-white/10 bg-white/10 p-3 text-white placeholder-white/40 outline-none focus:border-white/30"
            placeholder="tu_usuario"
            value={u}
            onChange={(e) => setU(e.target.value)}
          />

          <label className="mb-3 block text-sm text-white/80">Contraseña</label>
          <input
            className="mb-6 w-full rounded-xl border border-white/10 bg-white/10 p-3 text-white placeholder-white/40 outline-none focus:border-white/30"
            placeholder="********"
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
          />

          <button className="w-full rounded-xl bg-blue-600/90 p-3 font-medium text-white transition hover:bg-blue-600">
            Entrar
          </button>

          {msg && (
            <div className="mt-3 text-center text-sm text-rose-300">{msg}</div>
          )}

          <div className="mt-8 text-center text-xs text-white/50">
            © {new Date().getFullYear()} eConfia · Seguridad & verificación
          </div>
        </form>
      </main>
    </div>
  );
}
