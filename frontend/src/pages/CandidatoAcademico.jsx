import { useEffect, useState } from "react";
import api from "../api/axios";

/* ====== estilos compartidos ====== */
const inputCls =
  "mt-1 w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";
const labelCls = "text-sm text-slate-200 font-medium";

/* ====== helpers de validación/saneo ====== */
const sanitizeNombreLike = (s = "", max = 80) =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]/g, "").replace(/\s+/g, " ").slice(0, max);

const sanitizeTitulo = (s = "", max = 120) =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9' .,-]/g, "").replace(/\s+/g, " ").slice(0, max);

const sanitizeInstitucion = (s = "", max = 120) =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9' .,-]/g, "").replace(/\s+/g, " ").slice(0, max);

const sanitizeCiudad = (s = "", max = 80) =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9' .-]/g, "").replace(/\s+/g, " ").slice(0, max);

const sanitizeLRCPart = (s = "", max = 30) =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\-_/\.]/g, "").slice(0, max);

const sanitizeNumeroCorto = (s = "", max = 20) =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\-_/\.]/g, "").slice(0, max);

/* ====== primitivas UI ====== */
const Field = ({ label, hint, className = "", children }) => (
  <label className={`block ${className}`}>
    {label && <div className={labelCls}>{label}</div>}
    {children}
    {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
  </label>
);

const Input = ({ className = "", ...rest }) => <input className={`${inputCls} ${className}`} {...rest} />;

const Select = ({ value, onChange, children, className = "" }) => (
  <div className="relative">
    <select value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} className={`${inputCls} pr-8 ${className}`}>
      <option value="">Seleccione…</option>
      {children}
    </select>
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60">▾</span>
  </div>
);

/* ====== opciones ====== */
const grados = [
  "Primaria",
  "Secundaria",
  "Bachiller",
  "Técnico",
  "Tecnólogo",
  "Profesional",
  "Especialización",
  "Maestría",
  "Doctorado",
  "Postdoctorado",
  "Diplomado",
  "Curso corto",
  "Otro",
];

const superiorGrados = new Set([
  "Técnico",
  "Tecnólogo",
  "Profesional",
  "Especialización",
  "Maestría",
  "Doctorado",
  "Postdoctorado",
]);

const esNoFormalPorGrado = (g = "") => /^(diplomado|curso corto)$/i.test((g || "").trim());

/* ====== modelo / utilidades ====== */
const emptyReg = () => ({
  grado: "",
  titulo: "",
  institucion: "",
  fecha_graduacion: "",
  ciudad: "",
  acta_numero: "",
  folio_numero: "",

  // 3 campos visibles -> 1 compuesto para backend
  libro_numero: "",
  registro_numero: "",
  consecutivo_numero: "",
  libro_registro: "",

  rector: "",
  secretario_general: "",
  secretario_academico: "",
  jefe_registro: "",

  // regulación / matrícula (solo superior formal)
  categoria: "FORMAL", // FORMAL | NO_FORMAL
  colegio_regulador: "",
  tiene_matricula: null, // true | false | null
  matricula_numero: "",

  // tipo del soporte principal
  archivo_tipo: "DIPLOMA", // DIPLOMA | ACTA | OTRO

  // archivos locales (crear)
  _local_file: null,
  _local_preview: null,
  _cert_file: null,
  _cert_preview: null,
  _matri_file: null,
  _matri_preview: null,

  // previsualizaciones remotas (listar/editar)
  soporte_url: null,
  soporte_nombre: "",
  soporte_mime: "",
  cert_url: null,
  matri_url: null,
});

const fileKind = (name = "", type = "") => {
  if (type?.startsWith("image/")) return "image";
  if (name?.toLowerCase().endsWith(".pdf") || type === "application/pdf") return "pdf";
  return "other";
};

const FilePreview = ({ url, name, mime }) => {
  const kind = fileKind(name, mime);
  if (!url) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2">
      {kind === "image" ? (
        <img src={url} alt={name || "archivo"} className="h-20 w-28 rounded object-cover" />
      ) : (
        <div className="grid h-20 w-28 place-items-center rounded bg-white/10 text-xs text-white/70">
          {kind === "pdf" ? "PDF" : "Archivo"}
        </div>
      )}
      <div className="text-xs">
        <div className="max-w-[220px] truncate">{name || "archivo"}</div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-500"
        >
          Abrir
        </a>
      </div>
    </div>
  );
};

