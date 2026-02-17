// src/utils/progress.js
export const bioProgress = (obj = {}) => {
  const REQ = ["nombre","apellido","tipo_documento","cedula","fecha_nacimiento","direccion","departamento_id","municipio_id","telefono","eps"];
  const done = REQ.filter(k => {
    const v = obj[k];
    return v !== null && v !== undefined && String(v).trim() !== "";
  }).length;
  return Math.round((done / REQ.length) * 100);
};

export const saveSectionProgress = (studyId, section, pct) =>
  localStorage.setItem(`progress:${studyId}:${section}`, String(pct));

export const overallProgress = (studyId) => {
  const sections = ["bio","academico","laboral","docs"];
  const sum = sections.reduce((a,s) => a + parseInt(localStorage.getItem(`progress:${studyId}:${s}`) || "0",10), 0);
  return Math.round(sum / sections.length);
};

// <-- Este PATCH debe existir en tu backend (ver punto b)
export async function pushStudyProgress(api, studyId, total) {
  try {
    await api.post(`/api/estudios/${studyId}/set_progress/`, { progreso: total });
  } catch (e) {
    // si el endpoint aún no existe o falla, no rompas la UI
    console.warn("No se pudo enviar el progreso al servidor", e?.response?.data || e);
  }
}
