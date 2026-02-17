import { useMemo, useState } from "react";

export default function SectionCard({
  title,
  subtitle,
  rows = [],
  selectable = true,
  onValidateOne,        // (row, {puntaje, comentario})
  onObservacion,        // (row, comentario)
  onValidateSelected,   // (selectedRows) -> valida masivo
  extra,                // nodo extra (uploader de Centrales, etc)
}) {
  const [selected, setSelected] = useState(new Set());

  const allSelected = useMemo(
    () => rows.length > 0 && selected.size === rows.length,
    [rows.length, selected]
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };

  const toggleOne = (id) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-slate-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold">{title}</h4>
          {subtitle && <p className="text-xs text-slate-300">{subtitle}</p>}
        </div>
        {selectable && !!rows.length && onValidateSelected && (
          <button
            onClick={() => onValidateSelected(rows.filter(r => selected.has(r.id)))}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm hover:bg-emerald-500"
          >
            Validar seleccionados
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <div className="text-sm text-slate-300">Sin registros.</div>
        ) : (
          rows.map((r) => (
            <Row
              key={r.id}
              row={r}
              selectable={selectable}
              selected={selected.has(r.id)}
              onToggle={() => toggleOne(r.id)}
              onValidateOne={onValidateOne}
              onObservacion={onObservacion}
            />
          ))
        )}
      </div>

      {selectable && rows.length > 0 && (
        <div className="mt-3 text-xs text-slate-300">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-blue-600"/>
            Seleccionar todo
          </label>
          <span className="ml-2">({selected.size}/{rows.length})</span>
        </div>
      )}

      {extra && <div className="mt-4">{extra}</div>}
    </div>
  );
}

function Row({ row, selectable, selected, onToggle, onValidateOne, onObservacion }) {
  const [puntaje, setPuntaje] = useState(row.puntaje || 0);
  const [comentario, setComentario] = useState(row.comentario || "");

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {selectable && (
            <label className="mr-2 inline-flex items-center">
              <input type="checkbox" className="accent-blue-600" checked={selected} onChange={onToggle}/>
            </label>
          )}
          <div className="inline-block">
            <div className="font-medium">{row.title}</div>
            {row.meta && <div className="text-xs text-slate-300">{row.meta}</div>}
            {row.fileUrl && (
              <a href={row.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 underline">
                Ver archivo
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            value={puntaje}
            onChange={(e) => setPuntaje(e.target.value)}
            title="Puntaje"
            className="w-20 rounded-md bg-slate-800/80 px-2 py-1 text-sm outline-none border border-white/10"
          />
          <button
            onClick={() => onValidateOne?.(row, { puntaje: Number(puntaje), comentario })}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs hover:bg-emerald-500"
            title="Validar"
          >
            Validar
          </button>
          <button
            onClick={async () => {
              const txt = prompt("Observaciones / comentario:", comentario || "");
              if (txt == null) return;
              setComentario(txt);
              await onObservacion?.(row, txt);
            }}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs hover:bg-amber-500"
            title="Observaciones"
          >
            Observaciones
          </button>
        </div>
      </div>
    </div>
  );
}
