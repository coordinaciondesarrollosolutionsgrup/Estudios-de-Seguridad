import React, { useState, useEffect, useCallback } from "react";
import api from "../api/axios";

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";
const labelCls = "text-sm text-slate-200 font-medium";
const buttonCls =
  "rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold shadow-md hover:bg-blue-700 transition-all text-sm";

const Field = ({ label, hint, className = "", children }) => (
  <label className={`block ${className}`}>
    {label && <div className={labelCls}>{label}</div>}
    {children}
    {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
  </label>
);

function AccordionItem({ title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 shadow-xl mb-4">
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
        <span
          className={`text-white/70 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      <div
        className={`grid gap-4 border-t border-white/10 px-4 transition-[grid-template-rows,opacity] ${
          open
            ? "py-4 opacity-100"
            : "grid-rows-[0fr] overflow-hidden opacity-0"
        }`}
      >
        <div className="grid gap-4">{open && children}</div>
      </div>
    </div>
  );
}

const ESTADO_VIVIENDA = [
  "CONSTRUIDA TERMINADA",
  "EN CONSTRUCCIÓN",
  "OBRA NEGRA GRIS",
  "REMODELADA",
];
const ILUMINACION = ["BUENA", "REGULAR", "MALA", "DEFICIENTE"];
const VENTILACION = ["BUENA", "REGULAR", "MALA", "DEFICIENTE"];
const ASEO = ["BUENA", "REGULAR", "MALA", "CUIDADOSO"];
const SERVICIOS_PUBLICOS = [
  "AGUA",
  "GAS NATURAL",
  "ENERGÍA",
  "ALCANTARILLADO",
  "TELÉFONO FIJO",
  "INTERNET OTRO",
  "STREAMING",
  "EMERGENCIA",
  "SEGURIDAD",
];
const CONDICIONES = [
  "ASEADA",
  "SUCIA",
  "ORGANIZADA",
  "DESPLEGABLE",
  "LIMPIA-CUIDADOSA",
];
const TENENCIA = ["PROPIA", "ARRIENDO", "LEASING", "HIPOTECA", "PRÉSTAMO"];
const TIPO_INMUEBLE = [
  "CASA",
  "APTO",
  "HABITACIÓN",
  "FINCA",
  "OTRO",
  "TIEMPO PERMANENCIA",
];
const ESPACIOS = [
  "SALA",
  "COMEDOR",
  "HABITACIÓN",
  "COCINA",
  "HALL/CORREDOR",
  "BALCÓN",
  "GARAGE",
  "TERRAZA",
  "PATIO",
  "ZONA DE LAVADO",
  "BAÑOS",
  "DEPÓSITO",
];
const VIAS_APROXIMACION = [
  "PAVIMENTADAS",
  "DESTAPADAS",
  "EN OBRA",
  "ILUMINACIÓN AUSENTE",
  "SIN ILUMINACIÓN",
];

export default function CandidatoVivienda() {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [draft, setDraft] = useState({
    estado_vivienda: "",
    iluminacion: "",
    ventilacion: "",
    aseo: "",
    servicios_publicos: [],
    condiciones: "",
    tenencia: "",
    tipo_inmueble: "",
    espacios: [],
    vias_aproximacion: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [needsCreate, setNeedsCreate] = useState(false);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const { data } = await api.get("/api/candidatos/me/descripcion_vivienda/");
      const base = data || {};
      setInfo(base);
      setNeedsCreate(false);
      setDraft({
        ...base,
        servicios_publicos: base?.servicios_publicos?.split(",") || [],
        espacios: base?.espacios?.split(",") || [],
        // ✅ mejora 3: cargar vías de aproximación como array
        vias_aproximacion: base?.vias_aproximacion?.split(",") || [],
      });
    } catch (err) {
      if (err?.response?.status === 404) {
        setNeedsCreate(true);
        setMsg("");
      } else {
        setMsg("No se pudo cargar la descripción de vivienda.");
      }
      setInfo(null);
      setDraft({
        estado_vivienda: "",
        iluminacion: "",
        ventilacion: "",
        aseo: "",
        servicios_publicos: [],
        condiciones: "",
        tenencia: "",
        tipo_inmueble: "",
        espacios: [],
        // ✅ mantener consistente: array
        vias_aproximacion: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    const draftClean = {
      ...draft,
      servicios_publicos: draft.servicios_publicos.join(","),
      espacios: draft.espacios.join(","),
      // ✅ mejora 2: guardar vías de aproximación como string separado por coma
      vias_aproximacion: Array.isArray(draft.vias_aproximacion)
        ? draft.vias_aproximacion.join(",")
        : "",
    };
    try {
      let data;
      if (needsCreate) {
        const resp = await api.post(
          "/api/candidatos/me/descripcion_vivienda/",
          draftClean
        );
        data = resp.data;
        setNeedsCreate(false);
      } else {
        const resp = await api.patch(
          "/api/candidatos/me/descripcion_vivienda/",
          draftClean
        );
        data = resp.data;
      }
      setInfo(data);
      setMsg("Guardado exitoso.");
    } catch (err) {
      if (err?.response?.status === 400) {
        const detail = err?.response?.data;
        if (typeof detail === "string") {
          setMsg(detail);
        } else if (typeof detail === "object" && detail !== null) {
          setMsg(
            Object.entries(detail)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .join(" | ")
          );
        } else {
          setMsg("Error de validación. Verifica los campos obligatorios.");
        }
      } else {
        setMsg("Error al guardar.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="text-white">Cargando descripción de vivienda...</div>
    );

  return (
    <div className="max-w-3xl mx-auto p-4 text-white">
      <h2 className="text-2xl font-bold mb-4">🏠 Descripción de la vivienda</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <AccordionItem
          title="Características principales"
          subtitle="Estado, iluminación, ventilación, aseo, servicios públicos"
          defaultOpen
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Estado vivienda">
              <select
                className={inputCls}
                value={draft.estado_vivienda}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, estado_vivienda: e.target.value }))
                }
              >
                <option value="">Seleccione...</option>
                {ESTADO_VIVIENDA.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Iluminación">
              <select
                className={inputCls}
                value={draft.iluminacion}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, iluminacion: e.target.value }))
                }
              >
                <option value="">Seleccione...</option>
                {ILUMINACION.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Ventilación">
              <select
                className={inputCls}
                value={draft.ventilacion}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, ventilacion: e.target.value }))
                }
              >
                <option value="">Seleccione...</option>
                {VENTILACION.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Aseo">
              <select
                className={inputCls}
                value={draft.aseo}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, aseo: e.target.value }))
                }
              >
                <option value="">Seleccione...</option>
                {ASEO.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>

            <div className="col-span-2">
              <Field label="Servicios públicos">
                <div className="flex flex-wrap gap-2">
                  {SERVICIOS_PUBLICOS.map((opt) => (
                    <label key={opt} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={draft.servicios_publicos.includes(opt)}
                        onChange={() => {
                          setDraft((d) => {
                            const arr = d.servicios_publicos.includes(opt)
                              ? d.servicios_publicos.filter((x) => x !== opt)
                              : [...d.servicios_publicos, opt];
                            return { ...d, servicios_publicos: arr };
                          });
                        }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </AccordionItem>

        <AccordionItem
          title="Condiciones y espacios"
          subtitle="Condiciones, tenencia, tipo inmueble, espacios, vías de aproximación"
          defaultOpen
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Condiciones">
              <select
                className={inputCls}
                value={draft.condiciones}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, condiciones: e.target.value }))
                }
              >
                <option value="">Seleccione...</option>
                {CONDICIONES.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tenencia">
              <select
                className={inputCls}
                value={draft.tenencia}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, tenencia: e.target.value }))
                }
              >
                <option value="">Seleccione...</option>
                {TENENCIA.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tipo de inmueble">
              <select
                className={inputCls}
                value={draft.tipo_inmueble}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, tipo_inmueble: e.target.value }))
                }
              >
                <option value="">Seleccione...</option>
                {TIPO_INMUEBLE.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>

            <div className="col-span-2">
              <Field label="Espacios">
                <div className="flex flex-wrap gap-2">
                  {ESPACIOS.map((opt) => (
                    <label key={opt} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={draft.espacios.includes(opt)}
                        onChange={() => {
                          setDraft((d) => {
                            const arr = d.espacios.includes(opt)
                              ? d.espacios.filter((x) => x !== opt)
                              : [...d.espacios, opt];
                            return { ...d, espacios: arr };
                          });
                        }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            {/* ✅ mejora 1: reemplazo del select por checkboxes */}
            <div className="col-span-2">
              <Field label="Vías de aproximación">
                <div className="flex flex-wrap gap-2">
                  {VIAS_APROXIMACION.map((opt) => (
                    <label key={opt} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={
                          Array.isArray(draft.vias_aproximacion)
                            ? draft.vias_aproximacion.includes(opt)
                            : false
                        }
                        onChange={() => {
                          setDraft((d) => {
                            const arr = Array.isArray(d.vias_aproximacion)
                              ? d.vias_aproximacion
                              : [];
                            const newArr = arr.includes(opt)
                              ? arr.filter((x) => x !== opt)
                              : [...arr, opt];
                            return { ...d, vias_aproximacion: newArr };
                          });
                        }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </AccordionItem>

        <button type="submit" className={buttonCls} disabled={saving}>
          Guardar
        </button>
        {msg && <div className="mt-2 text-blue-300">{msg}</div>}
      </form>
    </div>
  );
}
    