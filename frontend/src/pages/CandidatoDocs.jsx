// src/pages/CandidatoDocs.jsx
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../api/axios";

/* ====== estilos reutilizables ====== */
const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";

/* ====== primitivas ====== */
const Field = ({ label, children, hint, className = "" }) => (
  <label className={`block ${className}`}>
    {label && <div className="text-sm text-slate-200 font-medium">{label}</div>}
    {children}
    {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
  </label>
);

const Select = ({ value, onChange, children, className = "" }) => (
  <select
    value={value ?? ""}
    onChange={(e) => onChange?.(e.target.value)}
    className={`${inputCls} mt-1 pr-8 ${className}`}
  >
    {children}
  </select>
);

const Pill = ({ color = "slate", children }) => {
  const map = {
    slate: "bg-white/10 text-slate-200",
    green: "bg-emerald-600/20 text-emerald-300",
    amber: "bg-amber-600/20 text-amber-200",
    red: "bg-rose-600/20 text-rose-200",
    blue: "bg-blue-600/20 text-blue-200",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[color]}`}>{children}</span>;
};

/* ====== helpers de archivos ====== */
const MAX_FILE_MB = 10;
const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff", "image/heic", "image/heif"];
const prettySize = (bytes = 0) => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 1 ? 1 : 2)} MB`;
};
const sanitizeFileName = (name = "") =>
  name.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ()._\- ]/g, "").replace(/\s+/g, " ").trim();

const validateFile = (file) => {
  if (!file) return { ok: false, reason: "No seleccionaste un archivo." };
  if (!ALLOWED_MIMES.includes(file.type)) {
    const lower = file.name.toLowerCase();
    const byExt = /\.(pdf|jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/.test(lower);
    if (!byExt) return { ok: false, reason: "Formato no permitido. Usa PDF o imagen (JPG/PNG/WEBP…)." };
  }
  const maxBytes = MAX_FILE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { ok: false, reason: `El archivo supera ${MAX_FILE_MB} MB (${prettySize(file.size)}).` };
  }
  return { ok: true, reason: "" };
};

const fileKind = (name = "", type = "") => {
  if (type?.startsWith("image/")) return "image";
  if (name.toLowerCase().endsWith(".pdf") || type === "application/pdf") return "pdf";
  return "other";
};

