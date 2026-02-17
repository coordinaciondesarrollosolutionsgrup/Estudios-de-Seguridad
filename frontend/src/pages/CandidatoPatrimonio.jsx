import { useEffect, useState } from "react";
import useStudyId from "../hooks/useStudyId";
import { getPatrimonio, upsertPatrimonio } from "../api/studies";

/* ===== estilos / primitivas ===== */
const inputCls =
  "mt-1 w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";
const labelCls = "text-sm text-slate-200 font-medium";
const Field = ({ label, className = "", hint, children }) => (
  <label className={`block ${className}`}>
    {label && <div className={labelCls}>{label}</div>}
    {children}
    {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
  </label>
);
const TextArea = ({ rows = 3, ...rest }) => <textarea rows={rows} className={inputCls} {...rest} />;

/* ===== helpers UI ===== */
const RowYN = ({ label, value, onChange, name }) => (
  <tr className="border-t border-white/10">
    <td className="px-3 py-2 text-sm">{label}</td>
    <td className="px-3 py-2">
      <input type="radio" name={name} checked={value === true} onChange={() => onChange(true)} />
    </td>
    <td className="px-3 py-2">
      <input type="radio" name={name} checked={value === false} onChange={() => onChange(false)} />
    </td>
  </tr>
);

/* ===== catálogos ===== */
const INM_TIPOS = [
  ["tiene_casa", "Casa"],
  ["tiene_apartamento", "Apartamento"],
  ["tiene_finca", "Finca"],
  ["tiene_casa_lote", "Casa lote"],
  ["tiene_lote", "Lote"],
  ["tiene_edificio", "Edificio"],
  ["tiene_otro_consultorio", "Otro / Consultorio"],
];

const MUEBLES = [
  ["vehiculo", "Vehículo"],
  ["motocicleta", "Motocicleta"],
  ["bicicleta", "Bicicleta"],
  ["fideicomiso", "Fideicomiso inmobiliario"],
  ["joyas_arte", "Joyas / Arte"],
  ["portatil_pc", "Portátil / PC"],
  ["celular_tablet", "Celular / Tablet / iPad"],
];

/* Base con todas las claves esperadas */
const EMPTY_PATRIMONIO = (() => {
  const base = {
    inmuebles_propios: null,
    inmuebles_heredados: null,
    observacion_inmuebles: "",
    ...Object.fromEntries(INM_TIPOS.map(([k]) => [k, null])),
    ...Object.fromEntries(MUEBLES.map(([k]) => [k, null])),
    observacion_muebles: "",
  };
  return base;
})();

export default function CandidatoPatrimonio({ estudioId: _id }) {
  const studyId = useStudyId(_id);
  const [data, setData] = useState(EMPTY_PATRIMONIO);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const setF = (k, v) => setData((s) => ({ ...s, [k]: v }));

  const load = async () => {
    if (!studyId) return;
    setLoading(true);
    try {
      const { data: list } = await getPatrimonio(studyId);
      const p = (Array.isArray(list) ? list[0] : list) || {};
      setData((prev) => ({ ...EMPTY_PATRIMONIO, ...prev, ...p }));
    } catch {
      setMsg("No se pudo cargar patrimonio.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  const buildPayload = () => {
    const boolKeys = [
      "inmuebles_propios",
      "inmuebles_heredados",
      ...INM_TIPOS.map(([k]) => k),
      ...MUEBLES.map(([k]) => k),
    ];
    const out = {};
    for (const k of boolKeys) {
      out[k] = data[k] === true ? true : data[k] === false ? false : null;
    }
    out.observacion_inmuebles = data.observacion_inmuebles || "";
    out.observacion_muebles = data.observacion_muebles || "";
    return out;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!studyId) {
      setMsg("No se encontró el estudio. Vuelve desde el panel principal.");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const payload = buildPayload();
      const { data: saved } = await upsertPatrimonio(studyId, payload, data.id);
      setData((prev) => ({ ...prev, ...saved })); // merge para no perder selección
      setMsg("Guardado.");
    } catch {
      setMsg("No se pudo guardar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">🏠 Información de patrimonio</h2>
        <div className="invisible">
          <button className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200">—</button>
        </div>
      </div>

      {!studyId && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          No se encontró el estudio. Vuelve desde el panel principal para continuar.
        </div>
      )}
      {msg && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {msg}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl">
        {/* Inmuebles */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 font-semibold">Bienes inmuebles</div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white/80">
                  <th className="px-3 py-2">Concepto</th>
                  <th className="px-3 py-2">Sí</th>
                  <th className="px-3 py-2">No</th>
                </tr>
              </thead>
              <tbody>
                <RowYN
                  label="Cuenta con bienes inmuebles propios"
                  value={data.inmuebles_propios ?? null}
                  onChange={(v) => setF("inmuebles_propios", v)}
                  name="bipropios"
                />
                <RowYN
                  label="Cuenta con bienes inmuebles heredados"
                  value={data.inmuebles_heredados ?? null}
                  onChange={(v) => setF("inmuebles_heredados", v)}
                  name="biheredados"
                />
              </tbody>
            </table>
          </div>

          <Field className="mt-3" label="Observaciones de ubicación / dirección">
            <TextArea
              value={data.observacion_inmuebles || ""}
              onChange={(e) => setF("observacion_inmuebles", e.target.value)}
            />
          </Field>

          {/* Tipos */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-white/80 text-sm">Indique el tipo:</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-white/80">
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Sí</th>
                    <th className="px-3 py-2">No</th>
                  </tr>
                </thead>
                <tbody>
                  {INM_TIPOS.map(([k, label]) => (
                    <RowYN
                      key={k}
                      label={label}
                      value={data[k] ?? null}
                      onChange={(v) => setF(k, v)}
                      name={`tipo-${k}`}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Muebles */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 font-semibold">Bienes muebles</div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white/80">
                  <th className="px-3 py-2">Concepto</th>
                  <th className="px-3 py-2">Sí</th>
                  <th className="px-3 py-2">No</th>
                </tr>
              </thead>
              <tbody>
                {MUEBLES.map(([k, label]) => (
                  <RowYN
                    key={k}
                    label={label}
                    value={data[k] ?? null}
                    onChange={(v) => setF(k, v)}
                    name={`mueble-${k}`}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Field className="mt-3" label="Observaciones (marca, modelo, referencia…)">
            <TextArea
              value={data.observacion_muebles || ""}
              onChange={(e) => setF("observacion_muebles", e.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            disabled={loading || !studyId}
          >
            Guardar
          </button>
          {!!msg && <span className="text-slate-300">{msg}</span>}
        </div>
      </form>
    </div>
  );
}
