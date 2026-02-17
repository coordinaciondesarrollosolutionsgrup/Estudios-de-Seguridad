// src/pages/CandidatoEconomica.jsx
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../api/axios";

const money = (v) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(Number(v || 0));

/* ======= saneo / validaciones ======= */
const DIGITS_RX = /[^\d]/g;
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const sanitizeMonto = (raw, { max = 999999999 } = {}) => {
  const n = Number(String(raw || "").replace(DIGITS_RX, "")) || 0;
  return clamp(n, 0, max);
};
const sanitizeText = (s = "", max = 120) => String(s).replace(/\s+/g, " ").slice(0, max);

/* ======= Catálogos (actualizados) ======= */
const INGRESOS_DEF = [
  { id: "salario_aspirante", label: "Salario aspirante" },
  { id: "salario_pareja", label: "Salario pareja" },
  { id: "auxilio_internet", label: "Auxilio internet" },
  { id: "ayuda_padres", label: "Ayuda padres" },
  { id: "subsidio_gobierno", label: "Subsidio del gobierno (IMG)" },
  { id: "apoyo_hijx", label: "Apoyo hijo(a)" },
  { id: "inversiones", label: "Inversiones" },
  { id: "comisiones", label: "Comisiones / bonificaciones" },
  { id: "cuota_mensual_hijo", label: "Cuota mensual hijo" },
  { id: "inversiones_cdts", label: "Inversiones - CDTs" },
  { id: "asesorias", label: "Asesorías" },
  { id: "consultorias", label: "Consultorías" },
  { id: "emprendimientos", label: "Emprendimientos" },
  { id: "arriendos", label: "Ingresos por arriendos" },
  { id: "otros_ingresos", label: "Otros ingresos" },
  { id: "otros_ingresos_2", label: "Otros ingresos 2" }, // opcional
];

const EGRESOS_DEF = [
  { id: "arriendo", label: "Arriendo" },
  { id: "servicios", label: "Servicios" },
  { id: "alimentacion", label: "Alimentación" },
  { id: "recreacion", label: "Recreación / ocio" },
  { id: "transporte", label: "Transportes" },
  { id: "gasolina", label: "Gasolina" },
  { id: "gastos_mascotas", label: "Gastos de mascotas" },
  { id: "credito_1", label: "Crédito 1" },
  { id: "credito_2", label: "Crédito 2" },
  { id: "colegio/Universidad", label: "Colegio/Universidad" },
  { id: "plan_hijos", label: "Plan complementario hijos" },
  { id: "gimnasio", label: "Gimnasio" },
  { id: "otros", label: "Otros gastos" },
  { id: "otros_2", label: "Otros gastos 2" }, // opcional
  { id: "internet", label: "Internet" },
  { id: "celular", label: "Celular" },
];

/* === Sector financiero / sector real === */
const PRODUCTOS_DEF = [
  { id: "cuenta_ahorros", label: "Cuenta de ahorros" },
  { id: "cuenta_corriente", label: "Cuenta corriente" },
  { id: "tarjeta_credito", label: "Tarjetas de crédito", multi: true },
  { id: "cdts", label: "CDTs", multi: true },
  { id: "credito_libre", label: "Crédito libre inversión" },
  { id: "credito_vehiculo", label: "Crédito de vehículo" },
  { id: "credito_hipotecario", label: "Crédito (vivienda) hipotecario" },
  { id: "credito_estudio", label: "Crédito de estudio" },
  // usamos `persona` como “saldo de crédito” por compatibilidad con el back
  { id: "otros_prestamos_pn", label: "Otros préstamos personas naturales" },
  { id: "otros_creditos_sr", label: "Otros créditos (sector real)", multi: true },
];

const MULTI_IDS = new Set(PRODUCTOS_DEF.filter((p) => p.multi).map((p) => p.id));

const emptyDetalle = () => ({ banco: "", saldo_cupo: 0, valor_cuota: 0 });
const emptyProducto = () => ({
  tiene: null,
  banco: "",
  saldo_cupo: 0,
  valor_cuota: 0,
  persona: "", // aquí guardamos “saldo de crédito” para TODOS
  detalles: [], // para tarjetas, cdts, sector real
});