const FileThumb = ({ url, name, mime }) => {
  const kind = fileKind(name, mime);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-2">
      {kind === "image" ? (
        <img src={url} alt={name || "archivo"} className="h-16 w-20 rounded object-cover" />
      ) : (
        <div className="grid h-16 w-20 place-items-center rounded bg-white/5 text-xs text-white/70">
          {kind === "pdf" ? "PDF" : "Archivo"}
        </div>
      )}
      <div className="text-xs">
        <div className="truncate max-w-[220px]">{name || "archivo"}</div>
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

/* ====== Tipos de documento (LIBRETA_MILITAR eliminado) ====== */
const DOC_TYPES = [
  { key: "PASAPORTE", label: "Pasaporte", required: false, unique: true },
  // { key: "LIBRETA_MILITAR", label: "Libreta militar", required: false, unique: true }, // eliminado
  { key: "LICENCIAS", label: "Licencias", required: false, unique: false },
  { key: "CERTIFICACIONES_NACIONALES", label: "Certificaciones nacionales", required: false, unique: false },
  { key: "CERTIFICACIONES_INTERNACIONALES", label: "Certificaciones ISO u otras normas internacionales", required: false, unique: false },
  { key: "CURSOS_ESPECIALIZADOS", label: "Cursos especializados", required: false, unique: false },
  { key: "RECONOCIMIENTOS_PUBLICACIONES", label: "Reconocimientos o publicaciones", required: false, unique: false },
  { key: "OTROS_ANEXOS", label: "Otros anexos documentales", required: false, unique: false },
];

const STATUS_COLOR = (s) =>
  s === "VALIDADO" ? "green" : s === "HALLAZGO" ? "red" : s === "EN_VALIDACION" ? "blue" : "slate";

/* ====== Módulo ====== */
export default function CandidatoDocs() {
  const outlet = useOutletContext() || {};
  const studyIdFromOutlet = outlet?.studyId ?? null;

  const [studyId, setStudyId] = useState(studyIdFromOutlet);
  const [docs, setDocs] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // uploader
  const [tipo, setTipo] = useState(DOC_TYPES[0].key);
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // “Guardar cambios” (progreso 100)
  const [savingProg, setSavingProg] = useState(false);

  const isDirty = !!file;

  // ===== progreso en Docs (75%↔90% y Guardar=100) =====
  const bumpProgress = async (countAfterChange) => {
    const id = studyId;
    if (!id) return;
    try {
      const { data: est } = await api.get(`/api/estudios/${id}/`);
      const actual = Number(est?.progreso || 0);
      let nuevo = actual;

      if (countAfterChange === 0) {
        nuevo = 75;
      } else if (actual < 90) {
        nuevo = 90;
      }

      if (nuevo !== actual) {
        await api.post(`/api/estudios/${id}/set_progress/`, { progreso: nuevo });
        window.dispatchEvent(new CustomEvent("study-progress", { detail: { studyId: id, total: nuevo } }));
      }
    } catch (e) {
      console.warn("No se pudo actualizar progreso", e?.response?.data || e);
    }
  };

  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      if (!studyIdFromOutlet) {
        const estRes = await api.get("/api/estudios/");
        const estList = Array.isArray(estRes.data) ? estRes.data : [];
        if (estList.length) setStudyId(estList[0].id);
      }
      const { data } = await api.get("/api/documentos/");
      setDocs(Array.isArray(data) ? data : []);
    } catch {
      setMsg("No se pudieron cargar tus documentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setStudyId(studyIdFromOutlet || studyId);
  }, [studyIdFromOutlet]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mapa presentes por tipo
  const presentByType = useMemo(() => {
    const map = {};
    docs.forEach((d) => {
      map[d.tipo] = (map[d.tipo] || 0) + 1;
    });
    return map;
  }, [docs]);

  const missingRequired = DOC_TYPES.filter((t) => t.required && !presentByType[t.key]);

  // agrupación por tipo
  const grouped = useMemo(() => {
    const map = {};
    docs.forEach((d) => {
      (map[d.tipo] = map[d.tipo] || []).push(d);
    });
    return map;
  }, [docs]);

  // ====== validación contextual: tipo único ======
  const tipoConfig = useMemo(() => DOC_TYPES.find((t) => t.key === tipo) || DOC_TYPES[0], [tipo]);
  const tipoEsUnico = !!tipoConfig?.unique;

  // ====== handlers de archivo ====== 
  const acceptFile = (picked) => {
    if (!picked) {
      setFile(null);
      setFileErr("");
      return;
    }
    const cleanedName = sanitizeFileName(picked.name);
    const safeFile = new File([picked], cleanedName || picked.name, { type: picked.type });
    const v = validateFile(safeFile);
    if (!v.ok) {
      setFile(null);
      setFileErr(v.reason);
      return;
    }
    setFile(safeFile);
    setFileErr("");
  };

  const onFileChange = (e) => acceptFile(e.target.files?.[0] || null);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) acceptFile(e.dataTransfer.files[0]);
  };

  const upload = async (e) => {
    e?.preventDefault?.();
    if (!file) {
      setMsg("Selecciona un archivo.");
      return;
    }
    if (fileErr) {
      setMsg(fileErr);
      return;
    }

    const existentes = (grouped[tipo] || []).map((d) => d.id); // para reemplazo si corresponde

    setUploading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("tipo", tipo);
      fd.append("archivo", file);
      const { data } = await api.post("/api/documentos/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // UI: si el tipo es único, deja solo el recién subido
      setDocs((prev) => {
        const sinViejos = tipoEsUnico ? prev.filter((x) => x.tipo !== tipo) : prev;
        const next = [data, ...sinViejos];
        bumpProgress(next.length);
        return next;
      });

      // Backend: elimina los anteriores (si tipo único)
      if (tipoEsUnico && existentes.length) {
        Promise.allSettled(existentes.map((id) => api.delete(`/api/documentos/${id}/`))).catch(() => {});
      }

      setFile(null);
      setFileErr("");
    } catch (err) {
      const d = err?.response?.data;
      const detail =
        d?.detail || d?.non_field_errors?.[0] || (typeof d === "string" ? d : JSON.stringify(d || {}));
      setMsg(`No se pudo subir el documento: ${detail}`);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("¿Eliminar este documento?")) return;
    setMsg("");
    try {
      await api.delete(`/api/documentos/${id}/`);
      setDocs((prev) => {
        const next = prev.filter((x) => x.id !== id);
        bumpProgress(next.length);
        return next;
      });
    } catch {
      setMsg("No se pudo eliminar el documento.");
    }
  };

  // acciones header
  const descartarCambios = () => {
    setFile(null);
    setFileErr("");
    setMsg("");
  };

  const guardarCambios = async () => {
    const id = studyId;
    if (!id) return;
    setSavingProg(true);
    try {
      await api.post(`/api/estudios/${id}/set_progress/`, { progreso: 100 });
      window.dispatchEvent(new CustomEvent("study-progress", { detail: { studyId: id, total: 100 } }));
      setMsg("Progreso actualizado.");
    } catch {
      setMsg("No se pudo guardar el progreso.");
    } finally {
      setSavingProg(false);
    }
  };

  /* ====== UI ====== */
  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">📄 Documentos</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={descartarCambios}
            disabled={!isDirty}
            className={`rounded-xl border px-4 py-2 text-sm ${
              !isDirty
                ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
                : "border-white/10 bg-white/10 text-slate-200 hover:bg-white/20"
            }`}
          >
            Descartar cambios
          </button>
          <button
            type="button"
            onClick={guardarCambios}
            disabled={savingProg}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition ${
              savingProg ? "cursor-not-allowed bg-slate-600" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {savingProg ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {missingRequired.length > 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Faltan documentos obligatorios: <b>{missingRequired.map((t) => t.label).join(", ")}</b>
        </div>
      )}

      {msg && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {msg}
        </div>
      )}

      {/* Subir */}
      <form onSubmit={upload} className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-xl space-y-4">
        <div className="text-lg font-semibold">Adjuntar documento</div>

        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Categoría">
            <Select value={tipo} onChange={setTipo}>
              {DOC_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>

            {tipoEsUnico && (grouped[tipo]?.length || 0) > 0 && (
              <div className="mt-1 text-xs text-blue-200">
                Ya tienes un archivo de esta categoría. Si subes uno nuevo, <b>reemplazaré</b> el existente.
              </div>
            )}
          </Field>

          <Field
            label={`Archivo (PDF o imagen) — máx. ${MAX_FILE_MB} MB`}
            className="md:col-span-2"
            hint={file ? `${sanitizeFileName(file.name)} • ${prettySize(file.size)}` : undefined}
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 px-3 text-sm ${
                dragOver ? "ring-2 ring-blue-500/40" : ""
              } ${fileErr ? "border-rose-500/40 ring-1 ring-rose-500/40" : ""}`}
            >
              {file ? (
                <div className="flex items-center gap-3">
                  <Pill color="blue">Listo para subir</Pill>
                  <span className="truncate max-w-[300px]">{sanitizeFileName(file.name)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setFileErr("");
                    }}
                    className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/20"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div className="text-slate-300">
                  Arrastra y suelta aquí o{" "}
                  <label className="cursor-pointer underline">
                    selecciona un archivo
                    <input type="file" accept={ALLOWED_MIMES.join(",")} onChange={onFileChange} className="hidden" />
                  </label>
                </div>
              )}
            </div>
            {fileErr && <div className="mt-1 text-xs text-rose-300">{fileErr}</div>}
          </Field>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!file || uploading || !!fileErr}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {uploading ? "Subiendo…" : "Subir documento"}
          </button>
        </div>
      </form>

      {/* Listado */}
      <div className="space-y-4">
        <div className="text-xl font-semibold">Mis documentos</div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-300">Cargando…</div>
        ) : docs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-300">Aún no has subido documentos.</div>
        ) : (
          DOC_TYPES.map((t) => {
            const items = grouped[t.key] || [];
            if (items.length === 0 && !t.required) return null;
            return (
              <div key={t.key} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-lg font-semibold">
                    {t.label} {t.required && <Pill color="amber">Obligatorio</Pill>}
                  </div>
                  {t.unique && items.length > 1 && <Pill color="red">Se esperaba un único archivo</Pill>}
                </div>

                {items.length === 0 ? (
                  <div className="text-sm text-slate-300">Sin archivos.</div>
                ) : (
                  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((d) => (
                      <li key={d.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <FileThumb url={d.archivo_url} name={d.nombre} mime={d.mime} />
                          <div className="space-y-2 text-right">
                            <Pill color={STATUS_COLOR(d.estado || "PENDIENTE")}>{d.estado || "PENDIENTE"}</Pill>
                            <button
                              type="button"
                              onClick={() => remove(d.id)}
                              className="rounded-lg bg-rose-600 px-2 py-1 text-xs text-white hover:bg-rose-500"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                        {d.comentario && (
                          <div className="mt-2 text-xs text-slate-300">
                            <b>Obs.:</b> {d.comentario}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
