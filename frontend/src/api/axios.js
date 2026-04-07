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

// Detecta sesión expirada (401) y notifica a la app
let _sessionExpiredFired = false;
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const url = err?.config?.url || "";
    const isAuthEndpoint = url.includes("/auth/login/") || url.includes("/auth/token") || url.includes("/auth/password-reset/");
    if (status === 401 && !isAuthEndpoint && !_sessionExpiredFired) {
      _sessionExpiredFired = true;
      window.dispatchEvent(new CustomEvent("session:expired"));
    }
    return Promise.reject(err);
  }
);

export default api;
