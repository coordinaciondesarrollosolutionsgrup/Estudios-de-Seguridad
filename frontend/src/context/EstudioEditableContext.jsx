import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";

const EstudioEditableContext = createContext({
  editable: true,
  estado: "EN_CAPTURA",
  loading: true,
  aConsideracionCliente: false,
});

export function EstudioEditableProvider({ studyId, children }) {
  const [estado, setEstado] = useState("EN_CAPTURA");
  const [editable, setEditable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [aConsideracionCliente, setAConsideracionCliente] = useState(false);

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
        setAConsideracionCliente(data?.a_consideracion_cliente || false);
      } catch {
        setEstado("EN_CAPTURA");
        setEditable(true);
        setAConsideracionCliente(false);
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    fetchEstado();
    return () => { cancel = true; };
  }, [studyId]);

  return (
    <EstudioEditableContext.Provider value={{ editable, estado, loading, aConsideracionCliente }}>
      {children}
    </EstudioEditableContext.Provider>
  );
}

export function useEstudioEditable() {
  return useContext(EstudioEditableContext);
}
