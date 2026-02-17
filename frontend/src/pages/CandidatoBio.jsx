import { useEffect, useMemo, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../api/axios";
import { getDepartamentos, getMunicipios } from "../api/geo";
import { bioProgress, saveSectionProgress, overallProgress, pushStudyProgress } from "../utils/progress";

/* ====== estilos ====== */
const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";
const labelCls = "text-sm text-slate-200 font-medium";

/* ====== helpers ====== */
const sanitizeName = (s = "") =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]/g, "").replace(/\s+/g, " ").trimStart();
const sanitizeApellido = sanitizeName;
const sanitizeDigits = (s = "", max = 15) => s.replace(/\D+/g, "").slice(0, max);

const clampEstatura = (v) => {
  if (v === "" || v == null) return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return Math.max(50, Math.min(250, n));
};

const sanitizeMovil = (s = "", maxDigits = 15) => {
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) {
    const body = s.slice(1).replace(/\D/g, "").slice(0, maxDigits);
    return "+" + body;
  }
  return s.replace(/\D/g, "").slice(0, maxDigits);
};
const sanitizeFijo = (s = "", maxLen = 20) => s.replace(/[^0-9-]/g, "").slice(0, maxLen);
const sanitizeBarrio = (s = "", maxLen = 60) =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9' .-]/g, "").slice(0, maxLen);
const sanitizeComuna = (s = "", maxLen = 20) => s.replace(/[^A-Za-z0-9 -]/g, "").slice(0, maxLen);
const sanitizeSisbenScore = (s = "", maxLen = 4) =>
  s.replace(/\s+/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, maxLen);

/* ====== primitivas ====== */
const Field = ({ label, hint, className = "", children }) => (
  <label className={`block ${className}`}>
    {label && <div className={labelCls}>{label}</div>}
    {children}
    {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
  </label>
);
const Input = ({ className = "", ...rest }) => <input className={`${inputCls} mt-1 ${className}`} {...rest} />;
const TextArea = ({ className = "", rows = 4, ...rest }) => (
  <textarea rows={rows} className={`${inputCls} mt-1 ${className}`} {...rest} />
);
const SelectSimple = ({ value, onChange, children, className = "" }) => (
  <select
    value={value ?? ""}
    onChange={(e) => onChange?.(e.target.value)}
    className={`${inputCls} mt-1 pr-8 ${className}`}
  >
    <option value="">Seleccione…</option>
    {children}
  </select>
);

/* mini-componente para mostrar link del último soporte */
const SupportChip = ({ href, label = "Ver archivo" }) =>
  href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
    >
      {label} ↗
    </a>
  ) : null;

