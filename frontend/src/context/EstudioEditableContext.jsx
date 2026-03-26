import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";

// Contexto para saber si el estudio es editable
const EstudioEditableContext = createContext({ editable: true, estado: "EN_CAPTURA", loading: true });

export function EstudioEditableProvider({ studyId, children }) {
  const [estado, setEstado] = useState("EN_CAPTURA");
  const [editable, setEditable] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    async function fetchEstado() {
      setLoading(true);
      try {
        if (!studyId) return;
        const { data } = await api.get(`/api/estudios/${studyId}/`);
        const est = (data?.estado || "EN_CAPTURA").toUpperCase();
        setEstado(est);
        setEditable(est === "EN_CAPTURA" || est === "DEVUELTO");
      } catch {
        setEstado("EN_CAPTURA");
        setEditable(true);
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    fetchEstado();
    return () => { cancel = true; };
  }, [studyId]);

  return (
    <EstudioEditableContext.Provider value={{ editable, estado, loading }}>
      {children}
    </EstudioEditableContext.Provider>
  );
}

export function useEstudioEditable() {
  return useContext(EstudioEditableContext);
}
