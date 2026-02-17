import { useState } from "react";
import api from "../api/axios";

export default function DevolverModal({ studyId, open, onClose, onDone }) {
  const [msg, setMsg] = useState("");
  if (!open) return null;

  const send = async () => {
    if (!msg.trim()) return alert("Escribe un mensaje para el candidato.");
    try {
      await api.post(`/api/estudios/${studyId}/devolver/`, { observacion: msg.trim() });
      onDone?.();
    } catch (e) {
      alert(e.response?.data?.observacion?.[0] || "No se pudo devolver.");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute left-1/2 top-[12vh] -translate-x-1/2 w-[min(92vw,700px)]">
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-100 shadow-2xl">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/20 text-rose-300">↩</span>
            <h3 className="text-lg font-semibold">Devolver a candidato</h3>
          </div>
          <textarea
            rows={6}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Explica qué debe corregir el candidato…"
            className="w-full rounded-lg bg-slate-800/80 p-3 outline-none border border-white/10"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-white/10 bg-slate-800/70 px-4 py-2 text-sm">
              Cancelar
            </button>
            <button onClick={send} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              Enviar y devolver
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            El candidato recibirá un correo con este mensaje automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