function extractErr(err) {
  const d = err?.response?.data;
  if (!d) return "Error desconocido.";
  if (typeof d === "string") return d;
  if (d.detail) return d.detail;
  try {
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join(" | ");
  } catch {
    return "No se pudo procesar el error.";
  }
}

/* ====== LRC ====== */
const composeLRC = ({ libro_numero, registro_numero, consecutivo_numero }) => {
  const parts = [];
  if (libro_numero?.toString().trim()) parts.push(`Libro: ${libro_numero}`);
  if (registro_numero?.toString().trim()) parts.push(`Registro: ${registro_numero}`);
  if (consecutivo_numero?.toString().trim()) parts.push(`Consecutivo: ${consecutivo_numero}`);
  return parts.join(" | ");
};

const splitLRC = (libro_registro = "") => {
  const out = { libro_numero: "", registro_numero: "", consecutivo_numero: "" };
  if (!libro_registro) return out;
  const rx = {
    libro: /libro[:\s]*([A-Za-z0-9\-_/\.]+)/i,
    reg: /registro[:\s]*([A-Za-z0-9\-_/\.]+)/i,
    cons: /consecutivo[:\s]*([A-Za-z0-9\-_/\.]+)/i,
  };
  const m1 = libro_registro.match(rx.libro);
  const m2 = libro_registro.match(rx.reg);
  const m3 = libro_registro.match(rx.cons);
  if (m1) out.libro_numero = m1[1];
  if (m2) out.registro_numero = m2[1];
  if (m3) out.consecutivo_numero = m3[1];

  if (!m1 && !m2 && !m3) {
    const raw = libro_registro.split("/").map((s) => s.trim());
    if (raw[0]) out.libro_numero = raw[0];
    if (raw[1]) out.registro_numero = raw[1];
    if (raw[2]) out.consecutivo_numero = raw[2];
  }
  return out;
};

/* ====== payloads ====== */
const ACADEMICO_FIELDS_CREATE = [
  "estudio",
  "titulo",
  "institucion",
  "fecha_graduacion",
  "ciudad",
  "grado",
  "acta_numero",
  "folio_numero",
  "libro_registro",
  "rector",
  "secretario_general",
  "secretario_academico",
  "jefe_registro",
  "categoria",
  "colegio_regulador",
  "tiene_matricula",
  "matricula_numero",
  "archivo_tipo",
];

const ACADEMICO_FIELDS_UPDATE = [
  "titulo",
  "institucion",
  "fecha_graduacion",
  "ciudad",
  "grado",
  "acta_numero",
  "folio_numero",
  "libro_registro",
  "rector",
  "secretario_general",
  "secretario_academico",
  "jefe_registro",
  "categoria",
  "colegio_regulador",
  "tiene_matricula",
  "matricula_numero",
  "archivo_tipo",
];

const normalizeValue = (k, v) => (k === "fecha_graduacion" && v === "" ? null : v);
const buildPayload = (source, fields, extras = {}) => {
  const obj = { ...extras };
  fields.forEach((k) => {
    const v = source[k];
    if (v !== undefined && v !== null) obj[k] = normalizeValue(k, v);
  });
  return obj;
};

/* ====== normalización/seguro de categoría ====== */
const ensureCategoria = (row, fallback) => {
  const cat =
    row?.categoria ??
    fallback ??
    (esNoFormalPorGrado(row?.grado) ? "NO_FORMAL" : "FORMAL");
  return { ...row, categoria: cat };
};

/* ====== agrupadores ====== */
const groupsFormal = [
  { key: "primaria", title: "Primaria", match: (r) => r.categoria !== "NO_FORMAL" && /primaria/i.test(r.grado || ""), defaultOpen: false },
  { key: "secundaria", title: "Secundaria", match: (r) => r.categoria !== "NO_FORMAL" && /secundaria|bachiller/i.test(r.grado || ""), defaultOpen: false },
  { key: "superior", title: "Educación superior (formal)", match: (r) => r.categoria !== "NO_FORMAL" && !/primaria|secundaria|bachiller/i.test(r.grado || ""), defaultOpen: true },
];

