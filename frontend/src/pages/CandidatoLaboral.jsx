// src/pages/CandidatoLaboral.jsx
import { useEffect, useState, useMemo } from "react";
import api from "../api/axios";

/* ====== estilos compartidos ====== */
const inputCls =
  "mt-1 w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";
const labelCls = "text-sm text-slate-200 font-medium";
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

/* ====== util ====== */
const TIPO_CONTRATO = [
  "Fijo", "Indefinido", "Obra/Labor", "Prestación de servicios", "Aprendizaje", "Otro",
];
const MAX_EXP = 3;

const sanitizeTexto = (s = "", max = 120) =>
  s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9' .,-]/g, "").replace(/\s+/g, " ").slice(0, max);
const sanitizeTel = (s = "", max = 30) =>
  s.replace(/[^\d+()\-\s]/g, "").slice(0, max);

const emptyRow = () => ({
  empresa: "",
  cargo: "",
  telefono: "",
  email_contacto: "",
  direccion: "",
  ingreso: "",
  retiro: "",
  motivo_retiro: "",
  tipo_contrato: "",
  jefe_inmediato: "",
  jefe_telefono: "",
  verificada_camara: false,
  volveria_contratar: null,
  concepto: "",
  _local_file: null,
  _local_preview: null,
  certificado: null, // url remoto
});

const fileKind = (name = "", type = "") => {
  if (type?.startsWith("image/")) return "image";
  if (name?.toLowerCase().endsWith(".pdf") || type === "application/pdf") return "pdf";
  return "other";
};
const FilePreview = ({ url, name, mime }) => {
  if (!url) return null;
  const kind = fileKind(name, mime);
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
        <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-500">
          Abrir
        </a>
      </div>
    </div>
  );
};
const extractErr = (err) => {
  const d = err?.response?.data;
  if (!d) return "Error desconocido.";
  if (typeof d === "string") return d;
  if (d.detail) return d.detail;
  try {
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join(" | ");
  } catch { return "No se pudo procesar el error."; }
};

