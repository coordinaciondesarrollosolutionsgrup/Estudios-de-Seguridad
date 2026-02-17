import { useRef, useState } from "react";
import api from "../api/axios";

export default function CentralesUploader({ studyId, onUploaded }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState([]);

  const upload = async () => {
    const input = ref.current;
    if (!input || !input.files?.length) return;
    const fd = new FormData();
    for (const f of input.files) fd.append("files", f);
    setBusy(true);
    try {
      const { data } = await api.post(`/api/estudios/${studyId}/centrales_upload/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLast(data.archivos || []);
      onUploaded?.(data.archivos || []);
      input.value = "";
    } catch (e) {
      const msg = e.response?.data?.detail || "No se pudo subir.";
      alert(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
      <div className="text-sm text-slate-200 mb-2">Subir archivos de centrales (solo analista)</div>
      <div className="flex items-center gap-2">
        <input ref={ref} type="file" multiple className="text-xs text-slate-300"/>
        <button
          disabled={busy}
          onClick={upload}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? "Subiendo..." : "Subir"}
        </button>
      </div>

      {!!last.length && (
        <div className="mt-3 text-xs text-slate-300">
          <div className="mb-1">Últimos subidos:</div>
          <ul className="list-disc pl-5 space-y-1">
            {last.map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noreferrer" className="underline text-indigo-300">{f.nombre}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
