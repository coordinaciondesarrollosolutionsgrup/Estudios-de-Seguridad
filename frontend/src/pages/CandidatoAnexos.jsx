// src/pages/CandidatoAnexos.jsx
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../api/axios";

/* =================== UI helpers (mismo diseño Económica) =================== */
const inputFileCls =
  "block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20";
const cardCls = "rounded-2xl border border-white/10 bg-white/5 p-3";
const sectionCardCls =
  "rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md shadow-xl";
const headerBtnGhost = (disabled) =>
  `rounded-xl border px-4 py-2 text-sm ${
    disabled
      ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
      : "border-white/10 bg-white/10 text-slate-200 hover:bg-white/20"
  }`;
const headerBtnPrimary = (disabled) =>
  `rounded-xl px-4 py-2 text-sm font-medium text-white transition ${
    disabled ? "cursor-not-allowed bg-slate-600" : "bg-emerald-600 hover:bg-emerald-500"
  }`;

const Placeholder = () => (
  <div className="grid h-28 w-40 place-items-center rounded-xl border border-white/10 bg-white/5 text-xs text-white/60">
    Sin imagen
  </div>
);

/* =================== Validaciones de imagen =================== */
const MAX_IMG_MB = 10;
const MIN_W = 640;
const MIN_H = 480;
const ALLOWED_IMG_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
];
const prettySize = (bytes = 0) => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 1 ? 1 : 2)} MB`;
};
const sanitizeFileName = (name = "") =>
  name.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ()._\- ]/g, "").replace(/\s+/g, " ").trim();

const validateImageFile = (file) => {
  if (!file) return { ok: false, reason: "No seleccionaste un archivo." };
  const typeOk =
    ALLOWED_IMG_MIMES.includes(file.type) ||
    /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(file.name || "");
  if (!typeOk) return { ok: false, reason: "Formato no permitido. Usa una imagen (JPG/PNG/WEBP…)." };
  const maxBytes = MAX_IMG_MB * 1024 * 1024;
  if (file.size > maxBytes) return { ok: false, reason: `El archivo supera ${MAX_IMG_MB} MB (${prettySize(file.size)}).` };
  return { ok: true, reason: "" };
};

const probeImageDims = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const out = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

/* =================== Catálogo / orden y grupos =================== */
/**
 * Nuevos: ESCALERAS, HALL_CORREDOR y comunes específicas (TORRE, RECEPCION, ASCENSORES, TURCO, SAUNA, JACUZZI, BBQ).
 * Se elimina del UI ZONAS_COMUNES y ZONAS_HUMEDAS (solo quedan para históricos en el backend).
 * Se agrega el apartado “Otras fotografías” (OTRAS_1…OTRAS_4).
 */
const ORDER = [
  // Acceso y nomenclatura
  "FACHADA_GENERAL",
  "FACHADA_POSTERIOR",
  "NOMENCLATURA",
  "ENTRADA",
  "ESCALERAS",

  // Zonas sociales vivienda aspirante
  "SALA_GENERAL",
  "SALA_POSTERIOR",
  "COMEDOR",
  "HALL_CORREDOR",

  // Cocina / baños / lavado
  "COCINA",
  "BANO_1",
  "BANO_2",
  "ZONA_LAVADO",

  // Habitaciones
  "ESTUDIO",
  "HABITACION_1",
  "HABITACION_2",
  "HABITACION_3",

  // Exteriores y aledañas
  "PATIO_1",
  "PATIO_2",
  "BALCON_1",
  "BALCON_2",
  "ZONAS_ALED_1",
  "ZONAS_ALED_2",

  // Conjunto / zonas comunes y/o húmedas (específicas)
  "PARQUES",
  "GIMNASIO",
  "TERRAZA",
  "PARQUEADERO_1",
  "PARQUEADERO_2",
  "TORRE",
  "RECEPCION",
  "ASCENSORES",
  "TURCO",
  "SAUNA",
  "JACUZZI",
  "BBQ",

  // Otras
  "OTRAS_1",
  "OTRAS_2",
  "OTRAS_3",
  "OTRAS_4",
];

// Compatibilidad hacia atrás con datos antiguos
const TYPE_ALIASES = {
  PATIO_BALCON_1: "PATIO_1",
  PATIO_BALCON_2: "BALCON_1",
};

const LABELS = {
  FACHADA_GENERAL: "Fachada general",
  FACHADA_POSTERIOR: "Fotografía posterior fachada",
  NOMENCLATURA: "Vista nomenclatura zoom",
  ENTRADA: "Entrada vivienda",
  ESCALERAS: "Escaleras",

  SALA_GENERAL: "Vista general sala",
  SALA_POSTERIOR: "Vista posterior sala",
  COMEDOR: "Comedor",
  HALL_CORREDOR: "Hall o corredor",

  COCINA: "Cocina",
  BANO_1: "Baño 1",
  BANO_2: "Baño 2",
  ZONA_LAVADO: "Zona de lavado",

  ESTUDIO: "Estudio",
  HABITACION_1: "Habitación 1",
  HABITACION_2: "Habitación 2",
  HABITACION_3: "Habitación 3",

  PATIO_1: "Patio 1",
  PATIO_2: "Patio 2",
  BALCON_1: "Balcón 1",
  BALCON_2: "Balcón 2",
  ZONAS_ALED_1: "Vista posterior zonas aledañas 1",
  ZONAS_ALED_2: "Vista posterior zonas aledañas 2",

  // Conjunto (específicas; sin ZONAS_COMUNES/ZONAS_HUMEDAS)
  PARQUES: "Parques",
  GIMNASIO: "Gimnasio",
  TERRAZA: "Terraza",
  PARQUEADERO_1: "Parqueadero 1",
  PARQUEADERO_2: "Parqueadero 2",
  TORRE: "Torre",
  RECEPCION: "Recepción",
  ASCENSORES: "Ascensores",
  TURCO: "Turco",
  SAUNA: "Sauna",
  JACUZZI: "Jacuzzi",
  BBQ: "BBQ",

  // Otras
  OTRAS_1: "Otras fotografías 1",
  OTRAS_2: "Otras fotografías 2",
  OTRAS_3: "Otras fotografías 3",
  OTRAS_4: "Otras fotografías 4",
};

const GROUPS = [
  {
    key: "acceso",
    title: "Acceso y nomenclatura",
    items: ["FACHADA_GENERAL", "FACHADA_POSTERIOR", "NOMENCLATURA", "ENTRADA", "ESCALERAS"],
  },
  {
    key: "social",
    title: "Zonas sociales vivienda aspirante",
    items: ["SALA_GENERAL", "SALA_POSTERIOR", "COMEDOR", "HALL_CORREDOR"],
  },
  {
    key: "servicios",
    title: "Cocina, baños y lavado",
    items: ["COCINA", "BANO_1", "BANO_2", "ZONA_LAVADO"],
  },
  {
    key: "habitaciones",
    title: "Habitaciones",
    items: ["HABITACION_1", "HABITACION_2", "HABITACION_3", "ESTUDIO"],
  },
  {
    key: "exteriores",
    title: "Exteriores y aledañas",
    items: ["PATIO_1", "PATIO_2", "BALCON_1", "BALCON_2", "ZONAS_ALED_1", "ZONAS_ALED_2"],
  },
  {
    key: "comunes",
    title: "Zonas comunes y/o húmedas del conjunto",
    items: [
      "PARQUES",
      "GIMNASIO",
      "TERRAZA",
      "PARQUEADERO_1",
      "PARQUEADERO_2",
      "TORRE",
      "RECEPCION",
      "ASCENSORES",
      "TURCO",
      "SAUNA",
      "JACUZZI",
      "BBQ",
    ],
  },
  {
    key: "otras",
    title: "Otras fotografías",
    items: ["OTRAS_1", "OTRAS_2", "OTRAS_3", "OTRAS_4"],
  },
];

/* =================== Estado por “tipo” =================== */
const emptyItem = (orden) => ({
  id: null,
  orden,
  no_aplica: false,
  archivo_url: null, // guardado
  _file: null, // local
  _preview: null, // objectURL
  saving: false,
  dirty: false,
  checking: false,
  error: "",
  dims: null,
  saved: {
    no_aplica: false,
    archivo_url: null,
  },
});

export default function CandidatoAnexos() {
  const outlet = useOutletContext() || {};
  const studyId = outlet?.studyId ?? null;

  const [items, setItems] = useState(() =>
    Object.fromEntries(ORDER.map((k, i) => [k, emptyItem(i)]))
  );
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState({ acceso: true });
  const [savingAll, setSavingAll] = useState(false);

  /* ------------------- Cargar existentes ------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        if (!studyId) {
          setMsg("No hay estudio activo.");
          setLoading(false);
          return;
        }
        const { data } = await api.get(`/api/anexos/?estudio=${studyId}`);
        if (!mounted) return;
        setItems((prev) => {
          const map = { ...prev };
          (data || []).forEach((row) => {
            const raw = String(row.tipo || "");
            const k = map[raw] ? raw : TYPE_ALIASES[raw];
            if (k && map[k]) {
              map[k] = {
                ...map[k],
                id: row.id,
                no_aplica: !!row.no_aplica,
                archivo_url: row.archivo_url || null,
                orden: row.orden ?? map[k].orden,
                dirty: false,
                checking: false,
                error: "",
                dims: null,
                saved: {
                  no_aplica: !!row.no_aplica,
                  archivo_url: row.archivo_url || null,
                },
              };
            }
          });
          return map;
        });
      } catch {
        setMsg("No se pudieron cargar los anexos.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      Object.values(items).forEach((it) => {
        if (it?._preview) URL.revokeObjectURL(it._preview);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    };
  }, [studyId]);

  /* ------------------- Derivados ------------------- */
  const dirtyCount = useMemo(
    () => Object.values(items).filter((it) => it.dirty).length,
    [items]
  );

  /* ------------------- Handlers ------------------- */
  const toggleNA = (tipo, v) => {
    setItems((s) => {
      const prev = s[tipo];
      if (v && prev._preview) URL.revokeObjectURL(prev._preview);
      const next = {
        ...prev,
        no_aplica: !!v,
        _file: v ? null : prev._file,
        _preview: v ? null : prev._preview,
        error: "",
        checking: false,
        dims: null,
      };
      next.dirty = next.no_aplica !== prev.saved.no_aplica || !!next._file;
      return { ...s, [tipo]: next };
    });
  };

  const onFile = async (tipo, file) => {
    setItems((s) => {
      const prev = s[tipo];
      if (prev._preview) URL.revokeObjectURL(prev._preview);
      const cleared = {
        ...prev,
        _file: null,
        _preview: null,
        checking: false,
        error: "",
        dims: null,
      };
      return { ...s, [tipo]: cleared };
    });

    if (!file) {
      setItems((s) => {
        const prev = s[tipo];
        const next = { ...prev, dirty: prev.no_aplica !== prev.saved.no_aplica };
        return { ...s, [tipo]: next };
      });
      return;
    }

    const safeName = sanitizeFileName(file.name || "");
       const safeFile = new File([file], safeName || file.name, { type: file.type });

    const v = validateImageFile(safeFile);
    if (!v.ok) {
      setItems((s) => ({ ...s, [tipo]: { ...s[tipo], error: v.reason, dirty: false } }));
      return;
    }

    setItems((s) => ({ ...s, [tipo]: { ...s[tipo], checking: true, error: "" } }));
    try {
      const dims = await probeImageDims(safeFile);
      if (dims.width < MIN_W || dims.height < MIN_H) {
        setItems((s) => ({
          ...s,
          [tipo]: {
            ...s[tipo],
            checking: false,
            error: `Resolución muy baja (${dims.width}×${dims.height}). Mínimo ${MIN_W}×${MIN_H}.`,
            dims,
            dirty: false,
          },
        }));
        return;
      }
      const previewUrl = URL.createObjectURL(safeFile);
      setItems((s) => ({
        ...s,
        [tipo]: {
          ...s[tipo],
          _file: safeFile,
          _preview: previewUrl,
          no_aplica: false,
          checking: false,
          error: "",
          dims,
          dirty: true,
        },
      }));
    } catch {
      setItems((s) => ({
        ...s,
        [tipo]: { ...s[tipo], checking: false, error: "No se pudo leer la imagen.", dirty: false },
      }));
    }
  };

  const saveOne = async (tipo) => {
    const it = items[tipo];
    if (!studyId) return;
    if (it.error || it.checking) {
      setMsg(`Corrige la imagen en “${LABELS[tipo] || tipo}” antes de guardar.`);
      return;
    }
    setItems((s) => ({ ...s, [tipo]: { ...it, saving: true } }));
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("estudio", String(studyId));
      fd.append("tipo", tipo);
      fd.append("no_aplica", it.no_aplica ? "true" : "false");
      fd.append("orden", String(it.orden ?? ORDER.indexOf(tipo)));
      if (it._file) fd.append("archivo", it._file);

      let res;
      if (it.id) {
        res = await api.patch(`/api/anexos/${it.id}/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        res = await api.post(`/api/anexos/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      const row = res.data;

      setItems((s) => {
        const prev = s[tipo];
        if (prev._preview) URL.revokeObjectURL(prev._preview);
        const next = {
          ...prev,
          id: row.id,
          no_aplica: !!row.no_aplica,
          archivo_url: row.archivo_url || null,
          _file: null,
          _preview: null,
          saving: false,
          checking: false,
          error: "",
          dims: null,
          dirty: false,
          saved: {
            no_aplica: !!row.no_aplica,
            archivo_url: row.archivo_url || null,
          },
        };
        return { ...s, [tipo]: next };
      });
      setMsg("Guardado.");
    } catch (e) {
      setItems((s) => ({ ...s, [tipo]: { ...s[tipo], saving: false } }));
      const err =
        e?.response?.data?.detail ||
        e?.response?.data?.non_field_errors?.[0] ||
        "No se pudo guardar este anexo.";
      setMsg(err);
    }
  };

  const discardAll = () => {
    setItems((s) => {
      const map = { ...s };
      ORDER.forEach((k) => {
        const it = map[k];
        if (it?._preview) URL.revokeObjectURL(it._preview);
        map[k] = {
          ...it,
          no_aplica: it.saved.no_aplica,
          archivo_url: it.saved.archivo_url,
          _file: null,
          _preview: null,
          checking: false,
          error: "",
          dims: null,
          dirty: false,
        };
      });
      return map;
    });
    setMsg("");
  };

  const saveAll = async () => {
    const invalids = ORDER.filter((k) => items[k]?.dirty && (items[k].error || items[k].checking));
    if (invalids.length) {
      const names = invalids.map((k) => LABELS[k] || k).join(", ");
      setMsg(`Corrige las imágenes inválidas: ${names}.`);
      return;
    }

    const pending = ORDER.filter((k) => items[k]?.dirty);
    if (!pending.length) {
      setMsg("No hay cambios por guardar.");
      return;
    }
    setSavingAll(true);
    setMsg("");
    for (const k of pending) {
      // eslint-disable-next-line no-await-in-loop
      await saveOne(k);
    }
    setSavingAll(false);
  };

  /* ------------------- Row (tarjeta) ------------------- */
  const Row = ({ tipo }) => {
    const it = items[tipo];
    const badge =
      it.dirty ? (
        <span className="ml-2 inline-block rounded bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200 align-middle">
          pendiente
        </span>
      ) : null;

    return (
      <div className={cardCls}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="md:w-1/3">
            <div className="text-sm font-semibold text-white/90">
              {LABELS[tipo] || tipo} {badge}
            </div>
            <label className="mt-1 inline-flex items-center gap-2 text-xs text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={!!it.no_aplica}
                onChange={(e) => toggleNA(tipo, e.target.checked)}
              />
              No aplica
            </label>
            <div className="mt-1 text-[11px] text-white/60">
              Recomendado: ≥ {MIN_W}×{MIN_H}px · máx. {MAX_IMG_MB} MB
            </div>
          </div>

          <div className="md:flex-1 flex items-center gap-3">
            {/* Preview */}
            {it.no_aplica ? (
              <Placeholder />
            ) : it._preview ? (
              <img
                src={it._preview}
                alt="preview"
                className="h-28 w-40 rounded-xl object-cover border border-white/10"
              />
            ) : it.archivo_url ? (
              <img
                src={it.archivo_url}
                alt="soporte"
                className="h-28 w-40 rounded-xl object-cover border border-white/10"
              />
            ) : (
              <Placeholder />
            )}

            {/* Input file + enlace */}
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                disabled={it.no_aplica}
                onChange={(e) => onFile(tipo, e.target.files?.[0] || null)}
                className={`${inputFileCls} ${
                  it.no_aplica ? "opacity-50 cursor-not-allowed" : ""
                } ${it.error ? "ring-1 ring-rose-500/40 border-rose-500/40" : ""}`}
              />
              {it.archivo_url && !it.no_aplica && (
                <a
                  href={it.archivo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-blue-300 underline"
                >
                  Abrir imagen actual
                </a>
              )}
              {it.checking && (
                <div className="mt-1 text-[11px] text-white/70">Validando imagen…</div>
              )}
              {it.error && (
                <div className="mt-1 text-[11px] text-rose-300">{it.error}</div>
              )}
              {it.dims && !it.error && (
                <div className="mt-1 text-[11px] text-white/50">
                  {it.dims.width}×{it.dims.height}px
                </div>
              )}
            </div>

            {/* Guardar fila */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => saveOne(tipo)}
                disabled={it.saving || !it.dirty || !!it.error || it.checking}
                className={`rounded-xl px-3 py-2 text-sm text-white ${
                  it.saving || !it.dirty || !!it.error || it.checking
                    ? "bg-slate-600 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {it.saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ------------------- Render ------------------- */
  return (
    <div className="space-y-6 text-white">
      {/* Header con acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">📷 Anexos fotográficos</h2>
        <div className="flex items-center gap-2">
          <div className="text-xs text-white/70">
            {dirtyCount > 0 ? `${dirtyCount} pendiente(s)` : "Sin cambios"}
          </div>
          <button
            type="button"
            onClick={discardAll}
            disabled={dirtyCount === 0 || savingAll}
            className={headerBtnGhost(dirtyCount === 0 || savingAll)}
          >
            Descartar cambios
          </button>
          <button
            type="button"
            onClick={saveAll}
            disabled={dirtyCount === 0 || savingAll}
            className={headerBtnPrimary(dirtyCount === 0 || savingAll)}
          >
            {savingAll ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {msg}
        </div>
      )}

      {loading ? (
        <div className={sectionCardCls}>Cargando…</div>
      ) : (
        GROUPS.map((g) => {
          const rows = g.items;
          const doneInGroup = rows.filter(
            (k) => items[k]?.no_aplica || items[k]?.archivo_url || items[k]?._file
          ).length;

          return (
            <details
              key={g.key}
              open={!!open[g.key]}
              className={sectionCardCls}
            >
              <summary
                onClick={(e) => {
                  const t = e.target;
                  if (t && typeof t.closest === "function" && t.closest("button")) return;
                  e.preventDefault();
                  setOpen((o) => ({ ...o, [g.key]: !o[g.key] }));
                }}
                className="cursor-pointer select-none text-lg font-semibold text-white/90 outline-none marker:hidden"
              >
                {g.title}{" "}
                <span className="ml-2 text-sm text-white/60">
                  ({doneInGroup}/{rows.length})
                </span>
              </summary>

              <div className="mt-3 space-y-3">
                {rows.map((k) => (
                  <Row key={k} tipo={k} />
                ))}
              </div>
            </details>
          );
        })
      )}
    </div>
  );
}