/* =================================== Módulo =================================== */
export default function CandidatoLaboral() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [estudioId, setEstudioId] = useState(null);

  // crear
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState(emptyRow());
  const [savingNew, setSavingNew] = useState(false);

  // editar
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const isEditing = (id) => editId === id;

  const cant = list.length;
  const full = useMemo(() => cant >= MAX_EXP, [cant]);

  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      const estRes = await api.get("/api/estudios/");
      const estList = Array.isArray(estRes.data) ? estRes.data : [];
      if (estList.length) setEstudioId(estList[0].id);

      const { data } = await api.get("/api/laborales/");
      setList(Array.isArray(data) ? data : []);
    } catch {
      setMsg("No se pudo cargar tu información laboral.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => {
      if (newRow?._local_preview) URL.revokeObjectURL(newRow._local_preview);
      if (draft?._local_preview) URL.revokeObjectURL(draft._local_preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* archivos */
  const handleNewFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (newRow?._local_preview) URL.revokeObjectURL(newRow._local_preview);
    if (!f) return setNewRow((s) => ({ ...s, _local_file: null, _local_preview: null }));
    const url = URL.createObjectURL(f);
    setNewRow((s) => ({ ...s, _local_file: f, _local_preview: url }));
  };
  const handleEditFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (draft?._local_preview) URL.revokeObjectURL(draft._local_preview);
    if (!f) return setDraft((s) => ({ ...s, _local_file: null, _local_preview: null }));
    const url = URL.createObjectURL(f);
    setDraft((s) => ({ ...s, _local_file: f, _local_preview: url }));
  };

  /* crear */
  const startAdd = () => {
    setAdding(true);
    setNewRow(emptyRow());
  };
  const cancelAdd = () => {
    if (newRow?._local_preview) URL.revokeObjectURL(newRow._local_preview);
    setAdding(false);
    setNewRow(emptyRow());
  };
  const add = async (e) => {
    e.preventDefault();
    if (!estudioId) return setMsg("No se encontró un estudio activo para asociar.");
    setSavingNew(true);
    setMsg("");
    try {
      const base = {
        estudio: estudioId,
        empresa: newRow.empresa,
        cargo: newRow.cargo,
        telefono: newRow.telefono,
        email_contacto: newRow.email_contacto,
        direccion: newRow.direccion,
        ingreso: newRow.ingreso || null,
        retiro: newRow.retiro || null,
        motivo_retiro: newRow.motivo_retiro,
        tipo_contrato: newRow.tipo_contrato,
        jefe_inmediato: newRow.jefe_inmediato,
        jefe_telefono: newRow.jefe_telefono, // 👈 alias backend
        verificada_camara: !!newRow.verificada_camara,
        volveria_contratar: newRow.volveria_contratar,
        concepto: newRow.concepto,
      };

      let row;
      if (newRow._local_file) {
        const fd = new FormData();
        Object.entries(base).forEach(([k, v]) => (v !== undefined && v !== null) && fd.append(k, String(v)));
        fd.append("certificado", newRow._local_file);
        const { data } = await api.post("/api/laborales/", fd, { headers: { "Content-Type": "multipart/form-data" } });
        row = data;
      } else {
        const { data } = await api.post("/api/laborales/", base);
        row = data;
      }
      if (newRow._local_preview) URL.revokeObjectURL(newRow._local_preview);
      setList((prev) => [row, ...prev]);
      setAdding(false);
      setMsg("Guardado.");
    } catch (err) {
      setMsg(`No se pudo crear: ${extractErr(err)}`);
    } finally {
      setSavingNew(false);
    }
  };

  /* editar */
  const startEdit = (r) => {
    setEditId(r.id);
    setDraft({ ...r, _local_file: null, _local_preview: null });
  };
  const cancelEdit = () => {
    if (draft?._local_preview) URL.revokeObjectURL(draft._local_preview);
    setEditId(null);
    setDraft(null);
  };
  const saveEdit = async (id) => {
    setMsg("");
    try {
      const base = {
        empresa: draft.empresa,
        cargo: draft.cargo,
        telefono: draft.telefono,
        email_contacto: draft.email_contacto,
        direccion: draft.direccion,
        ingreso: draft.ingreso || null,
        retiro: draft.retiro || null,
        motivo_retiro: draft.motivo_retiro,
        tipo_contrato: draft.tipo_contrato,
        jefe_inmediato: draft.jefe_inmediato,
        jefe_telefono: draft.jefe_telefono, // 👈 alias backend
        verificada_camara: !!draft.verificada_camara,
        volveria_contratar: draft.volveria_contratar,
        concepto: draft.concepto,
      };

      let row;
      if (draft._local_file) {
        const fd = new FormData();
        Object.entries(base).forEach(([k, v]) => (v !== undefined && v !== null) && fd.append(k, String(v)));
        fd.append("certificado", draft._local_file);
        const { data } = await api.patch(`/api/laborales/${id}/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        row = data;
      } else {
        const { data } = await api.patch(`/api/laborales/${id}/`, base);
        row = data;
      }

      setList((prev) => prev.map((x) => (x.id === id ? row : x)));
      cancelEdit();
      setMsg("Guardado.");
    } catch (err) {
      setMsg(`No se pudo guardar: ${extractErr(err)}`);
    }
  };

  /* eliminar */
  const remove = async (id) => {
    if (!window.confirm("¿Eliminar esta experiencia?")) return;
    setMsg("");
    try {
      await api.delete(`/api/laborales/${id}/`);
      setList((prev) => prev.filter((x) => x.id !== id));
      setMsg("Eliminado.");
    } catch (err) {
      setMsg(`No se pudo eliminar: ${extractErr(err)}`);
    }
  };

  const Banner3 = () => (
    <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
      Por favor, agrega tus <b>últimas 3</b> experiencias laborales. Si tienes más, prioriza las más recientes.
      <span className="ml-2 text-amber-300">({cant}/3)</span>
    </div>
  );

  /* ======= render ======= */
  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">💼 Experiencia laboral</h2>
        <button
          type="button"
          onClick={startAdd}
          disabled={full}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          Agregar experiencia
        </button>
      </div>

      <Banner3 />
      {msg && <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">{msg}</div>}

      {/* Form crear */}
      {adding && (
        <form onSubmit={add} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Empresa"><Input value={newRow.empresa} onChange={(e)=>setNewRow(s=>({...s,empresa:sanitizeTexto(e.target.value)}))} /></Field>
            <Field label="Cargo"><Input value={newRow.cargo} onChange={(e)=>setNewRow(s=>({...s,cargo:sanitizeTexto(e.target.value)}))} /></Field>
            <Field label="Teléfono de empresa"><Input value={newRow.telefono} onChange={(e)=>setNewRow(s=>({...s,telefono:sanitizeTel(e.target.value)}))} /></Field>

            <Field label="Email de contacto"><Input type="email" value={newRow.email_contacto} onChange={(e)=>setNewRow(s=>({...s,email_contacto:e.target.value}))} /></Field>
            <Field label="Dirección"><Input value={newRow.direccion} onChange={(e)=>setNewRow(s=>({...s,direccion:sanitizeTexto(e.target.value,180)}))} /></Field>

            <Field label="Fecha de ingreso"><Input type="date" value={newRow.ingreso||""} onChange={(e)=>setNewRow(s=>({...s,ingreso:e.target.value}))} /></Field>
            <Field label="Fecha de retiro"><Input type="date" value={newRow.retiro||""} onChange={(e)=>setNewRow(s=>({...s,retiro:e.target.value}))} /></Field>
            <Field label="Motivo de retiro (opcional)"><Input value={newRow.motivo_retiro} onChange={(e)=>setNewRow(s=>({...s,motivo_retiro:sanitizeTexto(e.target.value,160)}))} /></Field>

            <Field label="Tipo de contrato">
              <Select value={newRow.tipo_contrato} onChange={(v)=>setNewRow(s=>({...s,tipo_contrato:v.toUpperCase().replaceAll(" ","_").replace("/","_")}))}>
                {TIPO_CONTRATO.map((t)=> <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>

            <Field label="Jefe inmediato"><Input value={newRow.jefe_inmediato} onChange={(e)=>setNewRow(s=>({...s,jefe_inmediato:sanitizeTexto(e.target.value)}))} /></Field>
            <Field label="Teléfono del jefe"><Input value={newRow.jefe_telefono} onChange={(e)=>setNewRow(s=>({...s,jefe_telefono:sanitizeTel(e.target.value)}))} /></Field>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="¿Volverían a contratarte?">
              <Select value={newRow.volveria_contratar === null ? "" : newRow.volveria_contratar ? "1" : "0"}
                onChange={(v)=>setNewRow(s=>({...s,volveria_contratar: v===""?null : v==="1"}))}>
                <option value="">Seleccione…</option>
                <option value="1">Sí</option>
                <option value="0">No</option>
              </Select>
            </Field>
            <Field label="Certificado (opcional)" className="md:col-span-2">
              <div className="flex flex-col gap-3">
                {newRow._local_preview && <FilePreview url={newRow._local_preview} name={newRow._local_file?.name} mime={newRow._local_file?.type} />}
                <input type="file" accept="application/pdf,image/*"
                  onChange={(e)=>{ const f=e.target.files?.[0]||null; if(newRow._local_preview) URL.revokeObjectURL(newRow._local_preview); if(!f) return setNewRow(s=>({...s,_local_file:null,_local_preview:null})); const url=URL.createObjectURL(f); setNewRow(s=>({...s,_local_file:f,_local_preview:url})); }}
                  className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20" />
            </div>
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={cancelAdd} className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20">Cancelar</button>
            <button type="submit" disabled={savingNew} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
              {savingNew ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </form>
      )}

      {/* listado */}
      {loading ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-300">Cargando…</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-300">Sin experiencias registradas.</div>
      ) : (
        list.map((r) =>
          isEditing(r.id) ? (
            <div key={r.id} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Empresa"><Input value={draft.empresa} onChange={(e)=>setDraft(s=>({...s,empresa:sanitizeTexto(e.target.value)}))} /></Field>
                <Field label="Cargo"><Input value={draft.cargo} onChange={(e)=>setDraft(s=>({...s,cargo:sanitizeTexto(e.target.value)}))} /></Field>
                <Field label="Teléfono de empresa"><Input value={draft.telefono} onChange={(e)=>setDraft(s=>({...s,telefono:sanitizeTel(e.target.value)}))} /></Field>

                <Field label="Email de contacto"><Input type="email" value={draft.email_contacto} onChange={(e)=>setDraft(s=>({...s,email_contacto:e.target.value}))} /></Field>
                <Field label="Dirección"><Input value={draft.direccion} onChange={(e)=>setDraft(s=>({...s,direccion:sanitizeTexto(e.target.value,180)}))} /></Field>

                <Field label="Fecha de ingreso"><Input type="date" value={draft.ingreso||""} onChange={(e)=>setDraft(s=>({...s,ingreso:e.target.value}))} /></Field>
                <Field label="Fecha de retiro"><Input type="date" value={draft.retiro||""} onChange={(e)=>setDraft(s=>({...s,retiro:e.target.value}))} /></Field>
                <Field label="Motivo de retiro (opcional)"><Input value={draft.motivo_retiro} onChange={(e)=>setDraft(s=>({...s,motivo_retiro:sanitizeTexto(e.target.value,160)}))} /></Field>

                <Field label="Tipo de contrato">
                  <Select value={draft.tipo_contrato} onChange={(v)=>setDraft(s=>({...s,tipo_contrato:v.toUpperCase().replaceAll(" ","_").replace("/","_")}))}>
                    {TIPO_CONTRATO.map((t)=> <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>

                <Field label="Jefe inmediato"><Input value={draft.jefe_inmediato} onChange={(e)=>setDraft(s=>({...s,jefe_inmediato:sanitizeTexto(e.target.value)}))} /></Field>
                <Field label="Teléfono del jefe"><Input value={draft.jefe_telefono||""} onChange={(e)=>setDraft(s=>({...s,jefe_telefono:sanitizeTel(e.target.value)}))} /></Field>
              </div>

              <div className="grid gap-4">
                <Field label="Certificado (opcional)" className="md:col-span-3">
                  <div className="flex flex-col gap-3">
                    {(draft._local_preview || draft.certificado) && (
                      <FilePreview url={draft._local_preview || draft.certificado} name={draft._local_file?.name} mime={draft._local_file?.type} />
                    )}
                    <input type="file" accept="application/pdf,image/*" onChange={handleEditFile}
                      className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20" />
                  </div>
                </Field>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={cancelEdit} className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20">Cancelar</button>
                <button type="button" onClick={()=>saveEdit(r.id)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Guardar</button>
              </div>
            </div>
          ) : (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-lg font-semibold">{r.empresa || "—"} <span className="text-slate-300">({r.cargo || "—"})</span></div>
                <div className="text-sm text-slate-300">{r.ingreso || "—"} — {r.retiro || "Actual"}</div>
              </div>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-slate-300">Contacto</div>
                  <div>Tel: {r.telefono || "—"}</div>
                  <div>Email: {r.email_contacto || "—"}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-slate-300">Jefe inmediato</div>
                  <div>{r.jefe_inmediato || "—"}</div>
                  <div>Tel: {r.jefe_telefono || "—"}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-slate-300">Tipo / Motivo retiro</div>
                  <div>{(r.tipo_contrato || "").replace(/_/g," ") || "—"}</div>
                  <div>{r.motivo_retiro || "—"}</div>
                </div>
              </div>

              {r.certificado && (
                <div className="mt-3">
                  <div className="mb-1 text-sm text-slate-300">Certificado</div>
                  <FilePreview url={r.certificado} />
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" onClick={()=>startEdit(r)} className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20">Editar</button>
                <button type="button" onClick={()=>remove(r.id)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500">Eliminar</button>
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}
