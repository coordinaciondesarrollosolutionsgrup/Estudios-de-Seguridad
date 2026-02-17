import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import SectionCard from "./SectionCard";
import CentralesUploader from "./CentralesUploader";

export default function StudySections({ studyId }) {
  const [study, setStudy] = useState(null);
  const [centrales, setCentrales] = useState([]); // archivos listados
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/estudios/${studyId}/`);
      setStudy(data);

      // intenta listar centrales si existe la acción opcional
      try {
        const { data: docs } = await api.get(`/api/estudios/${studyId}/documentos/?categoria=CENTRALES`);
        setCentrales(docs || []);
      } catch (_) {
        setCentrales([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (studyId) load(); }, [studyId]);

  const itemsByTipo = useMemo(() => {
    const map = {};
    (study?.items || []).forEach((it) => {
      map[it.tipo] = it;
    });
    return map;
  }, [study]);

  const asRowsAcademico = (item) =>
    (item?.academicos || []).map(a => ({
      id: a.id,
      title: `${a.titulo || "—"} · ${a.institucion || "—"}`,
      meta: [a.ciudad, a.fecha_graduacion ? `Grad: ${a.fecha_graduacion}` : null].filter(Boolean).join(" · "),
      fileUrl: a.archivo || null,
      puntaje: item?.puntaje || 0,
      comentario: item?.comentario || "",
    }));

  const asRowsLaboral = (item) =>
    (item?.laborales || []).map(l => ({
      id: l.id,
      title: `${l.empresa || "—"} · ${l.cargo || "—"}`,
      meta: [l.ingreso ? `Desde ${l.ingreso}` : null, l.retiro ? `hasta ${l.retiro}` : null].filter(Boolean).join(" "),
      fileUrl: l.certificado || null,
      puntaje: item?.puntaje || 0,
      comentario: item?.comentario || "",
    }));

  const validarUno = async (_row, { puntaje, comentario }) => {
    try {
      await api.post(`/api/estudio-items/${itemsByTipo[_row.tipo]?.id || _row.itemId || _row.id}/validar/`, {
        puntaje, comentario
      });
    } catch {
      // fallback: cuando la fila no es un item directo usamos el item del módulo
      const itemId = itemsByTipo["TITULOS_ACADEMICOS"]?.id || itemsByTipo["CERT_LABORALES"]?.id;
      if (itemId) await api.post(`/api/estudio-items/${itemId}/validar/`, { puntaje, comentario });
    } finally {
      await load();
    }
  };

  const obserUno = async (_row, comentario) => {
    try {
      const itemId = itemsByTipo["TITULOS_ACADEMICOS"]?.id || itemsByTipo["CERT_LABORALES"]?.id;
      if (!itemId) return;
      await api.post(`/api/estudio-items/${itemId}/observacion/`, { comentario });
      await load();
    } catch (e) {
      alert("No se pudo guardar la observación.");
    }
  };

  const validarMasivo = async (rows, tipo) => {
    const itemId = (tipo === "ACA") ? itemsByTipo["TITULOS_ACADEMICOS"]?.id : itemsByTipo["CERT_LABORALES"]?.id;
    if (!itemId) return;
    try {
      // enviamos estructura mínima
      await api.post(`/api/estudios/${studyId}/validar_masivo/`, {
        items: [{ id: itemId, estado: "VALIDADO", puntaje: 0, comentario: "" }]
      });
      await load();
    } catch {
      alert("No se pudo validar.");
    }
  };

  if (loading) return <div className="text-sm text-slate-300">Cargando…</div>;
  if (!study) return null;

  const itAcad = itemsByTipo["TITULOS_ACADEMICOS"];
  const itLab  = itemsByTipo["CERT_LABORALES"];

  return (
    <div className="space-y-4">
      <SectionCard
        title="👩‍🎓 Académico"
        subtitle="Registros académicos cargados por el candidato"
        rows={asRowsAcademico(itAcad)}
        onValidateOne={(row, p) => validarUno({ ...row, tipo: "TITULOS_ACADEMICOS" }, p)}
        onObservacion={(row, c) => obserUno(row, c)}
        onValidateSelected={(rows) => validarMasivo(rows, "ACA")}
      />

      <SectionCard
        title="💼 Laboral"
        subtitle="Experiencia laboral y certificados"
        rows={asRowsLaboral(itLab)}
        onValidateOne={(row, p) => validarUno({ ...row, tipo: "CERT_LABORALES" }, p)}
        onObservacion={(row, c) => obserUno(row, c)}
        onValidateSelected={(rows) => validarMasivo(rows, "LAB")}
      />

      <SectionCard
        title="📊 Centrales de riesgo"
        subtitle="Solo analista: adjunta y consulta soportes"
        rows={(centrales || []).map(d => ({
          id: d.id,
          title: d.nombre,
          meta: `Subido por ${d.subido_por || "—"} · ${new Date(d.creado).toLocaleString()}`,
          fileUrl: d.url,
        }))}
        selectable={false}
        extra={
          <CentralesUploader
            studyId={studyId}
            onUploaded={(created) => setCentrales((prev) => [...created, ...prev])}
          />
        }
      />
    </div>
  );
}
