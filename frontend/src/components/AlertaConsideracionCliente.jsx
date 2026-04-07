import { useEstudioEditable } from "../context/EstudioEditableContext";
import { useEffect, useState } from "react";

export default function AlertaConsideracionCliente({ politicasNoRelevantes }) {
  const { aConsideracionCliente, loading } = useEstudioEditable();
  const [noRelevantes, setNoRelevantes] = useState([]);

  useEffect(() => {
    if (Array.isArray(politicasNoRelevantes)) {
      setNoRelevantes(politicasNoRelevantes);
    }
  }, [politicasNoRelevantes]);

  if (loading || !aConsideracionCliente) return null;
  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(245,158,66,0.15) 0%, rgba(245,158,66,0.08) 100%)',
      border: '1px solid rgba(245,158,66,0.4)',
      borderLeft: '4px solid #f59e42',
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 8,
    }}>
      <span style={{ fontSize: 20, lineHeight: 1.3 }}>⚠️</span>
      <div>
        <p style={{ margin: 0, fontWeight: 'bold', color: '#f59e42', fontSize: 13 }}>
          Estudio bajo consideración del cliente
        </p>
        <p style={{ margin: '4px 0 0', color: '#d1d5db', fontSize: 12, lineHeight: 1.5 }}>
          Este estudio fue creado bajo consideración del cliente. Los criterios seleccionados como{' '}
          <b style={{ color: '#f59e42' }}>no relevantes</b> fueron configurados por el cliente y el resultado
          debe ser interpretado bajo esa política.
        </p>
        {noRelevantes && noRelevantes.length > 0 && (
          <ul style={{ margin: '8px 0 0 0', padding: 0, color: '#f59e42', fontSize: 12, listStyle: 'inside disc' }}>
            {noRelevantes.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
