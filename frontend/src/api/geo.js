import api from "./axios";

export const getDepartamentos = async (q="") => {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  const { data } = await api.get(`/api/geo/departamentos/${query}`);
  return data; // [{id, nombre}]
};

export const getMunicipios = async (depId, q="") => {
  const qs = new URLSearchParams({ dep_id: depId });
  if (q) qs.set("q", q);
  const { data } = await api.get(`/api/geo/municipios/?${qs.toString()}`);
  return data; // [{id, nombre}]
};
