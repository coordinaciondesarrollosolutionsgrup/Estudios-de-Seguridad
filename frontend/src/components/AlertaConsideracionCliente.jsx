import { useEstudioEditable } from "../context/EstudioEditableContext";

export default function AlertaConsideracionCliente() {
  const { aConsideracionCliente, loading } = useEstudioEditable();
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
      </div>
    </div>
  );
}
