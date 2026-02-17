import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://conecta.econfia.co/",
});

// lee el token justo antes de cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