/* ======= estilos ======= */
const inputCls =
  "mt-1 w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";

const API_BASE = "/api/economicas/"; // plural

export default function CandidatoEconomica() {
  const outlet = useOutletContext() || {};
  const studyId = outlet?.studyId ?? null;

  const emptyForm = {
    registra_negativos: null,
    central: "",
    deuda_actual: "",
    acuerdo_pago: null,
    fecha_acuerdo: "",
    valor_mensual: "",
    es_codeudor: null,

    ingresos: Object.fromEntries(INGRESOS_DEF.map((i) => [i.id, 0])),
    egresos: Object.fromEntries(EGRESOS_DEF.map((i) => [i.id, 0])),
    ingresos_activos: [],
    egresos_activos: [],

    productos: Object.fromEntries(PRODUCTOS_DEF.map((p) => [p.id, emptyProducto()])),
  };

  const [row, setRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [snapshot, setSnapshot] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // ---- helpers de dirty/clone ----
  const sanitizeState = (f) => {
    const normNums = (obj) =>
      Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, Number(v || 0)]));
    const sortArr = (arr) => [...(arr || [])].sort();
    const normProductos = (obj) =>
      Object.fromEntries(
        PRODUCTOS_DEF.map(({ id }) => {
          const r = obj?.[id] || {};
          const detalles = Array.isArray(r.detalles) ? r.detalles : [];
          const normDetalles = detalles
            .map((d) => ({
              banco: sanitizeText(d.banco || "", 120),
              saldo_cupo: Number(d.saldo_cupo || 0),
              valor_cuota: Number(d.valor_cuota || 0),
            }))
            .filter((d) => d.banco || d.saldo_cupo || d.valor_cuota);
          return [
            id,
            {
              tiene: r.tiene === true ? true : r.tiene === false ? false : null,
              banco: sanitizeText(r.banco || "", 120),
              saldo_cupo: Number(r.saldo_cupo || 0),
              valor_cuota: Number(r.valor_cuota || 0),
              // persona = “saldo de crédito”, conservamos compatibilidad de tipo (string)
              persona: sanitizeText(String(r.persona ?? ""), 120),
              detalles: normDetalles,
            },
          ];
        })
      );

    return {
      registra_negativos: f.registra_negativos ?? null,
      central: f.central || "",
      deuda_actual: Number(f.deuda_actual || 0),
      acuerdo_pago: f.acuerdo_pago ?? null,
      fecha_acuerdo: f.fecha_acuerdo || "",
      valor_mensual: Number(f.valor_mensual || 0),
      es_codeudor: f.es_codeudor ?? null,
      ingresos: normNums(f.ingresos || {}),
      egresos: normNums(f.egresos || {}),
      ingresos_activos: sortArr(f.ingresos_activos),
      egresos_activos: sortArr(f.egresos_activos),
      productos: normProductos(f.productos),
    };
  };
  const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isDirty = useMemo(() => !deepEqual(sanitizeState(form), sanitizeState(snapshot)), [form, snapshot]);

  // ---- selección de conceptos ----
  const toggleConcept = (group, id, checked) => {
    setForm((f) => {
      const key = group + "_activos";
      const set = new Set(f[key] || []);
      if (checked) set.add(id);
      else set.delete(id);
      const moneyGroup = { ...f[group], [id]: checked ? Number(f[group][id] || 0) : 0 };
      return { ...f, [key]: [...set], [group]: moneyGroup };
    });
  };

  // atajo para “otros ingresos 2” / “otros gastos 2”
  const ensureSecondField = (group) => {
    const main = group === "ingresos" ? "otros_ingresos" : "otros";
    const aux = group === "ingresos" ? "otros_ingresos_2" : "otros_2";
    setForm((f) => {
      if (!f[`${group}_activos`].includes(main)) return f;
      if (f[`${group}_activos`].includes(aux)) return f;
      return { ...f, [`${group}_activos`]: [...f[`${group}_activos`], aux] };
    });
  };

  const setMoney = (group, id, raw) => {
    const n = sanitizeMonto(raw);
    setForm((f) => ({ ...f, [group]: { ...f[group], [id]: n } }));
  };

  const pickActiveMoney = (group, activos) => {
    const src = form[group] || {};
    const out = {};
    (activos || []).forEach((id) => (out[id] = Number(src[id] || 0)));
    return out;
  };

  /* === Productos === */
  const setProd = (id, patch) =>
    setForm((f) => ({
      ...f,
      productos: { ...f.productos, [id]: { ...(f.productos?.[id] || emptyProducto()), ...patch } },
    }));

  const addDetalle = (pid) => {
    setForm((f) => {
      const cur = f.productos?.[pid] || emptyProducto();
      const det = Array.isArray(cur.detalles) ? cur.detalles.slice() : [];
      det.push(emptyDetalle());
      return { ...f, productos: { ...f.productos, [pid]: { ...cur, detalles: det } } };
    });
  };

  const setDetalle = (pid, idx, patch) => {
    setForm((f) => {
      const cur = f.productos?.[pid] || emptyProducto();
      const det = Array.isArray(cur.detalles) ? cur.detalles.slice() : [];
      det[idx] = { ...(det[idx] || emptyDetalle()), ...patch };
      return { ...f, productos: { ...f.productos, [pid]: { ...cur, detalles: det } } };
    });
  };

  const removeDetalle = (pid, idx) => {
    setForm((f) => {
      const cur = f.productos?.[pid] || emptyProducto();
      const det = (cur.detalles || []).filter((_, i) => i !== idx);
      return { ...f, productos: { ...f.productos, [pid]: { ...cur, detalles: det } } };
    });
  };

  const compactProductos = (productos) => {
    const out = {};
    for (const { id } of PRODUCTOS_DEF) {
      const r = productos?.[id] || {};
      const usefulTop =
        r.tiene === true ||
        Number(r.saldo_cupo || 0) > 0 ||
        Number(r.valor_cuota || 0) > 0 ||
        (r.banco || "").trim() ||
        (r.persona || "").trim();

      const det = Array.isArray(r.detalles)
        ? r.detalles.filter((d) => d.banco || d.saldo_cupo || d.valor_cuota)
        : [];
      if (usefulTop || det.length) {
        out[id] = {
          tiene: r.tiene === true ? true : r.tiene === false ? false : null,
          banco: r.banco || "",
          saldo_cupo: Number(r.saldo_cupo || 0),
          valor_cuota: Number(r.valor_cuota || 0),
          // persona = “saldo de crédito”
          persona: String(r.persona ?? ""),
          ...(det.length
            ? {
                detalles: det.map((d) => ({
                  banco: d.banco || "",
                  saldo_cupo: Number(d.saldo_cupo || 0),
                  valor_cuota: Number(d.valor_cuota || 0),
                })),
              }
            : {}),
        };
      }
    }
    return out;
  };

  /* === Migraciones suaves === */
  const migrateIngresos = (ing = {}) => {
    const out = { ...ing };
    if (out.emprendimiento_mascotas && !out.emprendimientos) {
      out.emprendimientos = out.emprendimiento_mascotas;
      delete out.emprendimiento_mascotas;
    }
    if (out.arriendos_otros && !out.arriendos) {
      out.arriendos = out.arriendos_otros;
      delete out.arriendos_otros;
    }
    return out;
  };

  const migrateEgresos = (egr = {}) => {
    const out = { ...egr };
    if (egr.transporte_gasolina && !out.transporte && !out.gasolina) {
      out.transporte = egr.transporte_gasolina;
      delete out.transporte_gasolina;
    }
    if (egr.creditos && !out.credito_1 && !out.credito_2) {
      out.credito_1 = egr.creditos;
      delete out.creditos;
    }
    return out;
  };

  // ---- load from API ----
  useEffect(() => {
    (async () => {
      if (!studyId) return;
      setMsg("");
      try {
        const { data } = await api.get(`${API_BASE}?estudio=${studyId}`);
        const list = Array.isArray(data) ? data : data ? [data] : [];
        const found = list[0] || null;

        if (found) {
          const productosServidor =
            found.productos_financieros || found.productos || found.financieros || {};

          const mergedProductos = { ...emptyForm.productos };
          for (const { id } of PRODUCTOS_DEF) {
            mergedProductos[id] = { ...emptyProducto(), ...(productosServidor[id] || {}) };
            if (!Array.isArray(mergedProductos[id].detalles)) mergedProductos[id].detalles = [];
          }

          const ingresosSrv = migrateIngresos(found.ingresos || {});
          const egresosSrv = migrateEgresos(found.egresos || {});
          const actIng = Object.keys(ingresosSrv || {});
          const actEgr = Object.keys(egresosSrv || {});

          const next = {
            ...emptyForm,
            ...found,
            ingresos: { ...emptyForm.ingresos, ...ingresosSrv },
            egresos: { ...emptyForm.egresos, ...egresosSrv },
            ingresos_activos: actIng,
            egresos_activos: actEgr,
            productos: mergedProductos,
          };
          setRow(found);
          setForm(next);
          setSnapshot(next);
        } else {
          setRow(null);
          setForm(emptyForm);
          setSnapshot(emptyForm);
        }
      } catch {
        setMsg("No se pudo cargar información económica.");
        setRow(null);
        setForm(emptyForm);
        setSnapshot(emptyForm);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  // ---- totales (solo activos) ----
  const totalIngresos = useMemo(() => {
    const src = form.ingresos || {};
    return (form.ingresos_activos || []).reduce((acc, id) => acc + (parseFloat(src[id]) || 0), 0);
  }, [form.ingresos, form.ingresos_activos]);

  const totalEgresos = useMemo(() => {
    const src = form.egresos || {};
    return (form.egresos_activos || []).reduce((acc, id) => acc + (parseFloat(src[id]) || 0), 0);
  }, [form.egresos, form.egresos_activos]);

  const cruce = useMemo(() => totalIngresos - totalEgresos, [totalIngresos, totalEgresos]);

  const cruceBox =
    cruce < 0
      ? "text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2"
      : "text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2";

  // ---- acciones header ----
  const descartarCambios = () => {
    setForm(snapshot);
    setMsg("");
  };

  const save = async () => {
    if (!studyId) {
      alert("Falta el identificador del estudio.");
      return;
    }
    if (form.acuerdo_pago === true) {
      const faltaFecha = !form.fecha_acuerdo;
      const valor = sanitizeMonto(form.valor_mensual);
      if (faltaFecha || valor <= 0) {
        setMsg("Completa la fecha del acuerdo y un valor mensual mayor a 0.");
        return;
      }
    }

    setBusy(true);
    try {
      setMsg("");

      const payload = {
        registra_negativos:
          form.registra_negativos === true ? true : form.registra_negativos === false ? false : null,
        central: form.central || "",
        deuda_actual: sanitizeMonto(form.deuda_actual),
        acuerdo_pago: form.acuerdo_pago === true ? true : form.acuerdo_pago === false ? false : null,
        fecha_acuerdo: form.fecha_acuerdo || null,
        valor_mensual: sanitizeMonto(form.valor_mensual),
        es_codeudor: form.es_codeudor === true ? true : form.es_codeudor === false ? false : null,

        ingresos: pickActiveMoney("ingresos", form.ingresos_activos),
        egresos: pickActiveMoney("egresos", form.egresos_activos),
        total_ingresos: totalIngresos,
        total_egresos: totalEgresos,
        cruce,

        productos_financieros: compactProductos(form.productos),
      };

      let saved;
      if (row?.id) {
        const { data } = await api.patch(`${API_BASE}${row.id}/`, payload);
        saved = data;
      } else {
        const { data } = await api.post(API_BASE, { ...payload, estudio: studyId });
        saved = data;
      }
      setRow(saved || null);

      const actIng = Object.keys(saved?.ingresos || payload.ingresos || {});
      const actEgr = Object.keys(saved?.egresos || payload.egresos || {});
      const nextForm = {
        ...form,
        ingresos_activos: actIng,
        egresos_activos: actEgr,
        productos: (() => {
          const merged = { ...emptyForm.productos };
          const srv = saved?.productos_financieros || payload.productos_financieros || {};
          for (const { id } of PRODUCTOS_DEF) {
            merged[id] = { ...emptyProducto(), ...(srv[id] || form.productos[id] || {}) };
            if (!Array.isArray(merged[id].detalles)) merged[id].detalles = [];
          }
          return merged;
        })(),
      };
      setSnapshot(nextForm);
      setForm(nextForm);

      setMsg("Información guardada.");
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.non_field_errors?.[0] ||
        e?.response?.statusText ||
        "No se pudo guardar.";
      setMsg(detail);
      alert(detail);
    } finally {
      setBusy(false);
    }
  };

  // ---- UI ----
  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">📊 Información económica</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={descartarCambios}
            disabled={!isDirty || busy}
            className={`rounded-xl border px-4 py-2 text-sm ${
              !isDirty || busy
                ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
                : "border-white/10 bg-white/10 text-slate-200 hover:bg-white/20"
            }`}
          >
            Descartar cambios
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!isDirty || busy}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition ${
              !isDirty || busy ? "cursor-not-allowed bg-slate-600" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {msg}
        </div>
      )}

      {/* ====== Centrales / Estado ====== */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm">¿Registra reportes negativos en centrales?</label>
          <div className="mt-1 flex gap-4 text-sm">
            <label>
              <input
                type="radio"
                name="neg"
                checked={form.registra_negativos === true}
                onChange={() => setForm((f) => ({ ...f, registra_negativos: true }))}
              />{" "}
              Sí
            </label>
            <label>
              <input
                type="radio"
                name="neg"
                checked={form.registra_negativos === false}
                onChange={() => setForm((f) => ({ ...f, registra_negativos: false }))}
              />{" "}
              No
            </label>
          </div>
        </div>

        <div>
          <label className="text-sm">¿En cuál central?</label>
          <select
            className={inputCls}
            value={form.central}
            onChange={(e) => setForm((f) => ({ ...f, central: e.target.value }))}
          >
            <option value="">Seleccione…</option>
            <option value="DATACREDITO">Datacrédito (Experian)</option>
            <option value="CIFIN">CIFIN (TransUnion)</option>
            <option value="OTRA">Otra entidad</option>
          </select>
        </div>

        <div>
          <label className="text-sm">Deuda actual</label>
          <input
            className={inputCls}
            type="text"
            inputMode="numeric"
            pattern="^\\d+$"
            min={0}
            value={form.deuda_actual}
            onChange={(e) => setForm((f) => ({ ...f, deuda_actual: sanitizeMonto(e.target.value) }))}
          />
        </div>

        <div>
          <label className="text-sm">¿Tiene acuerdo de pago?</label>
          <div className="mt-1 flex gap-4 text-sm">
            <label>
              <input
                type="radio"
                name="ac"
                checked={form.acuerdo_pago === true}
                onChange={() => setForm((f) => ({ ...f, acuerdo_pago: true }))}
              />{" "}
              Sí
            </label>
            <label>
              <input
                type="radio"
                name="ac"
                checked={form.acuerdo_pago === false}
                onChange={() => setForm((f) => ({ ...f, acuerdo_pago: false }))}
              />{" "}
              No
            </label>
          </div>
        </div>

        <div>
          <label className="text-sm">Fecha acuerdo</label>
          <input
            className={inputCls}
            type="date"
            value={form.fecha_acuerdo || ""}
            onChange={(e) => setForm((f) => ({ ...f, fecha_acuerdo: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm">Valor mensual de acuerdo</label>
          <input
            className={inputCls}
            type="text"
            inputMode="numeric"
            pattern="^\\d+$"
            min={0}
            value={form.valor_mensual}
            onChange={(e) => setForm((f) => ({ ...f, valor_mensual: sanitizeMonto(e.target.value) }))}
          />
        </div>

        <div>
          <label className="text-sm">¿Es codeudor?</label>
          <div className="mt-1 flex gap-4 text-sm">
            <label>
              <input
                type="radio"
                name="co"
                checked={form.es_codeudor === true}
                onChange={() => setForm((f) => ({ ...f, es_codeudor: true }))}
              />{" "}
              Sí
            </label>
            <label>
              <input
                type="radio"
                name="co"
                checked={form.es_codeudor === false}
                onChange={() => setForm((f) => ({ ...f, es_codeudor: false }))}
              />{" "}
              No
            </label>
          </div>
        </div>
      </div>

      {/* ====== Sector financiero / sector real ====== */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="mb-2 font-semibold">Sector financiero / sector real</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-white/80">
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2">¿Tiene?</th>
                <th className="px-2 py-2">Banco / Entidad</th>
                <th className="px-2 py-2">Saldo / cupo o desembolso</th>
                <th className="px-2 py-2">Valor cuota</th>
                <th className="px-2 py-2">Saldo de crédito</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTOS_DEF.map((p) => {
                const r = form.productos[p.id] || emptyProducto();
                const isMulti = MULTI_IDS.has(p.id);
                return (
                  <>
                    <tr key={p.id} className="border-t border-white/10 align-top">
                      <td className="px-2 py-2">{p.label}</td>

                      <td className="px-2 py-2">
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1">
                            <input
                              type="radio"
                              name={`tiene-${p.id}`}
                              checked={r.tiene === true}
                              onChange={() => {
                                if (isMulti && (!r.detalles || r.detalles.length === 0)) {
                                  setProd(p.id, { tiene: true, detalles: [emptyDetalle()] });
                                } else {
                                  setProd(p.id, { tiene: true });
                                }
                              }}
                            />
                            <span>Sí</span>
                          </label>
                          <label className="inline-flex items-center gap-1">
                            <input
                              type="radio"
                              name={`tiene-${p.id}`}
                              checked={r.tiene === false}
                              onChange={() =>
                                setProd(p.id, {
                                  tiene: false,
                                  banco: "",
                                  saldo_cupo: 0,
                                  valor_cuota: 0,
                                  persona: "", // limpiar saldo crédito
                                  detalles: [],
                                })
                              }
                            />
                            <span>No</span>
                          </label>
                        </div>
                      </td>

                      <td className="px-2 py-2 max-w-[220px]">
                        <input
                          className={inputCls}
                          placeholder="Entidad financiera"
                          value={r.banco}
                          onChange={(e) => setProd(p.id, { banco: sanitizeText(e.target.value) })}
                        />
                      </td>

                      <td className="px-2 py-2 w-[160px]">
                        <input
                          className={inputCls}
                          type="text"
                          inputMode="numeric"
                          pattern="^\\d+$"
                          value={r.saldo_cupo}
                          onChange={(e) => setProd(p.id, { saldo_cupo: sanitizeMonto(e.target.value) })}
                        />
                      </td>

                      <td className="px-2 py-2 w-[160px]">
                        <input
                          className={inputCls}
                          type="text"
                          inputMode="numeric"
                          pattern="^\\d+$"
                          value={r.valor_cuota}
                          onChange={(e) => setProd(p.id, { valor_cuota: sanitizeMonto(e.target.value) })}
                        />
                      </td>

                      {/* Saldo de crédito para TODOS */}
                      <td className="px-2 py-2 w-[160px]">
                        <input
                          className={inputCls}
                          type="text"
                          inputMode="numeric"
                          pattern="^\\d+$"
                          placeholder="Saldo de crédito"
                          value={r.persona}
                          onChange={(e) => setProd(p.id, { persona: String(sanitizeMonto(e.target.value)) })}
                        />
                      </td>
                    </tr>

                    {/* subfilas para multi-detalle */}
                    {isMulti && r.tiene === true && (
                      <tr className="border-t border-white/10">
                        <td colSpan={6} className="px-2 py-2">
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="text-white/80 text-sm">Detalles (puedes agregar varios)</div>
                              <button
                                type="button"
                                onClick={() => addDetalle(p.id)}
                                className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                              >
                                Agregar otro
                              </button>
                            </div>

                            {(r.detalles || []).length === 0 ? (
                              <div className="text-sm text-white/60">Sin detalles aún.</div>
                            ) : (
                              <div className="space-y-2">
                                {r.detalles.map((d, idx) => (
                                  <div key={idx} className="grid gap-2 md:grid-cols-12 items-end">
                                    <div className="md:col-span-5">
                                      <div className="text-xs text-white/70">Entidad</div>
                                      <input
                                        className={inputCls}
                                        value={d.banco}
                                        onChange={(e) =>
                                          setDetalle(p.id, idx, { banco: sanitizeText(e.target.value) })
                                        }
                                      />
                                    </div>
                                    <div className="md:col-span-3">
                                      <div className="text-xs text-white/70">Saldo de crédito</div>
                                      <input
                                        className={inputCls}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="^\\d+$"
                                        value={d.saldo_cupo}
                                        onChange={(e) =>
                                          setDetalle(p.id, idx, { saldo_cupo: sanitizeMonto(e.target.value) })
                                        }
                                      />
                                    </div>
                                    <div className="md:col-span-3">
                                      <div className="text-xs text-white/70">Valor cuota</div>
                                      <input
                                        className={inputCls}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="^\\d+$"
                                        value={d.valor_cuota}
                                        onChange={(e) =>
                                          setDetalle(p.id, idx, { valor_cuota: sanitizeMonto(e.target.value) })
                                        }
                                      />
                                    </div>
                                    <div className="md:col-span-1 text-right">
                                      <button
                                        type="button"
                                        title="Eliminar"
                                        onClick={() => removeDetalle(p.id, idx)}
                                        className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs text-white/60">
          * Diligencia montos sólo si aplica. Los valores se guardan en COP.
        </div>
      </div>

      {/* ====== Ingresos / Egresos ====== */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Ingresos */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 font-semibold">Ingresos</div>

          <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="mb-1 text-xs text-white/70">Selecciona los conceptos que aplican:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {INGRESOS_DEF.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm text-white/90">
                  <input
                    type="checkbox"
                    checked={form.ingresos_activos.includes(opt.id)}
                    onChange={(e) => {
                      toggleConcept("ingresos", opt.id, e.target.checked);
                      if (e.target.checked && opt.id === "otros_ingresos") {
                        ensureSecondField("ingresos");
                      }
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {form.ingresos_activos.length === 0 ? (
            <div className="text-sm text-white/60">No hay conceptos seleccionados.</div>
          ) : (
            <div className="space-y-2">
              {form.ingresos_activos.map((id) => {
                const meta = INGRESOS_DEF.find((x) => x.id === id);
                return (
                  <div key={id} className="grid grid-cols-12 items-center gap-3">
                    <div className="col-span-7 text-sm text-white/90">{meta?.label || id}</div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="^\\d+$"
                        min={0}
                        className={inputCls}
                        value={form.ingresos[id] ?? 0}
                        onChange={(e) => setMoney("ingresos", id, e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        title="Quitar"
                        onClick={() => toggleConcept("ingresos", id, false)}
                        className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 text-right text-sm">
            <b>Subtotal ingresos:</b> {money(totalIngresos)}
          </div>
        </div>

        {/* Egresos */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 font-semibold">Egresos</div>

          <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="mb-1 text-xs text-white/70">Selecciona los conceptos que aplican:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EGRESOS_DEF.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm text-white/90">
                  <input
                    type="checkbox"
                    checked={form.egresos_activos.includes(opt.id)}
                    onChange={(e) => {
                      toggleConcept("egresos", opt.id, e.target.checked);
                      if (e.target.checked && opt.id === "otros") {
                        ensureSecondField("egresos");
                      }
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {form.egresos_activos.length === 0 ? (
            <div className="text-sm text-white/60">No hay conceptos seleccionados.</div>
          ) : (
            <div className="space-y-2">
              {form.egresos_activos.map((id) => {
                const meta = EGRESOS_DEF.find((x) => x.id === id);
                return (
                  <div key={id} className="grid grid-cols-12 items-center gap-3">
                    <div className="col-span-7 text-sm text-white/90">{meta?.label || id}</div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="^\\d+$"
                        min={0}
                        className={inputCls}
                        value={form.egresos[id] ?? 0}
                        onChange={(e) => setMoney("egresos", id, e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        title="Quitar"
                        onClick={() => toggleConcept("egresos", id, false)}
                        className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 text-right text-sm">
            <b>Subtotal egresos:</b> {money(totalEgresos)}
          </div>
        </div>
      </div>

      {/* Cruce */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/70">Cruce de ingresos y egresos</div>
        <div className={cruceBox}>
          <b>{money(cruce)}</b>
        </div>
      </div>
    </div>
  );
}
