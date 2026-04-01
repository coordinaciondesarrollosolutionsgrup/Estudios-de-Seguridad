// src/api/studies.js
import api from "../api/axios";

export const enviarEstudio = (id) =>
  api.post(`/api/estudios/${id}/enviar/`);

export const devolverEstudio = (id, observacion) =>
  api.post(`/api/estudios/${id}/devolver/`, { observacion });

export const decidirEstudio = (id, decision, observacion = "") =>
  api.post(`/api/estudios/${id}/decidir/`, { decision, observacion });

/* ==== Referencias personales ====
   En tu router: router.register(r"refs-personales", ReferenciaPersonalViewSet, ...)
   -> Corrige endpoints y evita ?estudio= en POST (va en body)
*/
export const getReferencias = (estudioId) =>
  api.get("/api/refs-personales/", { params: { estudio: estudioId } });

export const createReferencia = (estudioId, payload) =>
  api.post("/api/refs-personales/", {
    ...payload,
    estudio: estudioId,
  });

export const updateReferencia = (id, payload) =>
  api.patch(`/api/refs-personales/${id}/`, payload);

export const deleteReferencia = (id) =>
  api.delete(`/api/refs-personales/${id}/`);

// ===== Patrimonio =====
export const getPatrimonio = (estudioId) =>
  api.get("/api/patrimonios/", { params: { estudio: estudioId } });

export const upsertPatrimonio = (estudioId, data, id) =>
  id
    ? api.patch(`/api/patrimonios/${id}/`, data)
    : api.post("/api/patrimonios/", {
        ...data,
        estudio: estudioId,
      });

export const saveConfigFormulario = (payload) =>
  api.post("/api/config-formulario/", payload);

export const getHistorialConfig = () =>
  api.get("/api/historial-config/");

// ===== Visita virtual (fase 1) =====
export const getVisitaVirtual = (estudioId) =>
  api.get(`/api/estudios/${estudioId}/visita-virtual/`);

export const iniciarVisitaVirtual = (estudioId, meetingUrl) =>
  api.post(`/api/estudios/${estudioId}/visita-virtual/iniciar/`, { meeting_url: meetingUrl });

export const finalizarVisitaVirtual = (estudioId) =>
  api.post(`/api/estudios/${estudioId}/visita-virtual/finalizar/`);

export const consentirVisitaVirtual = (estudioId) =>
  api.post(`/api/estudios/${estudioId}/visita-virtual/consentir/`);

export const enviarUbicacionVisitaVirtual = (estudioId, payload) =>
  api.post(`/api/estudios/${estudioId}/visita-virtual/ubicacion/`, payload);
