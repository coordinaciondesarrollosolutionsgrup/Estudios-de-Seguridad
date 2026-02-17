import { useEffect, useState } from "react";
import api from "../api/axios";
import { overallProgress } from "../utils/progress";

export default function StudyProgressCard({ studyId }) {
  const [pct, setPct] = useState(0);

  const reload = async () => {
    try {
      const { data } = await api.get(`/api/estudios/${studyId}/resumen/`);
      const v = typeof data?.progreso === "number" ? Math.round(data.progreso) : overallProgress(studyId);
      setPct(v);
    } catch {
      setPct(overallProgress(studyId));
    }
  };

  useEffect(() => {
    reload();
    const onEvt = (e) => {
      if (e.detail?.studyId === studyId) setPct(e.detail.total);
    };
    window.addEventListener("study-progress", onEvt);
    window.addEventListener("storage", reload); // por si cambia en otra pestaña
    return () => {
      window.removeEventListener("study-progress", onEvt);
      window.removeEventListener("storage", reload);
    };
  }, [studyId]);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 w-44 shadow">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-300">Estudio</span>
        <span className="text-xs rounded bg-white/10 px-1.5">#{studyId}</span>
      </div>
      <div className="text-xs text-slate-300 mb-1">
        Progreso: <b>{pct}%</b>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