const groupNoFormal = { key: "no_formal", title: "Educación no formal (diplomados, cursos)", match: (r) => r.categoria === "NO_FORMAL", defaultOpen: false };

/* =================================== Módulo =================================== */
export default function CandidatoAcademico() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [estudioId, setEstudioId] = useState(null);

  // creación por grupo
  const [open, setOpen] = useState(() => {
    const init = {};
    [...groupsFormal, groupNoFormal].forEach((g) => (init[g.key] = !!g.defaultOpen));
    return init;
  });
  const [newReg, setNewReg] = useState(emptyReg());
  const [newTarget, setNewTarget] = useState(null);
  const [savingNew, setSavingNew] = useState(false);

  // edición
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const isEditing = (id) => editId === id;

  // progreso
  const bumpProgress = async (countAfterChange) => {
    if (!estudioId) return;
    try {
      const { data: est } = await api.get(`/api/estudios/${estudioId}/`);
      const actual = Number(est?.progreso || 0);
      const nuevo = countAfterChange > 0 ? Math.max(actual, 50) : Math.min(actual, 25);
      if (nuevo !== actual) {
        window.dispatchEvent(new CustomEvent("estudio:progress", { detail: { estudioId, progreso: nuevo } }));
        await api.post(`/api/estudios/${estudioId}/set_progress/`, { progreso: nuevo });
      }
    } catch {}
  };

  /* cargar */
  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      const estRes = await api.get("/api/estudios/");
      const estList = Array.isArray(estRes.data) ? estRes.data : [];
      if (estList.length) setEstudioId(estList[0].id);

      const { data } = await api.get("/api/academicos/");
      const rows = (Array.isArray(data) ? data : []).map((x) =>
        ensureCategoria(
          {
            ...x,
            ...splitLRC(x.libro_registro || ""),
            soporte_url: x.archivo || null,
            cert_url: x.cert_antecedentes || null,
            matri_url: x.matricula_archivo || null,
          },
          null
        )
      );
      setList(rows);
    } catch {
      setMsg("No se pudo cargar tu información académica.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => {
      const revoke = (u) => u && URL.revokeObjectURL(u);
      revoke(newReg?._local_preview);
      revoke(newReg?._cert_preview);
      revoke(newReg?._matri_preview);
      revoke(draft?._local_preview);
      revoke(draft?._cert_preview);
      revoke(draft?._matri_preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* archivos (crear/editar) */
  const handleNewFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (newReg?._local_preview) URL.revokeObjectURL(newReg._local_preview);
    if (!f) return setNewReg((s) => ({ ...s, _local_file: null, _local_preview: null }));
    const url = URL.createObjectURL(f);
    setNewReg((s) => ({ ...s, _local_file: f, _local_preview: url }));
  };
  const handleNewCert = (e) => {
    const f = e.target.files?.[0] || null;
    if (newReg?._cert_preview) URL.revokeObjectURL(newReg._cert_preview);
    if (!f) return setNewReg((s) => ({ ...s, _cert_file: null, _cert_preview: null }));
    const url = URL.createObjectURL(f);
    setNewReg((s) => ({ ...s, _cert_file: f, _cert_preview: url }));
  };
  const handleNewMatri = (e) => {
    const f = e.target.files?.[0] || null;
    if (newReg?._matri_preview) URL.revokeObjectURL(newReg._matri_preview);
    if (!f) return setNewReg((s) => ({ ...s, _matri_file: null, _matri_preview: null }));
    const url = URL.createObjectURL(f);
    setNewReg((s) => ({ ...s, _matri_file: f, _matri_preview: url }));
  };

  const handleEditFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (draft?._local_preview) URL.revokeObjectURL(draft._local_preview);
    if (!f) return setDraft((s) => ({ ...s, _local_file: null, _local_preview: null }));
    const url = URL.createObjectURL(f);
    setDraft((s) => ({ ...s, _local_file: f, _local_preview: url }));
  };
  const handleEditCert = (e) => {
    const f = e.target.files?.[0] || null;
    if (draft?._cert_preview) URL.revokeObjectURL(draft._cert_preview);
    if (!f) return setDraft((s) => ({ ...s, _cert_file: null, _cert_preview: null }));
    const url = URL.createObjectURL(f);
    setDraft((s) => ({ ...s, _cert_file: f, _cert_preview: url }));
  };
  const handleEditMatri = (e) => {
    const f = e.target.files?.[0] || null;
    if (draft?._matri_preview) URL.revokeObjectURL(draft._matri_preview);
    if (!f) return setDraft((s) => ({ ...s, _matri_file: null, _matri_preview: null }));
    const url = URL.createObjectURL(f);
    setDraft((s) => ({ ...s, _matri_file: f, _matri_preview: url }));
  };

  /* crear */
  const startAddIn = (groupKey) => {
    setNewTarget(groupKey);
    const suggestedGrado =
      groupKey === "primaria"
        ? "Primaria"
        : groupKey === "secundaria"
        ? "Secundaria"
        : groupKey === "no_formal"
        ? "Diplomado"
        : "Profesional";

    setNewReg((s) => ({
      ...emptyReg(),
      grado: suggestedGrado,
      categoria: groupKey === "no_formal" ? "NO_FORMAL" : "FORMAL",
    }));
    setOpen((o) => ({ ...o, [groupKey]: true }));
  };

  const add = async (e) => {
    e.preventDefault();
    if (!newTarget) return;
    setSavingNew(true);
    setMsg("");
    try {
      if (!estudioId) {
        setMsg("No se encontró un estudio activo para asociar.");
        setSavingNew(false);
        return;
      }

      const libro_registro = composeLRC(newReg);
      const base = buildPayload({ ...newReg, libro_registro }, ACADEMICO_FIELDS_CREATE, { estudio: estudioId });

      const mustMultipart = !!(newReg._local_file || newReg._cert_file || (newReg.tiene_matricula && newReg._matri_file));

      let row;
      if (mustMultipart) {
        const fd = new FormData();
        Object.entries(base).forEach(([k, v]) => v !== null && v !== undefined && fd.append(k, String(v)));
        if (newReg._local_file) fd.append("archivo", newReg._local_file);
        if (superiorGrados.has((newReg.grado || "").trim())) {
          if (newReg._cert_file) fd.append("cert_antecedentes", newReg._cert_file);
          if (newReg.tiene_matricula && newReg._matri_file) fd.append("matricula_archivo", newReg._matri_file);
        }
        const { data } = await api.post("/api/academicos/", fd, { headers: { "Content-Type": "multipart/form-data" } });
        row = ensureCategoria(
          {
            ...data,
            soporte_url: data.archivo || null,
            cert_url: data.cert_antecedentes || null,
            matri_url: data.matricula_archivo || null,
            ...splitLRC(data.libro_registro || ""),
          },
          newReg.categoria
        );
      } else {
        const { data } = await api.post("/api/academicos/", base);
        row = ensureCategoria(
          {
            ...data,
            soporte_url: data.archivo || null,
            cert_url: data.cert_antecedentes || null,
            matri_url: data.matricula_archivo || null,
            ...splitLRC(data.libro_registro || ""),
          },
          newReg.categoria
        );
      }

      // limpiar previews
      ["_local_preview", "_cert_preview", "_matri_preview"].forEach((k) => newReg[k] && URL.revokeObjectURL(newReg[k]));

      setList((prev) => {
        const next = [row, ...prev];
        bumpProgress(next.length);
        return next;
      });
      setNewReg(emptyReg());
      setNewTarget(null);
      setMsg("Guardado.");
    } catch (err) {
      setMsg(`No se pudo crear: ${extractErr(err)}`);
    } finally {
      setSavingNew(false);
    }
  };

  /* editar */
  const startEdit = (reg) => {
    setEditId(reg.id);
    setDraft({ ...reg, _local_file: null, _local_preview: null, _cert_file: null, _cert_preview: null, _matri_file: null, _matri_preview: null });
  };
  const cancelEdit = () => {
    const revoke = (u) => u && URL.revokeObjectURL(u);
    revoke(draft?._local_preview);
    revoke(draft?._cert_preview);
    revoke(draft?._matri_preview);
    setEditId(null);
    setDraft(null);
  };
  const saveEdit = async (id) => {
    setMsg("");
    try {
      const libro_registro = composeLRC(draft);
      const base = buildPayload({ ...draft, libro_registro }, ACADEMICO_FIELDS_UPDATE);

      const mustMultipart = !!(draft._local_file || draft._cert_file || (draft.tiene_matricula && draft._matri_file));

      let row;
      if (mustMultipart) {
        const fd = new FormData();
        Object.entries(base).forEach(([k, v]) => v !== null && v !== undefined && fd.append(k, String(v)));
        if (draft._local_file) fd.append("archivo", draft._local_file);
        if (superiorGrados.has((draft.grado || "").trim())) {
          if (draft._cert_file) fd.append("cert_antecedentes", draft._cert_file);
          if (draft.tiene_matricula && draft._matri_file) fd.append("matricula_archivo", draft._matri_file);
        }
        const { data } = await api.patch(`/api/academicos/${id}/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        row = ensureCategoria(
          {
            ...data,
            soporte_url: data.archivo || null,
            cert_url: data.cert_antecedentes || null,
            matri_url: data.matricula_archivo || null,
            ...splitLRC(data.libro_registro || ""),
          },
          draft.categoria
        );
      } else {
        const { data } = await api.patch(`/api/academicos/${id}/`, base);
        row = ensureCategoria(
          {
            ...data,
            soporte_url: data.archivo || null,
            cert_url: data.cert_antecedentes || null,
            matri_url: data.matricula_archivo || null,
            ...splitLRC(data.libro_registro || ""),
          },
          draft.categoria
        );
      }

      setList((prev) => {
        const next = prev.map((r) => (r.id === id ? row : r));
        bumpProgress(next.length);
        return next;
      });
      cancelEdit();
      setMsg("Guardado.");
    } catch (err) {
      setMsg(`No se pudo guardar: ${extractErr(err)}`);
    }
  };

  /* eliminar */
  const remove = async (id) => {
    if (!window.confirm("¿Eliminar este registro académico?")) return;
    setMsg("");
    try {
      await api.delete(`/api/academicos/${id}/`);
      setList((prev) => {
        const next = prev.filter((r) => r.id !== id);
        bumpProgress(next.length);
        return next;
      });
      setMsg("Eliminado.");
    } catch (err) {
      setMsg(`No se pudo eliminar: ${extractErr(err)}`);
    }
  };

  /* guardar progreso explícito */
  const guardarCambios = async () => {
    if (!estudioId) return;
    try {
      const { data: est } = await api.get(`/api/estudios/${estudioId}/`);
      const actual = Number(est?.progreso || 0);
      const objetivo = list.length > 0 ? 50 : 25;
      const nuevo = Math.max(actual, objetivo);
      await api.post(`/api/estudios/${estudioId}/set_progress/`, { progreso: nuevo });
      window.dispatchEvent(new CustomEvent("estudio:progress", { detail: { estudioId, progreso: nuevo } }));
      setMsg("Progreso actualizado.");
    } catch {
      setMsg("No se pudo guardar el progreso.");
    }
  };

  /* ======= helpers UI ======= */
  const showRegulacion = (r) => r.categoria !== "NO_FORMAL" && superiorGrados.has((r.grado || "").trim());

  const renderFormBlock = (state, setState, gKey) => (
    <>
      <Field label="Grado / Nivel">
        <Select value={state.grado} onChange={(v) => setState((s) => ({ ...s, grado: v }))}>
          {grados.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Título">
        <Input
          placeholder={gKey === "superior" ? "Ej: Ingeniero de Sistemas" : gKey === "no_formal" ? "Ej: Diplomado en..." : "Ej: Básica Primaria"}
          value={state.titulo}
          onChange={(e) => setState((s) => ({ ...s, titulo: sanitizeTitulo(e.target.value) }))}
          maxLength={120}
        />
      </Field>

      <Field label="Institución">
        <Input
          placeholder="Colegio / Universidad / Centro"
          value={state.institucion}
          onChange={(e) => setState((s) => ({ ...s, institucion: sanitizeInstitucion(e.target.value) }))}
          maxLength={120}
        />
      </Field>

      <Field label="Fecha de graduación">
        <Input type="date" value={state.fecha_graduacion || ""} onChange={(e) => setState((s) => ({ ...s, fecha_graduacion: e.target.value }))} />
      </Field>

      <Field label="Ciudad">
        <Input value={state.ciudad} onChange={(e) => setState((s) => ({ ...s, ciudad: sanitizeCiudad(e.target.value) }))} maxLength={80} />
      </Field>

      <Field label="Acta No.">
        <Input value={state.acta_numero} onChange={(e) => setState((s) => ({ ...s, acta_numero: sanitizeNumeroCorto(e.target.value) }))} maxLength={20} />
      </Field>

      <Field label="Folio No.">
        <Input value={state.folio_numero} onChange={(e) => setState((s) => ({ ...s, folio_numero: sanitizeNumeroCorto(e.target.value) }))} maxLength={20} />
      </Field>

      <Field label="Libro">
        <Input value={state.libro_numero} onChange={(e) => setState((s) => ({ ...s, libro_numero: sanitizeLRCPart(e.target.value) }))} maxLength={30} />
      </Field>

      <Field label="Registro">
        <Input value={state.registro_numero} onChange={(e) => setState((s) => ({ ...s, registro_numero: sanitizeLRCPart(e.target.value) }))} maxLength={30} />
      </Field>

      <Field label="Consecutivo">
        <Input value={state.consecutivo_numero} onChange={(e) => setState((s) => ({ ...s, consecutivo_numero: sanitizeLRCPart(e.target.value) }))} maxLength={30} />
      </Field>

      <Field label="Rector(a)">
        <Input value={state.rector} onChange={(e) => setState((s) => ({ ...s, rector: sanitizeNombreLike(e.target.value) }))} maxLength={80} />
      </Field>

      <Field label="Secretario(a) general">
        <Input value={state.secretario_general} onChange={(e) => setState((s) => ({ ...s, secretario_general: sanitizeNombreLike(e.target.value) }))} maxLength={80} />
      </Field>

      <Field label="Secretario(a) académico (opcional)">
        <Input value={state.secretario_academico} onChange={(e) => setState((s) => ({ ...s, secretario_academico: sanitizeNombreLike(e.target.value) }))} maxLength={80} />
      </Field>

      <Field label="Jefe de registro (opcional)">
        <Input value={state.jefe_registro} onChange={(e) => setState((s) => ({ ...s, jefe_registro: sanitizeNombreLike(e.target.value) }))} maxLength={80} />
      </Field>

      {/* Tipo del soporte principal */}
      <Field label="Tipo de soporte">
        <Select value={state.archivo_tipo} onChange={(v) => setState((s) => ({ ...s, archivo_tipo: v }))}>
          <option value="DIPLOMA">Diploma</option>
          <option value="ACTA">Acta de grado</option>
          <option value="OTRO">Otro</option>
        </Select>
      </Field>

      {showRegulacion(state) && (
        <>
          <Field label="Colegio regulador / Consejo profesional">
            <Input
              value={state.colegio_regulador}
              onChange={(e) => setState((s) => ({ ...s, colegio_regulador: sanitizeInstitucion(e.target.value, 120) }))}
              maxLength={120}
              placeholder="Ej: Consejo Profesional Nacional de..."
            />
          </Field>

          <Field label="¿Requiere matrícula profesional?">
            <Select
              value={state.tiene_matricula === null ? "" : state.tiene_matricula ? "1" : "0"}
              onChange={(v) => setState((s) => ({ ...s, tiene_matricula: v === "" ? null : v === "1" }))}
            >
              <option value="">Seleccione…</option>
              <option value="1">Sí</option>
              <option value="0">No</option>
            </Select>
          </Field>

          {state.tiene_matricula && (
            <Field label="Número de matrícula">
              <Input
                value={state.matricula_numero}
                onChange={(e) => setState((s) => ({ ...s, matricula_numero: sanitizeNumeroCorto(e.target.value, 60) }))}
                maxLength={60}
                placeholder="Ej: 12345-ABC"
              />
            </Field>
          )}
        </>
      )}
    </>
  );

  const renderSection = (g) => {
    const rows = list.filter(g.match);
    const isNoFormal = g.key === "no_formal";

    return (
      <details open={!!open[g.key]} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-md">
        <summary
          onClick={(e) => {
            const t = e.target;
            if (t && typeof t.closest === "function" && t.closest("button")) return;
            e.preventDefault();
            setOpen((o) => ({ ...o, [g.key]: !o[g.key] }));
          }}
          className="marker:hidden cursor-pointer select-none text-lg font-semibold text-white/90 outline-none"
        >
          {g.title} <span className="ml-2 text-sm text-white/60">({rows.length})</span>
        </summary>

        <div className="mt-3 space-y-3">
          {/* agregar en este grupo */}
          {newTarget === g.key ? (
            <form onSubmit={add} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="grid gap-4 md:grid-cols-3">
                {renderFormBlock(newReg, setNewReg, g.key)}
                {/* Forzar categoría según grupo */}
                <input type="hidden" value={newReg.categoria} readOnly />
              </div>

              {/* Archivos (crear) */}
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Soporte (Diploma/Acta/otro)" className="md:col-span-1">
                  <div className="flex flex-col gap-3">
                    {(newReg._local_preview) && (
                      <FilePreview
                        url={newReg._local_preview}
                        name={newReg._local_file?.name}
                        mime={newReg._local_file?.type}
                      />
                    )}
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={handleNewFile}
                      className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20"
                    />
                  </div>
                </Field>

                {showRegulacion(newReg) && (
                  <>
                    <Field label="Certificado de vigencia de antecedentes disciplinarios" className="md:col-span-1">
                      <div className="flex flex-col gap-3">
                        {newReg._cert_preview && (
                          <FilePreview url={newReg._cert_preview} name={newReg._cert_file?.name} mime={newReg._cert_file?.type} />
                        )}
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={handleNewCert}
                          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20"
                        />
                      </div>
                    </Field>

                    {newReg.tiene_matricula && (
                      <Field label="Copia de la matrícula profesional" className="md:col-span-1">
                        <div className="flex flex-col gap-3">
                          {newReg._matri_preview && (
                            <FilePreview url={newReg._matri_preview} name={newReg._matri_file?.name} mime={newReg._matri_file?.type} />
                          )}
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            onChange={handleNewMatri}
                            className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20"
                          />
                        </div>
                      </Field>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const revoke = (u) => u && URL.revokeObjectURL(u);
                    revoke(newReg._local_preview);
                    revoke(newReg._cert_preview);
                    revoke(newReg._matri_preview);
                    setNewReg(emptyReg());
                    setNewTarget(null);
                  }}
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20"
                >
                  Cancelar
                </button>
                <button type="submit" disabled={savingNew} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
                  {savingNew ? "Guardando…" : "Agregar"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => startAddIn(g.key)}
                className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
              >
                Agregar en {g.title}
              </button>
            </div>
          )}

          {/* listado */}
          {loading ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-300">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-300">Sin registros en esta sección.</div>
          ) : (
            rows.map((r) =>
              isEditing(r.id) ? (
                <div key={r.id} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {renderFormBlock(draft, setDraft, isNoFormal ? "no_formal" : /primaria|secundaria/i.test(r.grado || "") ? "secundaria" : "superior")}
                  </div>

                  {/* Archivos (editar) */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Soporte (Diploma/Acta/otro)" className="md:col-span-1">
                      <div className="flex flex-col gap-3">
                        {(draft._local_preview || draft.soporte_url) && (
                          <FilePreview
                            url={draft._local_preview || draft.soporte_url}
                            name={draft._local_file?.name || draft.soporte_nombre}
                            mime={draft._local_file?.type || draft.soporte_mime}
                          />
                        )}
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={handleEditFile}
                          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20"
                        />
                      </div>
                    </Field>

                    {showRegulacion(draft) && (
                      <>
                        <Field label="Certificado de vigencia de antecedentes disciplinarios" className="md:col-span-1">
                          <div className="flex flex-col gap-3">
                            {(draft._cert_preview || draft.cert_url) && (
                              <FilePreview url={draft._cert_preview || draft.cert_url} name={draft._cert_file?.name} mime={draft._cert_file?.type} />
                            )}
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              onChange={handleEditCert}
                              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20"
                            />
                          </div>
                        </Field>

                        {draft.tiene_matricula && (
                          <Field label="Copia de la matrícula profesional" className="md:col-span-1">
                            <div className="flex flex-col gap-3">
                              {(draft._matri_preview || draft.matri_url) && (
                                <FilePreview url={draft._matri_preview || draft.matri_url} name={draft._matri_file?.name} mime={draft._matri_file?.type} />
                              )}
                              <input
                                type="file"
                                accept="application/pdf,image/*"
                                onChange={handleEditMatri}
                                className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20"
                              />
                            </div>
                          </Field>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(r.id)}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-lg font-semibold">
                      {r.titulo || "—"}{" "}
                      <span className="text-slate-300">
                        ({r.grado || "—"}{r.categoria === "NO_FORMAL" ? " · No formal" : ""})
                      </span>
                    </div>
                    <div className="text-sm text-slate-300">
                      {r.institucion || "—"} · {r.ciudad || "—"} · {r.fecha_graduacion || "—"}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-slate-300">Acta / Folio</div>
                      <div>{r.acta_numero || "—"} / {r.folio_numero || "—"}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-slate-300">Libro / Registro / Consecutivo</div>
                      <div>
                        {(r.libro_numero || "—")} / {(r.registro_numero || "—")} / {(r.consecutivo_numero || "—")}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-slate-300">Autoridades</div>
                      <div>Rector(a): {r.rector || "—"}</div>
                      <div>Sec. general: {r.secretario_general || "—"}</div>
                      <div>Sec. académico: {r.secretario_academico || "—"}</div>
                      <div>Jefe de registro: {r.jefe_registro || "—"}</div>
                    </div>
                  </div>

                  {showRegulacion(r) && (
                    <>
                      <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="text-slate-300">Colegio regulador</div>
                          <div>{r.colegio_regulador || "—"}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="text-slate-300">Matrícula profesional</div>
                          <div>
                            {r.tiene_matricula === true
                              ? `Sí · ${r.matricula_numero || "—"}`
                              : r.tiene_matricula === false
                              ? "No"
                              : "No aplica"}
                          </div>
                        </div>
                      </div>

                      {/* Soportes adicionales */}
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {r.cert_url && (
                          <div>
                            <div className="mb-1 text-sm text-slate-300">Certificado de antecedentes</div>
                            <FilePreview url={r.cert_url} />
                          </div>
                        )}
                        {r.matri_url && (
                          <div>
                            <div className="mb-1 text-sm text-slate-300">Copia de la matrícula profesional</div>
                            <FilePreview url={r.matri_url} />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {r.soporte_url && (
                    <div className="mt-3">
                      <div className="mb-1 text-sm text-slate-300">Soporte (Diploma/Acta/Otro)</div>
                      <FilePreview url={r.soporte_url} name={r.soporte_nombre} mime={r.soporte_mime} />
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </details>
    );
  };

  /* ======= render ======= */
  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">🎓 Información académica</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={guardarCambios}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white transition bg-emerald-600 hover:bg-emerald-500"
          >
            Guardar progreso
          </button>
        </div>
      </div>

      {msg && <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{msg}</div>}

      {/* SUBTÍTULO: Educación formal */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-white/90">Educación formal</h3>
        {groupsFormal.map((g) => (
          <div key={g.key}>{renderSection(g)}</div>
        ))}
      </div>

      {/* SUBTÍTULO: Educación no formal */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-white/90">Educación no formal</h3>
        {renderSection(groupNoFormal)}
      </div>
    </div>
  );
}
