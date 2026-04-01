// src/pages/AdminDashboard.jsx
import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";
import AppNavbar from "../components/AppNavbar";
import ThreeBackground from "../components/ThreeBackground";
import { useToast } from "../components/Toast";

/* --- helpers visuales --- */
const estadoColor = (e) => {
  switch ((e || "").toUpperCase()) {
    case "EN_CAPTURA":  return "bg-violet-500/15 text-violet-200 ring-violet-400/25";
    case "EN_REVISION": return "bg-blue-500/15 text-blue-200 ring-blue-400/25";
    case "DEVUELTO":    return "bg-amber-500/15 text-amber-200 ring-amber-400/25";
    case "CERRADO":     return "bg-slate-500/15 text-slate-200 ring-slate-400/25";
    default:            return "bg-white/10 text-white/70 ring-white/15";
  }
};
const rolColor = (r) => {
  switch ((r || "").toUpperCase()) {
    case "ADMIN":     return "bg-violet-500/15 text-violet-200 ring-violet-400/25";
    case "ANALISTA":  return "bg-blue-500/15 text-blue-200 ring-blue-400/25";
    case "CLIENTE":   return "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25";
    case "CANDIDATO": return "bg-amber-500/15 text-amber-200 ring-amber-400/25";
    default:          return "bg-white/10 text-white/70 ring-white/15";
  }
};
const Badge = ({ cls, children }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
    {children}
  </span>
);

const inputCls = "w-full rounded-xl border border-white/10 bg-white/10 text-white placeholder-white/40 px-3 py-2 text-sm outline-none focus:border-white/30";
const btnPrimary = "rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white px-4 py-2 text-sm font-semibold transition disabled:opacity-60";
const btnGhost = "rounded-xl border border-white/15 hover:bg-white/5 text-white/80 px-4 py-2 text-sm transition";
const btnDanger = "rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white px-3 py-1.5 text-xs font-semibold transition";
const btnSm = "rounded-lg border border-white/15 hover:bg-white/10 text-white/80 px-3 py-1 text-xs transition";

/* --- TABS del panel --- */
const TABS = [
  { key: "metricas",  label: "Métricas" },
  { key: "estudios",  label: "Estudios" },
  { key: "usuarios",  label: "Usuarios" },
  { key: "empresas",  label: "Empresas" },
];

