import { useMemo, useState } from "react";
import Modal from "./Modal";

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
  const [showObs, setShowObs] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [savingObs, setSavingObs] = useState(false);

  const estadoLabel = (row.estado || "").toUpperCase();
  const isValidado = estadoLabel === "VALIDADO" || (row.puntaje > 0 && !estadoLabel);

  const handleSaveObs = async () => {
    setSavingObs(true);
    try {
      setComentario(comentario);
      await onObservacion?.(row, comentario);
      setShowObs(false);
    } finally {
      setSavingObs(false);
    }
  };

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

        <div className="flex flex-col items-end gap-2 min-w-[120px]">
          <div className="flex gap-2">
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
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setShowObs((v) => !v)}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs hover:bg-amber-500"
              title="Observaciones"
            >
              Observaciones
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-xs hover:bg-blue-600"
              title="Ver detalle"
            >
              Ver detalle
            </button>
          </div>
        </div>
      </div>

      {/* Panel inline de observaciones */}
      {showObs && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <textarea
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30 resize-none"
            placeholder="Escribe la observación sobre este ítem…"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setShowObs(false)}
              className="px-3 py-1 rounded-lg border border-white/10 text-xs hover:bg-white/10 text-white/70"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveObs}
              disabled={savingObs}
              className="px-3 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs disabled:opacity-60"
            >
              {savingObs ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Modal de detalle del ítem */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-lg font-bold mb-3">Detalle del ítem</h3>
        <div className="space-y-2 text-sm">
          <div><span className="font-semibold text-slate-600">Nombre:</span> <span>{row.title}</span></div>
          {row.meta && <div><span className="font-semibold text-slate-600">Info:</span> <span className="text-slate-700">{row.meta}</span></div>}
          <div>
            <span className="font-semibold text-slate-600">Estado:</span>{" "}
            {isValidado ? (
              <span className="text-emerald-600 font-semibold">Validado ✓</span>
            ) : (
              <span className="text-amber-600 font-semibold">{estadoLabel || "Pendiente"}</span>
            )}
          </div>
          <div><span className="font-semibold text-slate-600">Puntaje:</span> <span>{row.puntaje ?? "—"}</span></div>
          <div>
            <span className="font-semibold text-slate-600">Comentario:</span>{" "}
            <span className="text-slate-700">{row.comentario || <em className="text-slate-400">Sin comentarios</em>}</span>
          </div>
          {row.fileUrl && (
            <div>
              <a href={row.fileUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline text-xs">
                Ver archivo adjunto
              </a>
            </div>
          )}
        </div>
        <div className="mt-4 text-right">
          <button
            onClick={() => setShowModal(false)}
            className="px-4 py-1.5 rounded-md bg-slate-700 text-white hover:bg-slate-600 text-sm"
          >
            Cerrar
          </button>
        </div>
      </Modal>
    </div>
  );
}
