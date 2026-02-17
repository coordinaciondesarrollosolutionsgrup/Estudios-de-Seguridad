// src/pages/ClienteDashboard.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import ProgressBarLive from "../components/ProgressBarLive";
import useStudyProgress from "../hooks/useStudyProgress";
import ThreeBackground from "../components/ThreeBackground";

import {
  Building2,
  FileText,
  Download,
  PlusCircle,
  UserRound,
  Mail,
  Phone,
  MapPin,
  IdCard,
} from "lucide-react";

/* ======================= UI helpers ======================= */
const inputCls =
  "rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";
const cardCls =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl";

/* ======================= Small components ======================= */
function LivePct({ studyId, initial = 0 }) {
  const p = useStudyProgress(initial, studyId);
  const val = Number.isFinite(p) ? p : initial || 0;
  return <>{Math.round(val)}%</>;
}

/* ======================= Main ======================= */
export default function ClienteDashboard() {
  const [me, setMe] = useState(null);
  const [hasEmpresa, setHasEmpresa] = useState(false);
  const [loadingMe, setLoadingMe] = useState(true);

  const [estudios, setEstudios] = useState([]);
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState("");

  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    cedula: "",
    email: "",
    celular: "",
    ciudad_residencia: "",
  });

  // Progreso en vivo para el resumen
  const resumenStudyId = sel?.estudio_id ?? sel?.id ?? null;
  useStudyProgress(sel?.progreso || 0, resumenStudyId);

  /* ---------- API: cargar resumen de un estudio ---------- */
  const openResumen = useCallback(async (id, signal) => {
    const { data } = await api.get(`/api/estudios/${id}/resumen/`, { signal });
    setSel(data);
  }, []);

  /* ---------- API: cargar lista de estudios ---------- */
  const load = useCallback(
    async (signal) => {
      const { data } = await api.get("/api/estudios/", { signal });
      const list = Array.isArray(data) ? data : [];
      setEstudios(list);
      if (list.length) await openResumen(list[0].id, signal);
      else setSel(null);
    },
    [openResumen]
  );

  /* ---------- Cargar usuario / permisos al montar ---------- */
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { data } = await api.get("/api/auth/me/", { signal: ac.signal });
        setMe(data);

        const _hasEmpresa = Boolean(
          data?.empresa_id != null ? data.empresa_id : data?.empresa
        );
        setHasEmpresa(_hasEmpresa);

        if (data.rol !== "CLIENTE") {
          setMsg("Debes ingresar como CLIENTE para crear solicitudes.");
          return;
        }
        if (!_hasEmpresa) {
          setMsg(
            "Tu usuario CLIENTE no tiene empresa asociada. Pide al admin asignarte una empresa."
          );
          return;
        }

        setMsg("");
        await load(ac.signal);
      } catch (e) {
        if (e.name !== "CanceledError" && e.name !== "AbortError") {
          console.error(e);
          setMsg("No autenticado. Inicia sesión nuevamente.");
        }
      } finally {
        setLoadingMe(false);
      }
    })();
    return () => ac.abort();
  }, [load]);

  /* ---------- Crear solicitud ---------- */
  const disabledCreate = loadingMe || !me || me.rol !== "CLIENTE" || !hasEmpresa;

  const crearSolicitud = useCallback(
    async (e) => {
      e.preventDefault();
      setMsg("");

      if (disabledCreate) return;

      const payload = {
        candidato: {
          nombre: (form.nombre || "").trim(),
          apellido: (form.apellido || "").trim(),
          cedula: (form.cedula || "").trim(),
          email: (form.email || "").trim(),
          celular: (form.celular || "").trim(),
          ciudad_residencia: (form.ciudad_residencia || "").trim(),
        },
      };

      if (!payload.candidato.nombre) return setMsg("Falta el nombre del candidato.");
      if (!payload.candidato.apellido) return setMsg("Faltan los apellidos del candidato.");
      if (!payload.candidato.cedula) return setMsg("Falta la cédula del candidato.");
      if (!payload.candidato.email) return setMsg("Falta el correo del candidato.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.candidato.email))
        return setMsg("El correo del candidato no es válido.");

      try {
        await api.post("/api/solicitudes/", payload);
        setMsg("Solicitud creada. Se envió correo al candidato y al analista.");
        setForm({
          nombre: "",
          apellido: "",
          cedula: "",
          email: "",
          celular: "",
          ciudad_residencia: "",
        });
        const ac = new AbortController();
        await load(ac.signal);
      } catch (err) {
        const d = err.response?.data;
        let candDetails = null;
        if (d?.candidato && typeof d.candidato === "object") {
          candDetails = Object.entries(d.candidato)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join(" | ");
        }
        const detail =
          d?.detail ||
          d?.non_field_errors?.[0] ||
          d?.empresa?.[0] ||
          candDetails ||
          JSON.stringify(d || {});
        console.error("Error crear solicitud:", d);
        setMsg(`No se pudo crear la solicitud: ${detail}`);
      }
    },
    [disabledCreate, form, load]
  );

  /* ======================= Descargar PDF generado en el backend ======================= */
  const descargarPDFServidor = useCallback(
    async (id) => {
      if (generating) return;
      setGenerating(true);
      try {
        const res = await api.get(`/api/estudios/${id}/pdf/`, {
          responseType: "blob",
        });

        // nombre sugerido (si viene del header)
        const cd = res.headers?.["content-disposition"] || "";
        const m = /filename="?([^"]+)"?/i.exec(cd);
        const suggested = m?.[1] || `Estudio_${id}.pdf`;

        const blob = new Blob([res.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = suggested;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Fallo al descargar PDF:", e);
        const status = e?.response?.status;
        if (status === 404) {
          alert("El PDF no existe: revisa la ruta / permisos o el ID del estudio.");
        } else if (status === 403) {
          alert("No tienes permiso para descargar este PDF.");
        } else {
          alert("No se pudo generar/descargar el PDF. Revisa el backend.");
        }
      } finally {
        setGenerating(false);
      }
    },
    [generating]
  );

  /* ---------- Derivados ---------- */
  const empresaNombre = useMemo(
    () => me?.empresa_nombre ?? me?.empresa ?? "—",
    [me]
  );

  /* ======================= Render ======================= */
  return (
    <div className="relative min-h-screen text-white">
      {/* Fondo */}
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(1200px_700px_at_25%_20%,rgba(255,255,255,0.06),transparent_60%),linear-gradient(180deg,#0b1220_0%,#0a0f1a_100%)]" />
      <ThreeBackground className="fixed inset-0 -z-10 opacity-40 pointer-events-none" />

      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Header */}
        <div className={`${cardCls} p-5`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-white/80" />
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Portal del cliente</h1>
                <p className="text-sm text-white/60">Crea solicitudes y revisa el estado de tus estudios.</p>
              </div>
            </div>
            {me && (
              <div className="text-xs text-white/80">
                Usuario: <b>{me.username}</b> · Rol: <b>{me.rol}</b> · Empresa: <b>{empresaNombre}</b>
              </div>
            )}
          </div>
        </div>

        {/* Mensaje global */}
        {msg && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {msg}
          </div>
        )}

        {/* Nueva solicitud */}
        <form onSubmit={crearSolicitud} autoComplete="off" className={`${cardCls} p-5 space-y-4`}>
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-white/80" />
            <h2 className="text-lg font-semibold">Nueva solicitud</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Nombres"
                value={form.nombre}
                onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
              />
            </div>
            <input
              className={inputCls}
              placeholder="Apellidos"
              value={form.apellido}
              onChange={(e) => setForm((s) => ({ ...s, apellido: e.target.value }))}
            />
            <div className="flex items-center gap-2">
              <IdCard className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Cédula"
                value={form.cedula}
                onChange={(e) => setForm((s) => ({ ...s, cedula: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Correo"
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Celular"
                value={form.celular}
                onChange={(e) => setForm((s) => ({ ...s, celular: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Ciudad de residencia"
                value={form.ciudad_residencia}
                onChange={(e) => setForm((s) => ({ ...s, ciudad_residencia: e.target.value }))}
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={disabledCreate}
              className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition ${
                disabledCreate ? "cursor-not-allowed bg-slate-600" : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              Crear solicitud
            </button>
          </div>
        </form>

        {/* Lista + Resumen */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Lista */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Estudios</h3>
            <div className={`${cardCls} divide-y divide-white/5`}>
              {estudios.length ? (
                estudios.map((es) => (
                  <button
                    key={es.id}
                    onClick={() => openResumen(es.id)}
                    className="w-full text-left transition hover:bg-white/5"
                  >
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-white/70" />
                        <span className="font-medium">Estudio #{es.id}</span>
                      </div>
                      <div className="text-xs text-white/70 flex items-center gap-3">
                        <span>{es.nivel_cualitativo || "—"}</span>
                        <span>
                          <LivePct studyId={es.id} initial={es.progreso || 0} />
                        </span>
                      </div>
                    </div>
                    <div className="px-3 pb-3">
                      <ProgressBarLive estudioId={es.id} initial={es.progreso || 0} />
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-sm text-white/70">Sin estudios.</div>
              )}
            </div>
          </div>

          {/* Resumen */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Resumen</h3>
            {!sel ? (
              <div className={`${cardCls} p-4`}>Selecciona un estudio</div>
            ) : (
              <div className={`${cardCls} p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium">Estudio #{sel.estudio_id}</div>
                  <div className="text-sm text-white/80">
                    Progreso: <LivePct studyId={resumenStudyId} initial={sel.progreso || 0} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-white/70">Items</div>
                    <div className="font-semibold">{sel.totales.items}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-white/70">Validados</div>
                    <div className="font-semibold">{sel.totales.validados}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-white/70">Hallazgos</div>
                    <div className="font-semibold">{sel.totales.hallazgos}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-1">Secciones</h4>
                  <ul className="text-sm space-y-1">
                    {Object.entries(sel.secciones || {}).map(([sec, info]) => (
                      <li
                        key={sec}
                        className="border border-white/10 bg-white/5 rounded p-2 flex items-center justify-between"
                      >
                        <span className="capitalize">{sec.replaceAll("_", " ").toLowerCase()}</span>
                        <span className="text-white/70">✓ {info.validados} · ⚠️ {info.hallazgos}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => descargarPDFServidor(sel.estudio_id)}
                    disabled={generating}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-white ${
                      generating ? "bg-slate-600 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500"
                    }`}
                    title={generating ? "Generando…" : "Descargar PDF"}
                  >
                    <Download className="h-4 w-4" />
                    {generating ? "Generando…" : "Descargar PDF"}
                  </button>

                  <span className="text-sm text-white/80">
                    Autorización:{" "}
                    <b className={sel.autorizacion?.firmada ? "text-emerald-300" : "text-amber-300"}>
                      {sel.autorizacion?.firmada ? "Firmada" : "Pendiente"}
                    </b>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
