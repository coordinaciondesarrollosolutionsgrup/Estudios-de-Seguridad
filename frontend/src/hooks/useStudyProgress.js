// src/hooks/useStudyProgress.js
import { useEffect, useState } from "react";
import api from "../api/axios";

export default function useStudyProgress(initial = 0, estudioId = null) {
  const [progreso, setProgreso] = useState(Math.round(initial || 0));

  // Si cambia el initial (por re-carga del estudio/lista), actualiza estado
  useEffect(() => {
    setProgreso(Math.round(initial || 0));
  }, [initial]);

  // Polling suave al backend mientras tengamos estudioId
  useEffect(() => {
    if (!estudioId) return;
    let timer = null;
    let aborted = false;

    const tick = async () => {
      try {
        const { data } = await api.get(`/api/estudios/${estudioId}/resumen/`);
        if (!aborted) setProgreso(Math.round(data?.progreso ?? 0)); 
      } catch (e) {
        // silencioso
      }
      timer = setTimeout(tick, 2500);
    };

    tick();
    return () => { aborted = true; if (timer) clearTimeout(timer); };
  }, [estudioId]);

  return progreso;
}