/* ============================================================ */
export default function AdminDashboard() {
  const toast = useToast();
  const [tab, setTab] = useState("metricas");

  /* --- métricas --- */
  const [metricas, setMetricas] = useState(null);

  /* --- estudios --- */
  const [estudios, setEstudios] = useState([]);
  const [estudiosLoading, setEstudiosLoading] = useState(false);
  const [fEstudios, setFEstudios] = useState({ estado: "", empresa: "", q: "" });
  const [analistas, setAnalistas] = useState([]);
  const [asignandoId, setAsignandoId] = useState(null);
  const [asignarModal, setAsignarModal] = useState({ open: false, estudio: null, analistaId: "" });

  /* --- usuarios --- */
  const [usuarios, setUsuarios] = useState([]);
  const [usuariosLoading, setUsuariosLoading] = useState(false);
  const [fUsuarios, setFUsuarios] = useState({ rol: "", empresa: "", q: "" });
  const [empresasList, setEmpresasList] = useState([]);
  const [usuarioModal, setUsuarioModal] = useState({ open: false, mode: "create", data: {} });

  /* --- empresas --- */
  const [empresas, setEmpresas] = useState([]);
  const [empresasLoading, setEmpresasLoading] = useState(false);
  const [fEmpresas, setFEmpresas] = useState({ q: "" });
  const [empresaModal, setEmpresaModal] = useState({ open: false, mode: "create", data: {} });
  const [empresaLogoFile, setEmpresaLogoFile] = useState(null);
  const [empresaLogoPreview, setEmpresaLogoPreview] = useState("");

  /* --------------- loaders --------------- */
  const loadMetricas = useCallback(async () => {
    try {
      const { data } = await api.get("/api/auth/admin/metricas/");
      setMetricas(data);
    } catch {
      toast.error("No se pudieron cargar las métricas.");
    }
  }, []);

  const loadEstudios = useCallback(async () => {
    setEstudiosLoading(true);
    try {
      const params = new URLSearchParams();
      if (fEstudios.estado) params.set("estado", fEstudios.estado);
      if (fEstudios.empresa) params.set("empresa", fEstudios.empresa);
      if (fEstudios.q) params.set("q", fEstudios.q);
      const { data } = await api.get(`/api/estudios/?${params}`);
      setEstudios(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar los estudios.");
    } finally {
      setEstudiosLoading(false);
    }
  }, [fEstudios]);

  const loadUsuarios = useCallback(async () => {
    setUsuariosLoading(true);
    try {
      const params = new URLSearchParams();
      if (fUsuarios.rol) params.set("rol", fUsuarios.rol);
      if (fUsuarios.empresa) params.set("empresa", fUsuarios.empresa);
      if (fUsuarios.q) params.set("q", fUsuarios.q);
      const { data } = await api.get(`/api/auth/admin/usuarios/?${params}`);
      setUsuarios(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar los usuarios.");
    } finally {
      setUsuariosLoading(false);
    }
  }, [fUsuarios]);

  const loadEmpresas = useCallback(async () => {
    setEmpresasLoading(true);
    try {
      const params = new URLSearchParams();
      if (fEmpresas.q) params.set("q", fEmpresas.q);
      const { data } = await api.get(`/api/auth/admin/empresas/?${params}`);
      const list = Array.isArray(data) ? data : [];
      setEmpresas(list);
      setEmpresasList(list);
    } catch {
      toast.error("No se pudieron cargar las empresas.");
    } finally {
      setEmpresasLoading(false);
    }
  }, [fEmpresas]);

  const loadAnalistas = useCallback(async () => {
    try {
      const { data } = await api.get("/api/auth/admin/usuarios/?rol=ANALISTA");
      setAnalistas(Array.isArray(data) ? data : []);
    } catch { /* silencioso */ }
  }, []);

  /* --------------- efectos --------------- */
  useEffect(() => { loadMetricas(); loadEmpresas(); loadAnalistas(); }, []);
  useEffect(() => { if (tab === "estudios") loadEstudios(); }, [tab]);
  useEffect(() => { if (tab === "usuarios") loadUsuarios(); }, [tab]);
  useEffect(() => { if (tab === "empresas") loadEmpresas(); }, [tab]);

  /* --- usuarios --- */
  const openCrearUsuario = () =>
    setUsuarioModal({ open: true, mode: "create", data: { rol: "ANALISTA", is_active: true } });

  const openEditarUsuario = (u) =>
    setUsuarioModal({ open: true, mode: "edit", data: { ...u, password: "" } });

  const submitUsuario = async () => {
    const { mode, data: d } = usuarioModal;
    try {
      if (mode === "create") {
        await api.post("/api/auth/admin/usuarios/", d);
        toast.success("Usuario creado.");
      } else {
        await api.patch(`/api/auth/admin/usuarios/${d.id}/`, d);
        toast.success("Usuario actualizado.");
      }
      setUsuarioModal({ open: false, mode: "create", data: {} });
      loadUsuarios();
      loadAnalistas();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al guardar usuario.");
    }
  };

  const eliminarUsuario = async (id) => {
    if (!confirm("¿Eliminar este usuario? Esta acción no se puede deshacer.")) return;
    try {
      await api.delete(`/api/auth/admin/usuarios/${id}/`);
      toast.success("Usuario eliminado.");
      loadUsuarios();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo eliminar.");
    }
  };

  /* --- empresas --- */
  const openCrearEmpresa = () => {
    setEmpresaModal({ open: true, mode: "create", data: { logo_url: "" } });
    setEmpresaLogoFile(null);
    setEmpresaLogoPreview("");
  };

  const openEditarEmpresa = (e) => {
    setEmpresaModal({ open: true, mode: "edit", data: { ...e } });
    setEmpresaLogoFile(null);
    setEmpresaLogoPreview(e.logo_url || "");
  };

  const submitEmpresa = async () => {
    const { mode, data: d } = empresaModal;
    try {
      const payload = new FormData();
      payload.append("nombre", d.nombre || "");
      payload.append("nit", d.nit || "");
      payload.append("email_contacto", d.email_contacto || "");
      if (empresaLogoFile) {
        payload.append("logo_file", empresaLogoFile);
      }
      if (mode === "create") {
        await api.post("/api/auth/admin/empresas/", payload);
        toast.success("Empresa creada.");
      } else {
        await api.patch(`/api/auth/admin/empresas/${d.id}/`, payload);
        toast.success("Empresa actualizada.");
      }
      setEmpresaModal({ open: false, mode: "create", data: {} });
      setEmpresaLogoFile(null);
      setEmpresaLogoPreview("");
      loadEmpresas();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error al guardar empresa.");
    }
  };

  const eliminarEmpresa = async (id) => {
    if (!confirm("¿Eliminar esta empresa? Se desvinculará de sus usuarios.")) return;
    try {
      await api.delete(`/api/auth/admin/empresas/${id}/`);
      toast.success("Empresa eliminada.");
      loadEmpresas();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo eliminar.");
    }
  };

  /* --------------- asignar analista --------------- */
  const confirmarAsignacion = async () => {
    const { estudio, analistaId } = asignarModal;
    if (!analistaId) return;
    setAsignandoId(estudio.id);
    try {
      await api.post(`/api/auth/admin/estudios/${estudio.id}/asignar-analista/`, {
        analista_id: analistaId,
      });
      toast.success("Analista asignado.");
      setAsignarModal({ open: false, estudio: null, analistaId: "" });
      loadEstudios();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo asignar.");
    } finally {
      setAsignandoId(null);
    }
  };

  /* --------------- render --------------- */
  return (
    <div className="relative min-h-screen text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(1200px_700px_at_20%_20%,rgba(167,139,250,0.08),transparent_60%),radial-gradient(900px_500px_at_80%_80%,rgba(59,130,246,0.08),transparent_60%),linear-gradient(180deg,#0b1220_0%,#0a0f1a_100%)]" />
      <ThreeBackground />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <AppNavbar
          title="Panel de administración"
          subtitle="Gestión global del sistema eConfia."
        />

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition border-2
                bg-slate-700 text-white/90
                ${tab === key
                  ? "border-violet-500 shadow-[0_0_10px_2px_rgba(139,92,246,0.4)] bg-slate-800 text-violet-200"
                  : "border-slate-600 hover:border-violet-400 hover:text-violet-200"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* --- MÉTRICAS --- */}
        {tab === "metricas" && (
          <div className="space-y-6">
            {!metricas ? (
              <div className="text-sm text-white/60">Cargando...</div>
            ) : (
              <>
                {/* Cards resumen */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Estudios", value: metricas.total_estudios, color: "from-blue-600/30 to-blue-600/10", icon: "•" },
                    { label: "Empresas", value: metricas.total_empresas, color: "from-emerald-600/30 to-emerald-600/10", icon: "•" },
                    { label: "Usuarios", value: metricas.total_usuarios, color: "from-violet-600/30 to-violet-600/10", icon: "•" },
                    { label: "Sin analista", value: metricas.estudios_sin_analista, color: "from-amber-600/30 to-amber-600/10", icon: "•" },
                  ].map(({ label, value, color, icon }) => (
                    <div key={label} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${color} p-5 shadow-xl backdrop-blur-md`}>
                      <div className="text-2xl mb-1">{icon}</div>
                      <div className="text-3xl font-bold">{value}</div>
                      <div className="text-sm text-white/60 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Estudios por estado */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                    <h3 className="font-semibold text-white/90 mb-4">Estudios por estado</h3>
                    <div className="space-y-3">
                      {(metricas.por_estado || []).map(({ estado, total }) => {
                        const pct = metricas.total_estudios ? Math.round((total / metricas.total_estudios) * 100) : 0;
                        return (
                          <div key={estado}>
                            <div className="flex justify-between text-sm mb-1">
                              <Badge cls={estadoColor(estado)}>{estado}</Badge>
                              <span className="text-white/70">{total} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-2 bg-blue-500/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Usuarios por rol */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                    <h3 className="font-semibold text-white/90 mb-4">Usuarios por rol</h3>
                    <div className="space-y-3">
                      {(metricas.por_rol || []).map(({ rol, total }) => {
                        const pct = metricas.total_usuarios ? Math.round((total / metricas.total_usuarios) * 100) : 0;
                        return (
                          <div key={rol}>
                            <div className="flex justify-between text-sm mb-1">
                              <Badge cls={rolColor(rol)}>{rol}</Badge>
                              <span className="text-white/70">{total} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-2 bg-violet-500/60 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* --- estudios --- */}
        {tab === "estudios" && (
          <div className="space-y-4">
            {/* Filtros */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <div className="grid md:grid-cols-4 gap-3">
                <input
                  className={inputCls}
                  placeholder="Buscar candidato / cédula..."
                  value={fEstudios.q}
                  onChange={(e) => setFEstudios((s) => ({ ...s, q: e.target.value }))}
                />
                <select
                  className={inputCls}
                  value={fEstudios.estado}
                  onChange={(e) => setFEstudios((s) => ({ ...s, estado: e.target.value }))}
                >
                  <option value="">Estado (todos)</option>
                  <option value="EN_CAPTURA">EN_CAPTURA</option>
                  <option value="EN_REVISION">EN_REVISION</option>
                  <option value="DEVUELTO">DEVUELTO</option>
                  <option value="CERRADO">CERRADO</option>
                </select>
                <select
                  className={inputCls}
                  value={fEstudios.empresa}
                  onChange={(e) => setFEstudios((s) => ({ ...s, empresa: e.target.value }))}
                >
                  <option value="">Empresa (todas)</option>
                  {empresasList.map((em) => (
                    <option key={em.id} value={em.id}>{em.nombre}</option>
                  ))}
                </select>
                <button className={btnPrimary} onClick={loadEstudios}>Buscar</button>
              </div>
            </div>

            {/* Tabla estudios */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-x-auto">
              {estudiosLoading ? (
                <div className="p-4 text-sm text-white/60">Cargando...</div>
              ) : estudios.length === 0 ? (
                <div className="p-4 text-sm text-white/60">Sin resultados.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50 text-xs uppercase">
                      <th className="text-left px-4 py-3">#</th>
                      <th className="text-left px-4 py-3">Candidato</th>
                      <th className="text-left px-4 py-3">Empresa</th>
                      <th className="text-left px-4 py-3">Estado</th>
                      <th className="text-left px-4 py-3">Analista</th>
                      <th className="text-left px-4 py-3">Progreso</th>
                      <th className="text-left px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estudios.map((est) => {
                      const candidato = est.candidato || {};
                      const nombre = [candidato.nombre, candidato.apellido].filter(Boolean).join(" ") || "-";
                      const empresa = est.empresa?.nombre || "-";
                      const analistaObj = est.analista;
                      const analistaNombre = analistaObj
                        ? (analistaObj.nombre || analistaObj.username || "")
                        : null;
                      return (
                        <tr key={est.id} className="border-b border-white/5 hover:bg-white/[0.03] transition">
                          <td className="px-4 py-3 font-semibold text-white/80">#{est.id}</td>
                          <td className="px-4 py-3">{nombre}</td>
                          <td className="px-4 py-3 text-white/70">{empresa}</td>
                          <td className="px-4 py-3">
                            <Badge cls={estadoColor(est.estado)}>{est.estado}</Badge>
                          </td>
                          <td className="px-4 py-3 text-white/70">
                            {analistaNombre || <span className="text-amber-400/80 text-xs">Sin asignar</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-1.5 bg-blue-500/60 rounded-full" style={{ width: `${est.progreso || 0}%` }} />
                              </div>
                              <span className="text-xs text-white/50">{Math.round(est.progreso || 0)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setAsignarModal({ open: true, estudio: est, analistaId: "" })}
                              disabled={asignandoId === est.id}
                              className={`${btnSm} text-indigo-300 border-indigo-400/25`}
                            >
                              Asignar analista
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* --- usuarios --- */}
        {tab === "usuarios" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Gestión de usuarios</h2>
              <button className={btnPrimary} onClick={openCrearUsuario}>+ Nuevo usuario</button>
            </div>

            {/* Filtros */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <div className="grid md:grid-cols-4 gap-3">
                <input
                  className={inputCls}
                  placeholder="Buscar por nombre / email..."
                  value={fUsuarios.q}
                  onChange={(e) => setFUsuarios((s) => ({ ...s, q: e.target.value }))}
                />
                <select
                  className={inputCls}
                  value={fUsuarios.rol}
                  onChange={(e) => setFUsuarios((s) => ({ ...s, rol: e.target.value }))}
                >
                  <option value="">Rol (todos)</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="ANALISTA">ANALISTA</option>
                  <option value="CLIENTE">CLIENTE</option>
                  <option value="CANDIDATO">CANDIDATO</option>
                </select>
                <select
                  className={inputCls}
                  value={fUsuarios.empresa}
                  onChange={(e) => setFUsuarios((s) => ({ ...s, empresa: e.target.value }))}
                >
                  <option value="">Empresa (todas)</option>
                  {empresasList.map((em) => (
                    <option key={em.id} value={em.id}>{em.nombre}</option>
                  ))}
                </select>
                <button className={btnPrimary} onClick={loadUsuarios}>Buscar</button>
              </div>
            </div>

            {/* Tabla usuarios */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-x-auto">
              {usuariosLoading ? (
                <div className="p-4 text-sm text-white/60">Cargando...</div>
              ) : usuarios.length === 0 ? (
                <div className="p-4 text-sm text-white/60">Sin usuarios.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50 text-xs uppercase">
                      <th className="text-left px-4 py-3">Usuario</th>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Rol</th>
                      <th className="text-left px-4 py-3">Empresa</th>
                      <th className="text-left px-4 py-3">Estado</th>
                      <th className="text-left px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.03] transition">
                        <td className="px-4 py-3">
                          <div className="font-medium">{u.username}</div>
                          {(u.first_name || u.last_name) && (
                            <div className="text-xs text-white/50">{[u.first_name, u.last_name].filter(Boolean).join(" ")}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">{u.email || "-"}</td>
                        <td className="px-4 py-3">
                          <Badge cls={rolColor(u.rol)}>{u.rol}</Badge>
                        </td>
                        <td className="px-4 py-3 text-white/70">{u.empresa_nombre || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${u.is_active ? "text-emerald-400" : "text-rose-400"}`}>
                            {u.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button className={btnSm} onClick={() => openEditarUsuario(u)}>Editar</button>
                            <button className={btnDanger} onClick={() => eliminarUsuario(u.id)}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* --- empresas --- */}
        {tab === "empresas" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Gestión de empresas</h2>
              <button className={btnPrimary} onClick={openCrearEmpresa}>+ Nueva empresa</button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
              <div className="grid md:grid-cols-3 gap-3">
                <input
                  className={inputCls}
                  placeholder="Buscar por nombre / NIT..."
                  value={fEmpresas.q}
                  onChange={(e) => setFEmpresas({ q: e.target.value })}
                />
                <button className={btnPrimary} onClick={loadEmpresas}>Buscar</button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-x-auto">
              {empresasLoading ? (
                <div className="p-4 text-sm text-white/60">Cargando...</div>
              ) : empresas.length === 0 ? (
                <div className="p-4 text-sm text-white/60">Sin empresas.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50 text-xs uppercase">
                      <th className="text-left px-4 py-3">Nombre</th>
                      <th className="text-left px-4 py-3">NIT</th>
                      <th className="text-left px-4 py-3">Email contacto</th>
                      <th className="text-left px-4 py-3">Logo</th>
                      <th className="text-left px-4 py-3">Usuarios</th>
                      <th className="text-left px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresas.map((e) => (
                      <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.03] transition">
                        <td className="px-4 py-3 font-medium">{e.nombre}</td>
                        <td className="px-4 py-3 text-white/70">{e.nit || "-"}</td>
                        <td className="px-4 py-3 text-white/70">{e.email_contacto || "-"}</td>
                        <td className="px-4 py-3 text-white/70">
                          {e.logo_url ? (
                            <a
                              href={e.logo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-300 hover:text-cyan-200 underline"
                            >
                              Configurado
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">{e.num_usuarios}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button className={btnSm} onClick={() => openEditarEmpresa(e)}>Editar</button>
                            <button className={btnDanger} onClick={() => eliminarEmpresa(e.id)}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --------------- asignar analista --------------- */}
      {asignarModal.open && (
        <Modal title="Asignar analista" onClose={() => setAsignarModal({ open: false, estudio: null, analistaId: "" })}>
          {(() => {
            const est = asignarModal.estudio;
            const c = est?.candidato || {};
            const candidatoNombre = [c.nombre, c.apellido].filter(Boolean).join(" ") || "-";
            const analistaActual = est?.analista;
            return (
              <div className="mb-4 space-y-1">
                <p className="text-sm text-white/80">
                  Estudio <b>#{est?.id}</b> - {candidatoNombre}
                </p>
                <p className="text-xs text-white/50">
                  Empresa: <span className="text-white/70">{est?.empresa?.nombre || "-"}</span>
                </p>
                {analistaActual ? (
                  <p className="text-xs text-amber-300/80">
                    Analista actual: <b>{analistaActual.nombre || analistaActual.username}</b>
                  </p>
                ) : (
                  <p className="text-xs text-rose-300/80">Sin analista asignado</p>
                )}
              </div>
            );
          })()}
          <select
            className={inputCls}
            value={asignarModal.analistaId}
            onChange={(e) => setAsignarModal((s) => ({ ...s, analistaId: e.target.value }))}
          >
            <option value="">Selecciona un analista...</option>
            {analistas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username}{a.first_name ? ` - ${a.first_name} ${a.last_name || ""}`.trim() : ""}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-3 mt-4">
            <button className={btnGhost} onClick={() => setAsignarModal({ open: false, estudio: null, analistaId: "" })}>
              Cancelar
            </button>
            <button
              className={btnPrimary}
              disabled={!asignarModal.analistaId}
              onClick={confirmarAsignacion}
            >
              Confirmar asignación
            </button>
          </div>
        </Modal>
      )}

      {/* == MODAL: Crear / Editar usuario == */}
      {usuarioModal.open && (
        <Modal
          title={usuarioModal.mode === "create" ? "Nuevo usuario" : "Editar usuario"}
          onClose={() => setUsuarioModal({ open: false, mode: "create", data: {} })}
        >
          <div className="space-y-3">
            <FormRow label="Username">
              <input
                className={inputCls}
                value={usuarioModal.data.username || ""}
                onChange={(e) => setUsuarioModal((s) => ({ ...s, data: { ...s.data, username: e.target.value } }))}
                disabled={usuarioModal.mode === "edit"}
              />
            </FormRow>
            <FormRow label="Email">
              <input
                className={inputCls}
                type="email"
                value={usuarioModal.data.email || ""}
                onChange={(e) => setUsuarioModal((s) => ({ ...s, data: { ...s.data, email: e.target.value } }))}
              />
            </FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Nombre">
                <input
                  className={inputCls}
                  value={usuarioModal.data.first_name || ""}
                  onChange={(e) => setUsuarioModal((s) => ({ ...s, data: { ...s.data, first_name: e.target.value } }))}
                />
              </FormRow>
              <FormRow label="Apellido">
                <input
                  className={inputCls}
                  value={usuarioModal.data.last_name || ""}
                  onChange={(e) => setUsuarioModal((s) => ({ ...s, data: { ...s.data, last_name: e.target.value } }))}
                />
              </FormRow>
            </div>
            <FormRow label="Rol">
              <select
                className={inputCls}
                value={usuarioModal.data.rol || "ANALISTA"}
                onChange={(e) => setUsuarioModal((s) => ({ ...s, data: { ...s.data, rol: e.target.value } }))}
              >
                <option value="ADMIN">ADMIN</option>
                <option value="ANALISTA">ANALISTA</option>
                <option value="CLIENTE">CLIENTE</option>
                <option value="CANDIDATO">CANDIDATO</option>
              </select>
            </FormRow>
            <FormRow label="Empresa">
              <select
                className={inputCls}
                value={usuarioModal.data.empresa_id || ""}
                onChange={(e) => setUsuarioModal((s) => ({ ...s, data: { ...s.data, empresa_id: e.target.value || null } }))}
              >
                <option value="">Sin empresa</option>
                {empresasList.map((em) => (
                  <option key={em.id} value={em.id}>{em.nombre}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label={usuarioModal.mode === "edit" ? "Nueva contraseña (opcional)" : "Contraseña"}>
              <input
                className={inputCls}
                type="password"
                placeholder={usuarioModal.mode === "edit" ? "Dejar vacío para no cambiar" : ""}
                value={usuarioModal.data.password || ""}
                onChange={(e) => setUsuarioModal((s) => ({ ...s, data: { ...s.data, password: e.target.value } }))}
              />
            </FormRow>
            {usuarioModal.mode === "edit" && (
              <FormRow label="Estado">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-emerald-500 w-4 h-4"
                    checked={!!usuarioModal.data.is_active}
                    onChange={(e) => setUsuarioModal((s) => ({ ...s, data: { ...s.data, is_active: e.target.checked } }))}
                  />
                  <span className="text-sm text-white/80">Activo</span>
                </label>
              </FormRow>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <button className={btnGhost} onClick={() => setUsuarioModal({ open: false, mode: "create", data: {} })}>
              Cancelar
            </button>
            <button className={btnPrimary} onClick={submitUsuario}>
              {usuarioModal.mode === "create" ? "Crear" : "Guardar"}
            </button>
          </div>
        </Modal>
      )}

      {/* == MODAL: Crear / Editar empresa == */}
      {empresaModal.open && (
        <Modal
          title={empresaModal.mode === "create" ? "Nueva empresa" : "Editar empresa"}
          onClose={() => {
            setEmpresaModal({ open: false, mode: "create", data: {} });
            setEmpresaLogoFile(null);
            setEmpresaLogoPreview("");
          }}
        >
          <div className="space-y-3">
            <FormRow label="Nombre">
              <input
                className={inputCls}
                value={empresaModal.data.nombre || ""}
                onChange={(e) => setEmpresaModal((s) => ({ ...s, data: { ...s.data, nombre: e.target.value } }))}
              />
            </FormRow>
            <FormRow label="NIT">
              <input
                className={inputCls}
                value={empresaModal.data.nit || ""}
                onChange={(e) => setEmpresaModal((s) => ({ ...s, data: { ...s.data, nit: e.target.value } }))}
              />
            </FormRow>
            <FormRow label="Email de contacto">
              <input
                className={inputCls}
                type="email"
                value={empresaModal.data.email_contacto || ""}
                onChange={(e) => setEmpresaModal((s) => ({ ...s, data: { ...s.data, email_contacto: e.target.value } }))}
              />
            </FormRow>
            <FormRow label="Logo URL (marca blanca)">
              <input
                className={inputCls}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setEmpresaLogoFile(file);
                  if (file) {
                    const objectUrl = URL.createObjectURL(file);
                    setEmpresaLogoPreview(objectUrl);
                  } else {
                    setEmpresaLogoPreview(empresaModal.data.logo_url || "");
                  }
                }}
              />
              <div className="text-[11px] text-white/50 mt-1">
                Formatos permitidos: PNG, JPG, WEBP, SVG (máx. 3MB)
              </div>
            </FormRow>
            {empresaLogoPreview ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs text-white/60 mb-2">Vista previa</div>
                <img
                  src={empresaLogoPreview}
                  alt="Logo empresa"
                  className="h-10 w-auto object-contain"
                  onError={(ev) => { ev.currentTarget.style.display = "none"; }}
                />
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <button
              className={btnGhost}
              onClick={() => {
                setEmpresaModal({ open: false, mode: "create", data: {} });
                setEmpresaLogoFile(null);
                setEmpresaLogoPreview("");
              }}
            >
              Cancelar
            </button>
            <button className={btnPrimary} onClick={submitEmpresa}>
              {empresaModal.mode === "create" ? "Crear" : "Guardar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* --- helpers locales --- */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1423] p-5 shadow-2xl text-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-white/50 hover:bg-white/10 text-lg">X</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-white/50 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}




