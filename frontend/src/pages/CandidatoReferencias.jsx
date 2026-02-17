import { useEffect, useState } from "react";
import useStudyId from "../hooks/useStudyId";
import {
  getReferencias,
  createReferencia,
  updateReferencia,
  deleteReferencia,
} from "../api/studies";

/* ===== estilos/primitivas ===== */
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
const Input = (props) => <input className={inputCls} {...props} />;
const TextArea = ({ rows = 4, ...rest }) => <textarea rows={rows} className={inputCls} {...rest} />;

const empty = {
  nombre: "",
  telefono: "",
  ocupacion: "",
  empresa: "",
  tiempo_conocerse: "",
  concepto_sobre_referenciado: "",
};

export default function CandidatoReferencias({ estudioId: _id }) {
  const studyId = useStudyId(_id);
  const [list, setList] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    if (!studyId) return;
    setLoading(true);
    try {
      const { data } = await getReferencias(studyId);
      setList(Array.isArray(data) ? data : []);
    } catch {
      setMsg("No se pudo cargar referencias.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!studyId) {
      setMsg("No se encontró el estudio. Vuelve desde el panel principal.");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      if (editId) await updateReferencia(editId, form);
      else await createReferencia(studyId, form);
      setForm(empty);
      setEditId(null);
      await load();
      setMsg("Guardado.");
    } catch {
      setMsg("No se pudo guardar.");
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (row) => {
    setEditId(row.id);
    setForm({
      nombre: row.nombre || "",
      telefono: row.telefono || "",
      ocupacion: row.ocupacion || "",
      empresa: row.empresa || "",
      tiempo_conocerse: row.tiempo_conocerse || "",
      concepto_sobre_referenciado: row.concepto_sobre_referenciado || "",
    });
  };

  const onDelete = async (id) => {
    if (!confirm("¿Eliminar referencia?")) return;
    setLoading(true);
    try {
      await deleteReferencia(id);
      await load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">👥 Referencias personales</h2>
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

      {/* Formulario */}
      <form onSubmit={onSubmit} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre completo*">
            <Input name="nombre" value={form.nombre} onChange={onChange} />
          </Field>
          <Field label="Teléfono*">
            <Input name="telefono" value={form.telefono} onChange={onChange} inputMode="tel" />
          </Field>
          <Field label="Ocupación">
            <Input name="ocupacion" value={form.ocupacion} onChange={onChange} />
          </Field>
          <Field label="Empresa">
            <Input name="empresa" value={form.empresa} onChange={onChange} />
          </Field>
          <Field className="md:col-span-2" label="Tiempo de conocerse (p. ej. 12 años)">
            <Input name="tiempo_conocerse" value={form.tiempo_conocerse} onChange={onChange} />
          </Field>
          <Field className="md:col-span-2" label="Concepto sobre el referenciado">
            <TextArea name="concepto_sobre_referenciado" value={form.concepto_sobre_referenciado} onChange={onChange} />
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={loading || !studyId}
          >
            {editId ? "Actualizar" : "Agregar"}
          </button>
          {editId && (
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/20"
              onClick={() => {
                setEditId(null);
                setForm(empty);
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* Listado */}
      <div className="rounded-2xl border border-white/10 bg-white/5 shadow-xl divide-y divide-white/10">
        {list.length === 0 ? (
          <div className="p-4 text-slate-300">Aún no registras referencias.</div>
        ) : (
          list.map((r) => (
            <div key={r.id} className="p-4 flex items-start gap-3">
              <div className="flex-1">
                <div className="font-semibold">{r.nombre}</div>
                <div className="text-sm text-slate-300">
                  Tel: {r.telefono} · {r.ocupacion || "—"} · {r.empresa || "—"}
                </div>
                {r.tiempo_conocerse && <div className="text-sm text-slate-300">Tiempo: {r.tiempo_conocerse}</div>}
                {r.concepto_sobre_referenciado && <div className="mt-1 text-sm">{r.concepto_sobre_referenciado}</div>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/20"
                  onClick={() => onEdit(r)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-500"
                  onClick={() => onDelete(r.id)}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
