import { useEffect, useState, useCallback } from "react";
import api from "../api/axios";

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";
const inputErrorCls = "border-red-500 focus:border-red-500 ring-2 ring-red-300/40";
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

const Input = ({ className = "", ...rest }) => (
  <input className={`${inputCls} mt-1 ${className}`} {...rest} />
);
const TextArea = ({ className = "", rows = 4, ...rest }) => (
  <textarea rows={rows} className={`${inputCls} mt-1 ${className}`} {...rest} />
);

const emptyPariente = {
  parentesco: "",
  nombre_apellido: "",
  ocupacion: "",
  telefono: "",
  ciudad: "",
  vive_con_el: false,
};
const emptyHijo = { nombre_apellido: "", ocupacion: "", vive_con_el: false };
const emptyConviviente = {
  parentesco: "",
  nombre_apellido: "",
  ocupacion: "",
  telefono: "",
};

export default function CandidatoInfoFamiliar() {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [draft, setDraft] = useState({
    parientes: [emptyPariente],
    hijos: [emptyHijo],
    convivientes: [emptyConviviente],
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // Estados para remarcar filas con error
  const [parientesError, setParientesError] = useState([]); // array de objetos: {parentesco: bool, nombre_apellido: bool}
  const [hijosError, setHijosError] = useState([]);
  const [convivientesError, setConvivientesError] = useState([]);
  const [accordionError, setAccordionError] = useState({ parientes: false });
  // Flag para saber si hay que crear (POST) o actualizar (PATCH)
  const [needsCreate, setNeedsCreate] = useState(false);

  const setVal = (k, v) => {
    setDraft((s) => ({ ...s, [k]: v }));
  };

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const { data } = await api.get("/api/candidatos/me/informacion_familiar/");
      const base = data || {};
      setInfo(base);
      setNeedsCreate(false); // Ya existe, se usará PATCH
      setDraft({
        ...base,
        parientes: base?.parientes || [],
        hijos: base?.hijos || [],
        convivientes: base?.convivientes || [],
      });
    } catch (err) {
      // Si es 404, significa que no existe aún, así que usaremos POST
      if (err?.response?.status === 404) {
        setNeedsCreate(true);
        setMsg(""); // No mostrar error, es flujo normal
      } else {
        setMsg("No se pudo cargar la información familiar.");
      }
      setInfo(null);
      setDraft({
        parientes: [],
        hijos: [],
        convivientes: [],
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
    // Validar campos obligatorios y remarcar filas con error
    let parientesErr = [];
    let hijosErr = [];
    let convivientesErr = [];
    // Limpiar arrays de filas vacías y marcar errores
    const cleanParientes = (draft.parientes || []).filter((row, idx) => {
      const errObj = {
        parentesco: !row.parentesco?.trim(),
        nombre_apellido: !row.nombre_apellido?.trim(),
      };
      parientesErr[idx] = errObj;

      // Si todos los campos están vacíos, no enviar la fila
      const allEmpty =
        !row.parentesco &&
        !row.nombre_apellido &&
        !row.ocupacion &&
        !row.telefono &&
        !row.ciudad;
      return !allEmpty;
    });

    const cleanHijos = (draft.hijos || []).filter((row, idx) => {
      hijosErr[idx] = false; // No remarcar ni validar
      // Si todos los campos están vacíos, no enviar la fila
      const allEmpty = !row.nombre_apellido && !row.ocupacion;
      return !allEmpty;
    });

    const cleanConvivientes = (draft.convivientes || []).filter((row, idx) => {
      convivientesErr[idx] = false; // No remarcar ni validar
      // Si todos los campos están vacíos, no enviar la fila
      const allEmpty = !row.parentesco && !row.nombre_apellido && !row.ocupacion && !row.telefono;
      return !allEmpty;
    });

    setParientesError(parientesErr);
    setHijosError(hijosErr);
    setConvivientesError(convivientesErr);

    setAccordionError({
      parientes: parientesErr.some(
        (e, i) => (e?.parentesco || e?.nombre_apellido) && cleanParientes[i]
      ),
    });

    // Si hay algún error, no guardar y mostrar mensaje
    if (
      parientesErr.some(
        (e, i) => (e?.parentesco || e?.nombre_apellido) && cleanParientes[i]
      ) ||
      !draft.estado_civil
    ) {
      setMsg("Completa los campos obligatorios marcados en rojo.");
      setSaving(false);
      return;
    }
    // Preparar draft limpio
    const draftClean = {
      ...draft,
      parientes: cleanParientes,
      hijos: cleanHijos,
      convivientes: cleanConvivientes,
    };
    try {
      let data;
      if (needsCreate) {
        const resp = await api.post(
          "/api/candidatos/me/informacion_familiar/",
          draftClean
        );
        data = resp.data;
        setNeedsCreate(false);
      } else {
        const resp = await api.patch(
          "/api/candidatos/me/informacion_familiar/",
          draftClean
        );
        data = resp.data;
      }
      setInfo(data);
      setMsg("Guardado exitoso.");
    } catch (err) {
      if (err?.response?.status === 400) {
        // Mostrar mensaje detallado del backend si existe
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
    return <div className="text-white">Cargando información familiar...</div>;

  // Helpers para listas
  const handleListChange = (type, idx, field, value) => {
    setDraft((s) => {
      const arr = Array.isArray(s[type]) ? [...s[type]] : [];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...s, [type]: arr };
    });
  };

  const handleAddRow = (type, emptyObj) => {
    setDraft((s) => {
      const arr = Array.isArray(s[type]) ? [...s[type]] : [];
      arr.push(emptyObj);
      return { ...s, [type]: arr };
    });
  };

  const handleRemoveRow = (type, idx) => {
    setDraft((s) => {
      const arr = Array.isArray(s[type]) ? [...s[type]] : [];
      arr.splice(idx, 1);
      // Ya no se fuerza una fila vacía si la lista queda vacía
      return { ...s, [type]: arr };
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-4 text-white">
      <h2 className="text-2xl font-bold mb-4">👨‍👩‍👧‍👦 Información Familiar</h2>
      <div className="space-y-4">
        <AccordionItem
          title="Datos principales"
          subtitle="Estado civil, pareja, empresa, observaciones"
          defaultOpen
        >
          <Field label="Estado civil">
            <select
              className={`${inputCls} mt-1 w-48 min-w-[140px] px-3 py-2${
                !draft?.estado_civil ? ` ${inputErrorCls}` : ""
              }`}
              value={draft?.estado_civil || ""}
              onChange={(e) => setVal("estado_civil", e.target.value)}
            >
              <option value="">Seleccione...</option>
              <option value="Soltero">Soltero</option>
              <option value="Casado">Casado</option>
              <option value="Union libre">Unión libre</option>
              <option value="Separado">Separado</option>
              <option value="Divorciado">Divorciado</option>
              <option value="Viudo">Viudo</option>
            </select>
          </Field>

          <Field label="Nombre de pareja">
            <Input
              value={draft?.nombre_pareja || ""}
              onChange={(e) => setVal("nombre_pareja", e.target.value)}
            />
          </Field>
          <Field label="Ocupación de pareja">
            <Input
              value={draft?.ocupacion_pareja || ""}
              onChange={(e) => setVal("ocupacion_pareja", e.target.value)}
            />
          </Field>
          <Field label="Empresa de pareja">
            <Input
              value={draft?.empresa_pareja || ""}
              onChange={(e) => setVal("empresa_pareja", e.target.value)}
            />
          </Field>
          <Field label="Observaciones">
            <TextArea
              value={draft?.observaciones || ""}
              onChange={(e) => setVal("observaciones", e.target.value)}
            />
          </Field>
        </AccordionItem>

        <div
          className={
            accordionError.parientes ? "border-2 border-red-500 rounded-2xl" : ""
          }
        >
          <AccordionItem
            title="Parientes"
            subtitle="Madre, padre, hermanos, etc."
            defaultOpen={false}
          >
            <table className="w-full text-sm mb-2 border border-white/10 rounded-lg">
              <thead className="bg-white/10">
                <tr>
                  <th className="p-2">Parentesco</th>
                  <th className="p-2">Nombre y Apellido</th>
                  <th className="p-2">Ocupación</th>
                  <th className="p-2">Teléfono</th>
                  <th className="p-2">Ciudad</th>
                  <th className="p-2">Vive con él</th>
                  <th className="p-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {(draft?.parientes || []).map((row, idx) => (
                  <tr key={idx} className="border-t border-white/10">
                    <td className="p-2">
                      <Input
                        value={row.parentesco || ""}
                        onChange={(e) =>
                          handleListChange(
                            "parientes",
                            idx,
                            "parentesco",
                            e.target.value
                          )
                        }
                        className={parientesError[idx]?.parentesco ? inputErrorCls : ""}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={row.nombre_apellido || ""}
                        onChange={(e) =>
                          handleListChange(
                            "parientes",
                            idx,
                            "nombre_apellido",
                            e.target.value
                          )
                        }
                        className={
                          parientesError[idx]?.nombre_apellido ? inputErrorCls : ""
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={row.ocupacion || ""}
                        onChange={(e) =>
                          handleListChange("parientes", idx, "ocupacion", e.target.value)
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={row.telefono || ""}
                        onChange={(e) =>
                          handleListChange("parientes", idx, "telefono", e.target.value)
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={row.ciudad || ""}
                        onChange={(e) =>
                          handleListChange("parientes", idx, "ciudad", e.target.value)
                        }
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className={`${inputCls} mt-1 w-36 min-w-[120px] px-3 py-2`}
                        value={row.vive_con_el ? "si" : "no"}
                        onChange={(e) =>
                          handleListChange(
                            "parientes",
                            idx,
                            "vive_con_el",
                            e.target.value === "si"
                          )
                        }
                      >
                        <option value="si">Sí</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <button
                        className="p-2 text-xs text-white flex items-center justify-center"
                        onClick={() => handleRemoveRow("parientes", idx)}
                        title="Eliminar"
                        style={{ background: "none", border: "none" }}
                      >
                        <span style={{ fontWeight: "bold", fontSize: "18px", color: "white" }}>
                          ×
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className={buttonCls}
              style={{ width: 120 }}
              onClick={() => handleAddRow("parientes", { ...emptyPariente })}
            >
              Agregar pariente
            </button>
          </AccordionItem>
        </div>

        <AccordionItem title="Hijos" subtitle="Datos de hijos" defaultOpen={false}>
          <table className="w-full text-sm mb-2 border border-white/10 rounded-lg">
            <thead className="bg-white/10">
              <tr>
                <th className="p-2">Nombre y Apellido</th>
                <th className="p-2">Ocupación</th>
                <th className="p-2">Vive con él</th>
                <th className="p-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {(draft?.hijos || []).map((row, idx) => (
                <tr
                  key={idx}
                  className={`border-t border-white/10 ${
                    hijosError[idx] ? "bg-red-200/30" : ""
                  }`}
                >
                  <td className="p-2">
                    <Input
                      value={row.nombre_apellido || ""}
                      onChange={(e) =>
                        handleListChange("hijos", idx, "nombre_apellido", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.ocupacion || ""}
                      onChange={(e) => handleListChange("hijos", idx, "ocupacion", e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className={`${inputCls} mt-1 w-36 min-w-[120px] px-3 py-2`}
                      value={row.vive_con_el ? "si" : "no"}
                      onChange={(e) =>
                        handleListChange("hijos", idx, "vive_con_el", e.target.value === "si")
                      }
                    >
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <button
                      className="p-2 text-xs text-white flex items-center justify-center"
                      onClick={() => handleRemoveRow("hijos", idx)}
                      title="Eliminar"
                      style={{ background: "none", border: "none" }}
                    >
                      <span style={{ fontWeight: "bold", fontSize: "18px", color: "white" }}>
                        ×
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className={buttonCls}
            style={{ width: 120 }}
            onClick={() => handleAddRow("hijos", { ...emptyHijo })}
          >
            Agregar hijo
          </button>
        </AccordionItem>

        <AccordionItem
          title="Convivientes"
          subtitle="Personas que conviven con el candidato"
          defaultOpen={false}
        >
          <table className="w-full text-sm mb-2 border border-white/10 rounded-lg">
            <thead className="bg-white/10">
              <tr>
                <th className="p-2">Parentesco</th>
                <th className="p-2">Nombre y Apellido</th>
                <th className="p-2">Ocupación</th>
                <th className="p-2">Teléfono</th>
                <th className="p-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {(draft?.convivientes || []).map((row, idx) => (
                <tr
                  key={idx}
                  className={`border-t border-white/10 ${
                    convivientesError[idx] ? "bg-red-200/30" : ""
                  }`}
                >
                  <td className="p-2">
                    <Input
                      value={row.parentesco || ""}
                      onChange={(e) =>
                        handleListChange("convivientes", idx, "parentesco", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.nombre_apellido || ""}
                      onChange={(e) =>
                        handleListChange("convivientes", idx, "nombre_apellido", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.ocupacion || ""}
                      onChange={(e) =>
                        handleListChange("convivientes", idx, "ocupacion", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={row.telefono || ""}
                      onChange={(e) =>
                        handleListChange("convivientes", idx, "telefono", e.target.value)
                      }
                    />
                  </td>
                  <td className="p-2">
                    <button
                      className="p-2 text-xs text-white flex items-center justify-center"
                      onClick={() => handleRemoveRow("convivientes", idx)}
                      title="Eliminar"
                      style={{ background: "none", border: "none" }}
                    >
                      <span style={{ fontWeight: "bold", fontSize: "18px", color: "white" }}>
                        ×
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className={buttonCls}
            style={{ width: 120 }}
            onClick={() => handleAddRow("convivientes", { ...emptyConviviente })}
          >
            Agregar conviviente
          </button>
        </AccordionItem>

        <button
          className={buttonCls}
          onClick={handleSave}
          disabled={saving}
          style={{ width: "100%", maxWidth: 200, margin: "0 auto" }}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        {msg && <div className="mt-2 text-sm text-blue-300 text-center">{msg}</div>}
      </div>
    </div>
  );
}