/* ====== acordeón ====== */
function AccordionItem({ title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="text-base font-semibold text-white">{title}</div>
          {subtitle && <div className="text-xs text-white/60">{subtitle}</div>}
        </div>
        <span className={`text-white/70 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      <div
        className={`grid gap-4 border-t border-white/10 px-4 transition-[grid-template-rows,opacity] ${
          open ? "py-4 opacity-100" : "grid-rows-[0fr] overflow-hidden opacity-0"
        }`}
      >
        <div className="grid gap-4 md:grid-cols-3">{open && children}</div>
      </div>
    </div>
  );
}

/* ====== uploads helper (un solo endpoint) ====== */
const MAX_UPLOAD_MB = 8;
async function uploadDoc(kind, file) {
  if (!file) throw new Error("Selecciona un archivo primero.");
  const fd = new FormData();
  // SALUD | PENSIONES | CAJA | FOTO_FRENTE | CESANTIAS | CEDULA | LIBRETA_MILITAR | LICENCIA_TRANSITO
  fd.append("kind", kind);
  fd.append("file", file);
  const res = await api.post("/api/candidatos/me/upload_doc/", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/* ====== componente ====== */
export default function CandidatoBio() {
  const outlet = useOutletContext() || {};
  const studyId = outlet?.studyId ?? null;

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [msg, setMsg] = useState("");

  // geo
  const [deps, setDeps] = useState([]);
  const [munis, setMunis] = useState([]);
  const [qDep, setQDep] = useState("");
  const [qMuni, setQMuni] = useState("");

  // uploads locales + previews
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);

  const [epsFile, setEpsFile] = useState(null);
  const [epsPreview, setEpsPreview] = useState(null);

  const [cajaFile, setCajaFile] = useState(null);
  const [cajaPreview, setCajaPreview] = useState(null);

  const [pensionFile, setPensionFile] = useState(null);
  const [pensionPreview, setPensionPreview] = useState(null);

  const [cesFile, setCesFile] = useState(null);
  const [cesPreview, setCesPreview] = useState(null);

  // NUEVOS soportes
  const [cedFile, setCedFile] = useState(null);
  const [cedPreview, setCedPreview] = useState(null);

  const [libFile, setLibFile] = useState(null);
  const [libPreview, setLibPreview] = useState(null);

  const [licFile, setLicFile] = useState(null);
  const [licPreview, setLicPreview] = useState(null);

  const SISBEN_DEFAULT = "Grupo Sisbén IV";

  const draftKey = me?.id ? `bioDraft:v3:${me.id}` : null;

  const setVal = (k, v) => {
    setDraft((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };

  const extractSupport = (obj, key) => {
    if (!obj) return null;
    if (typeof obj === "object" && !Array.isArray(obj)) return obj[key] || null;
    if (Array.isArray(obj)) {
      const it = obj.find((x) => x?.kind === key || x?.tipo === key);
      return it?.url || it?.archivo || null;
    }
    return null;
  };

  const loadMe = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const { data } = await api.get("/api/candidatos/me/");
      setMe(data);
      setDraft((d) => ({ ...(d || {}), ...data }));

      const dps = await getDepartamentos();
      setDeps(dps);
      if (data?.departamento_id) {
        const ms = await getMunicipios(data.departamento_id);
        setMunis(ms);
      } else {
        setMunis([]);
      }

      // Previews desde backend
      if (data?.foto_url) setFotoPreview(data.foto_url);
      if (data?.soportes) {
        setEpsPreview(extractSupport(data.soportes, "SALUD"));
        setCajaPreview(extractSupport(data.soportes, "CAJA"));
        setPensionPreview(extractSupport(data.soportes, "PENSIONES"));
        setCesPreview(extractSupport(data.soportes, "CESANTIAS"));

        // nuevos
        setCedPreview(extractSupport(data.soportes, "CEDULA"));
        setLibPreview(extractSupport(data.soportes, "LIBRETA_MILITAR"));
        setLicPreview(extractSupport(data.soportes, "LICENCIA_TRANSITO"));
      }

      // progreso
      try {
        if (studyId) {
          const initPct = bioProgress(data);
          saveSectionProgress(studyId, "bio", initPct);
          overallProgress(studyId);
        }
      } catch {}
    } catch (err) {
      console.error("loadMe error", err);
      setMsg("No se pudo cargar tu ficha. Puedes editar y guardar, o reintentar.");
      setMe(null);
      setDraft((d) => d || {});
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    loadMe();
    return () => {
      [
        fotoPreview, epsPreview, cajaPreview, pensionPreview, cesPreview,
        cedPreview, libPreview, licPreview
      ].forEach((u) => {
        if (u?.startsWith?.("blob:")) URL.revokeObjectURL(u);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autocompletar sisbén si vacío
  useEffect(() => {
    if (!draft) return;
    const v = (draft.sisben ?? "").trim();
    if (!v) {
      setDraft((s) => ({ ...s, sisben: SISBEN_DEFAULT }));
      setDirty(true);
    }
  }, [draft?.sisben]);

  // restaurar desde localStorage (si hay me.id)
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const restored = JSON.parse(raw);
        setDraft((s) => ({ ...s, ...restored }));
        setDirty(true);
        setSavedMsg("Se restauraron cambios sin guardar.");
        setTimeout(() => setSavedMsg(""), 2500);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // persistir draft en localStorage
  useEffect(() => {
    if (!draftKey || !draft) return;
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft, draftKey]);

  /* --------- catálogos simples --------- */
  const grupos = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
  const estratos = ["1", "2", "3", "4", "5", "6"];
  const tipoZona = [
    ["URBANO", "Urbano"],
    ["RURAL", "Rural"],
  ];
  const estadoCivil = ["SOLTERO(A)", "CASADO(A)", "UNIÓN LIBRE", "SEPARADO(A)", "DIVORCIADO(A)", "VIUDO(A)"];
  const sexos = [
    ["M", "Masculino"],
    ["F", "Femenino"],
    ["X", "Otro"],
  ];

  // Categorías de licencia (si aplica)
  const LIC_CATS = ["A1","A2","B1","B2","B3","C1","C2","C3"];

  // Cesantías con texto como value
  const CESANTIAS_OPTS = [
    "Porvenir",
    "Protección",
    "Colfondos",
    "Skandia",
    "Fondo Nacional del Ahorro (FNA)",
    "Magisterio (FOMAG)",
    "Otro (especifique)",
    "No aplica / No afiliado",
  ];

  const filDeps = useMemo(() => {
    const q = qDep.trim().toLowerCase();
    return q ? deps.filter((d) => (d.nombre || "").toLowerCase().includes(q)) : deps;
  }, [qDep, deps]);
  const filMunis = useMemo(() => {
    const q = qMuni.trim().toLowerCase();
    return q ? munis.filter((m) => (m.nombre || "").toLowerCase().includes(q)) : munis;
  }, [qMuni, munis]);

  // edad
  const edad = useMemo(() => {
    if (!draft?.fecha_nacimiento) return "";
    const birth = new Date(draft.fecha_nacimiento);
    const now = new Date();
    let e = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) e--;
    return e;
  }, [draft?.fecha_nacimiento]);

  const onDepChange = async (depId) => {
    const dep = deps.find((d) => String(d.id) === String(depId));
    setDraft((s) => ({
      ...s,
      departamento_id: depId || null,
      departamento_nombre: dep?.nombre || null,
      municipio_id: null,
      municipio_nombre: null,
    }));
    setDirty(true);
    if (depId) {
      const ms = await getMunicipios(depId);
      setMunis(ms);
    } else setMunis([]);
  };

  const onMuniChange = (munId) => {
    const m = munis.find((x) => String(x.id) === String(munId));
    setDraft((s) => ({
      ...s,
      municipio_id: munId || null,
      municipio_nombre: m?.nombre || null,
    }));
    setDirty(true);
  };

  const doUpload = async (kind, file, okMsg, onUrl) => {
    try {
      const data = await uploadDoc(kind, file);
      if (onUrl && (data?.url || data?.archivo)) onUrl(data.url || data.archivo);
      setSavedMsg(okMsg);
      setTimeout(() => setSavedMsg(""), 2000);
      await loadMe(); // refresca soportes
    } catch (e) {
      console.error("upload error", e);
      const code = e?.response?.status;
      const detail =
        e?.response?.data?.detail ||
        (code === 404
          ? "El endpoint de subida no existe aún en el backend."
          : code === 413
          ? `El archivo es demasiado grande. Intenta <= ${MAX_UPLOAD_MB}MB o ajusta Nginx.`
          : "No se pudo subir el archivo.");
      setMsg(detail);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const PATCH_FIELDS = [
    "nombre",
    "apellido",
    "tipo_documento",
    "cedula",
    "fecha_nacimiento",
    "estatura_cm",
    "grupo_sanguineo",
    "sexo",
    "estado_civil",
    "fecha_expedicion",
    "lugar_expedicion",

    // NUEVOS opcionales
    "libreta_militar_numero","libreta_militar_clase","libreta_militar_distrito",
    "licencia_transito_numero","licencia_transito_categoria","licencia_transito_vence",

    "direccion",
    "barrio",
    "departamento_id",
    "departamento_nombre",
    "municipio_id",
    "municipio_nombre",
    "comuna",
    "estrato",
    "tipo_zona",
    "telefono",       // Celular 1
    "celular",        // Celular 2
    "telefono_fijo",
    "eps",
    "caja_compensacion",
    "pension_fondo",
    "cesantias_fondo",
    "sisben",
    "puntaje_sisben",
    "perfil_aspirante",
    "estudia_actualmente",
  ];

  const buildPatch = () => {
    if (!draft) return {};
    if (!me) return { ...draft };
    const patch = {};
    for (const k of PATCH_FIELDS) {
      if (k in draft && draft[k] !== me[k]) patch[k] = draft[k] ?? null;
    }
    return patch;
  };

  const handleSave = async () => {
    const patch = buildPatch();
    if (!Object.keys(patch).length) {
      setSavedMsg("No hay cambios por guardar.");
      setTimeout(() => setSavedMsg(""), 1800);
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const { data } = await api.patch("/api/candidatos/me/", patch);
      setMe(data);
      setDraft((s) => ({ ...(s || {}), ...data }));
      setDirty(false);
      setSavedMsg("Información guardada.");
      if (draftKey) localStorage.removeItem(draftKey);

      if (studyId) {
        try {
          const sectionPct = bioProgress(data);
          saveSectionProgress(studyId, "bio", sectionPct);
          const total = overallProgress(studyId);
          await pushStudyProgress(api, studyId, total);
          window.dispatchEvent(new CustomEvent("study-progress", { detail: { studyId, total } }));
        } catch {}
      }
      setTimeout(() => setSavedMsg(""), 2200);
    } catch (e) {
      console.error("save error", e);
      setMsg("No se pudo guardar. Revisa los datos.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!me) {
      setDraft({});
      setDirty(false);
      if (draftKey) localStorage.removeItem(draftKey);
      return;
    }
    setDraft(me);
    setDirty(false);
    if (draftKey) localStorage.removeItem(draftKey);
  };

  if (loading && !draft) {
    return (
      <div className="text-slate-100">
        Cargando…
        {msg && (
          <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {msg}{" "}
            <button className="ml-2 rounded bg-white/10 px-2 py-1" onClick={() => loadMe()} type="button">
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!draft) return <div className="text-slate-100">Sin datos para mostrar.</div>;

  /* ====== UI ====== */
  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">🪪 Datos personales</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty || saving}
            className={`rounded-xl border px-4 py-2 text-sm ${
              !dirty || saving
                ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
                : "border-white/10 bg-white/10 text-slate-200 hover:bg-white/20"
            }`}
          >
            Descartar cambios
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition ${
              !dirty || saving ? "cursor-not-allowed bg-slate-600" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            type="button"
            onClick={() => loadMe()}
            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
          >
            Recargar
          </button>
        </div>
      </div>

      {/* mensajes */}
      {msg && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {msg}
        </div>
      )}
      {savedMsg && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {savedMsg}
        </div>
      )}

      {/* bloques */}
      <div className="space-y-4">
        {/* Identificación + foto arriba */}
        <AccordionItem title="Identificación y básicos" subtitle="Nombre, documento, fechas, medidas, foto" defaultOpen>
          {/* Foto de frente */}
          <Field label="Foto de frente" hint={`Formatos: JPG/PNG (máx ${MAX_UPLOAD_MB}MB)`} className="md:col-span-1">
            {fotoPreview ? (
              <img
                src={fotoPreview}
                alt="Foto candidato"
                className="mt-1 h-40 w-40 rounded-xl border border-white/10 object-cover bg-white"
              />
            ) : (
              <div className="mt-1 grid h-40 w-40 place-items-center rounded-xl border border-dashed border-white/20 bg-white/5 text-xs text-white/60">
                Sin foto
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFotoFile(f);
                  if (f) {
                    const url = URL.createObjectURL(f);
                    setFotoPreview((prev) => {
                      if (prev?.startsWith?.("blob:")) URL.revokeObjectURL(prev);
                      return url;
                    });
                  } else {
                    setFotoPreview(null);
                  }
                }}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() => doUpload("FOTO_FRENTE", fotoFile, "Foto subida.", (url) => setFotoPreview(url))}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Subir
              </button>
            </div>
          </Field>

          <Field label="Nombres" hint="Solo letras, espacios, ' y -">
            <Input
              placeholder="Tu(s) nombre(s)"
              value={draft.nombre || ""}
              onChange={(e) => setVal("nombre", sanitizeName(e.target.value))}
              maxLength={60}
            />
          </Field>

          <Field label="Apellidos" hint="Solo letras, espacios, ' y -">
            <Input
              placeholder="Tu(s) apellido(s)"
              value={draft.apellido || ""}
              onChange={(e) => setVal("apellido", sanitizeApellido(e.target.value))}
              maxLength={60}
            />
          </Field>

          <Field label="Tipo de documento">
            <SelectSimple value={draft.tipo_documento || ""} onChange={(v) => setVal("tipo_documento", v || null)}>
              {[
                ["CC", "Cédula"],
                ["TI", "Tarjeta de identidad"],
                ["CE", "Cédula de extranjería"],
                ["PA", "Pasaporte"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectSimple>
          </Field>

          <Field label="Número de cédula" hint="Solo dígitos">
            <Input
              placeholder="Ej: 12345678"
              value={draft.cedula || ""}
              onChange={(e) => setVal("cedula", sanitizeDigits(e.target.value, 15))}
              inputMode="numeric"
              maxLength={15}
              pattern="^\\d{4,15}$"
            />
          </Field>

          <Field label="Fecha de nacimiento">
            <Input
              type="date"
              value={draft.fecha_nacimiento || ""}
              onChange={(e) => setVal("fecha_nacimiento", e.target.value || null)}
            />
          </Field>

          <Field label="Edad actual">
            <Input value={edad} readOnly />
          </Field>

          <Field label="Estatura (cm)" hint="Entre 50 y 250">
            <Input
              type="number"
              placeholder="Ej: 175"
              value={draft.estatura_cm ?? ""}
              onChange={(e) =>
                setVal("estatura_cm", e.target.value === "" ? null : clampEstatura(e.target.value))
              }
              inputMode="numeric"
              min={50}
              max={250}
            />
          </Field>

          <Field label="Grupo sanguíneo">
            <SelectSimple value={draft.grupo_sanguineo || ""} onChange={(v) => setVal("grupo_sanguineo", v || null)}>
              {grupos.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </SelectSimple>
          </Field>

          <Field label="Sexo">
            <SelectSimple value={draft.sexo || ""} onChange={(v) => setVal("sexo", v || null)}>
              {sexos.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectSimple>
          </Field>

          <Field label="Estado civil">
            <SelectSimple value={draft.estado_civil || ""} onChange={(v) => setVal("estado_civil", v || null)}>
              {estadoCivil.map((ec) => (
                <option key={ec} value={ec}>
                  {ec}
                </option>
              ))}
            </SelectSimple>
          </Field>

          <Field label="Fecha expedición cédula">
            <Input
              type="date"
              value={draft.fecha_expedicion || ""}
              onChange={(e) => setVal("fecha_expedicion", e.target.value || null)}
            />
          </Field>

          <Field label="Lugar de expedición">
            <Input
              placeholder="Ciudad / Municipio"
              value={draft.lugar_expedicion || ""}
              onChange={(e) => setVal("lugar_expedicion", e.target.value)}
              maxLength={120}
            />
          </Field>

          {/* ---------- NUEVO BLOQUE: Libreta militar (opcional) ---------- */}
          <Field label="Libreta militar — Número (opcional)">
            <Input
              placeholder="Número"
              value={draft.libreta_militar_numero || ""}
              onChange={(e) => setVal("libreta_militar_numero", e.target.value)}
              maxLength={50}
            />
          </Field>
          <Field label="Libreta militar — Categoria (opcional)" hint="Ej: Primera / Segunda">
            <Input
              placeholder="Clase"
              value={draft.libreta_militar_clase || ""}
              onChange={(e) => setVal("libreta_militar_clase", e.target.value)}
              maxLength={20}
            />
          </Field>
          <Field label="Libreta militar — Distrito (opcional)">
            <Input
              placeholder="Distrito militar"
              value={draft.libreta_militar_distrito || ""}
              onChange={(e) => setVal("libreta_militar_distrito", e.target.value)}
              maxLength={80}
            />
          </Field>

          {/* ---------- NUEVO BLOQUE: Licencia de tránsito (opcional) ---------- */}
          <Field label="Licencia de tránsito — Número (opcional)">
            <Input
              placeholder="Número de licencia"
              value={draft.licencia_transito_numero || ""}
              onChange={(e) => setVal("licencia_transito_numero", e.target.value)}
              maxLength={50}
            />
          </Field>
          <Field label="Licencia de tránsito — Categoría (opcional)">
            <SelectSimple
              value={draft.licencia_transito_categoria || ""}
              onChange={(v) => setVal("licencia_transito_categoria", v || null)}
            >
              {LIC_CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectSimple>
          </Field>
          <Field label="Licencia de tránsito — Fecha de vencimiento (opcional)">
            <Input
              type="date"
              value={draft.licencia_transito_vence || ""}
              onChange={(e) => setVal("licencia_transito_vence", e.target.value || null)}
            />
          </Field>

          {/* ---------- NUEVOS SOPORTES / ARCHIVOS ---------- */}
          <Field label="Copia de cédula" className="md:col-span-3">
            <SupportChip href={cedPreview} label="Ver copia de cédula" />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setCedFile(f);
                  setCedPreview(f ? URL.createObjectURL(f) : cedPreview);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() => doUpload("CEDULA", cedFile, "Copia de cédula subida.", (url) => setCedPreview(url))}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Subir
              </button>
            </div>
          </Field>

          <Field label="Libreta militar (archivo — opcional)" className="md:col-span-3">
            <SupportChip href={libPreview} label="Ver libreta militar" />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setLibFile(f);
                  setLibPreview(f ? URL.createObjectURL(f) : libPreview);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() =>
                  doUpload("LIBRETA_MILITAR", libFile, "Libreta militar subida.", (url) => setLibPreview(url))
                }
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Subir
              </button>
            </div>
          </Field>

          <Field label="Licencia de tránsito (archivo — opcional)" className="md:col-span-3">
            <SupportChip href={licPreview} label="Ver licencia de tránsito" />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setLicFile(f);
                  setLicPreview(f ? URL.createObjectURL(f) : licPreview);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() =>
                  doUpload("LICENCIA_TRANSITO", licFile, "Licencia de tránsito subida.", (url) => setLicPreview(url))
                }
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Subir
              </button>
            </div>
          </Field>
        </AccordionItem>

        {/* Ubicación */}
        <AccordionItem title="Ubicación" subtitle="Dirección, barrio, departamento y municipio">
          <Field label="Dirección de residencia">
            <Input
              placeholder="Calle 1 # 2-3"
              value={draft.direccion || ""}
              onChange={(e) => setVal("direccion", e.target.value)}
              maxLength={100}
            />
          </Field>

          <Field label="Barrio" hint="Letras/números/espacios/.-'">
            <Input value={draft.barrio || ""} onChange={(e) => setVal("barrio", sanitizeBarrio(e.target.value))} maxLength={60} />
          </Field>

          <Field label="Departamento">
            <div className="flex gap-2">
              <Input placeholder="Buscar…" value={qDep} onChange={(e) => setQDep(e.target.value)} className="flex-1" />
              <span className="grid place-items-center rounded-lg border border-white/10 bg-white/10 px-3 text-white/70">🔎</span>
            </div>
            <SelectSimple value={draft.departamento_id || ""} onChange={(v) => onDepChange(v)} className="mt-2">
              {filDeps.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </SelectSimple>
          </Field>

          <Field label="Municipio">
            <div className="flex gap-2">
              <Input placeholder="Buscar…" value={qMuni} onChange={(e) => setQMuni(e.target.value)} className="flex-1" />
              <span className="grid place-items-center rounded-lg border border-white/10 bg-white/10 px-3 text-white/70">🔎</span>
            </div>
            <select
              className={`${inputCls} mt-2 pr-8 disabled:opacity-50`}
              value={draft.municipio_id || ""}
              onChange={(e) => onMuniChange(e.target.value)}
              disabled={!draft.departamento_id}
            >
              <option value="">{draft.departamento_id ? "Seleccione…" : "Seleccione primero el departamento"}</option>
              {filMunis.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Comuna" hint="Solo letras/números/espacios/-">
            <Input value={draft.comuna || ""} onChange={(e) => setVal("comuna", sanitizeComuna(e.target.value))} maxLength={20} />
          </Field>

          <Field label="Estrato">
            <SelectSimple value={draft.estrato || ""} onChange={(v) => setVal("estrato", v || null)}>
              {estratos.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </SelectSimple>
          </Field>

          <Field label="Tipo de zona">
            <SelectSimple value={draft.tipo_zona || ""} onChange={(v) => setVal("tipo_zona", v || null)}>
              {tipoZona.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectSimple>
          </Field>
        </AccordionItem>

        {/* Contacto */}
        <AccordionItem title="Contacto" subtitle="Teléfonos y abonado">
          <Field label="Número Celular 1" hint="Opcional + al inicio, solo dígitos">
            <Input
              placeholder="+57"
              value={draft.telefono || ""} // Celular 1
              onChange={(e) => setVal("telefono", sanitizeMovil(e.target.value))}
              inputMode="tel"
              maxLength={16}
              pattern="^\\+?\\d{7,15}$"
            />
          </Field>
          <Field label="Número Celular 2" hint="Opcional + al inicio, solo dígitos">
            <Input
              placeholder="+57"
              value={draft.celular || ""} // Celular 2
              onChange={(e) => setVal("celular", sanitizeMovil(e.target.value))}
              inputMode="tel"
              maxLength={16}
              pattern="^\\+?\\d{7,15}$"
            />
          </Field>
          <Field label="Abonado telefónico" hint="Dígitos y guiones (incluye indicativo)">
            <Input
              placeholder="601-xxxxxxx"
              value={draft.telefono_fijo || ""}
              onChange={(e) => setVal("telefono_fijo", sanitizeFijo(e.target.value))}
              inputMode="tel"
              maxLength={20}
              pattern="^[0-9-]+$"
            />
          </Field>
        </AccordionItem>

        {/* Seguridad social + soportes */}
        <AccordionItem title="Seguridad social" subtitle="EPS, caja, pensiones y cesantías">
          {/* EPS */}
          <Field label="Afiliación a Salud (EPS)">
            <SelectSimple value={draft.eps || ""} onChange={(v) => setVal("eps", v || null)}>
              {["Nueva EPS", "EPS SURA", "Sanitas", "Compensar", "Salud Total", "Famisanar", "Coosalud"].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="OTRA">Otra / No listada</option>
            </SelectSimple>

            <SupportChip href={epsPreview} label="Ver último soporte EPS" />

            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setEpsFile(f);
                  setEpsPreview(f ? URL.createObjectURL(f) : epsPreview);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() => doUpload("SALUD", epsFile, "Soporte EPS subido.", (url) => setEpsPreview(url))}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Subir
              </button>
            </div>
          </Field>

          {/* Caja */}
          <Field label="Afiliación a Compensación Familiar">
            <SelectSimple value={draft.caja_compensacion || ""} onChange={(v) => setVal("caja_compensacion", v)}>
              {["Colsubsidio", "Compensar", "Cafam"].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </SelectSimple>

            <SupportChip href={cajaPreview} label="Ver último soporte Caja" />

            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setCajaFile(f);
                  setCajaPreview(f ? URL.createObjectURL(f) : cajaPreview);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() => doUpload("CAJA", cajaFile, "Soporte caja subido.", (url) => setCajaPreview(url))}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Subir
              </button>
            </div>
          </Field>

          {/* Pensiones */}
          <Field label="Afiliación a Pensiones">
            <SelectSimple value={draft.pension_fondo || ""} onChange={(v) => setVal("pension_fondo", v)}>
              {[
                "Colpensiones (Régimen de Prima Media)",
                "Porvenir",
                "Protección",
                "Colfondos",
                "Skandia",
                "Otra / No aplica",
              ].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </SelectSimple>

            <SupportChip href={pensionPreview} label="Ver historial de pensiones" />

            <div className="mt-2 flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setPensionFile(f);
                  setPensionPreview(f ? URL.createObjectURL(f) : pensionPreview);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() =>
                  doUpload("PENSIONES", pensionFile, "Historial de pensiones subido.", (url) => setPensionPreview(url))
                }
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Subir
              </button>
            </div>
          </Field>

          {/* Cesantías */}
          <Field label="Afiliación a Cesantías" className="md:col-span-3">
            <select
              className={`${inputCls} mt-1`}
              value={draft.cesantias_fondo ?? ""}
              onChange={(e) => setVal("cesantias_fondo", e.target.value)}
            >
              <option value="">Seleccione...</option>
              {CESANTIAS_OPTS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {draft.cesantias_fondo === "Otro (especifique)" && (
              <div className="mt-2">
                <Input
                  placeholder="¿Cuál fondo?"
                  value={draft.cesantias_otro || ""}
                  onChange={(e) => setVal("cesantias_otro", e.target.value)}
                  maxLength={60}
                />
              </div>
            )}

            <SupportChip href={cesPreview} label="Ver soporte de cesantías" />

            <div className="mt-3 flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setCesFile(f);
                  setCesPreview(f ? URL.createObjectURL(f) : cesPreview);
                }}
                className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() => doUpload("CESANTIAS", cesFile, "Soporte de cesantías subido.", (url) => setCesPreview(url))}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Subir
              </button>
            </div>
          </Field>
        </AccordionItem>

        {/* Sisbén (separado) */}
        <AccordionItem title="Sisbén" subtitle="Clasificación y puntaje">
          <Field label="Sisbén">
            <Input
              value={(draft?.sisben ?? "").trim() ? draft.sisben : "Grupo Sisbén IV"}
              readOnly
              tabIndex={-1}
              className="cursor-not-allowed opacity-80"
            />
          </Field>

          <Field label="Puntaje Sisbén" hint="Ej: C6, B1 (alfanumérico corto)">
            <Input
              type="text"
              placeholder="Ej: C6, B1"
              value={draft.puntaje_sisben ?? ""}
              onChange={(e) => setVal("puntaje_sisben", sanitizeSisbenScore(e.target.value))}
              maxLength={4}
              pattern="^[A-Z0-9]{1,4}$"
            />
          </Field>
        </AccordionItem>
      </div>
    </div>
  );
}
