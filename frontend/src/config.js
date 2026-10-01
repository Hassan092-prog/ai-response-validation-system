// Use relative paths in production (Docker/FastAPI) and explicit port in local dev (Vite)
export const API_BASE = window.location.port === '5173' || window.location.port === '3000'
  ? `http://${window.location.hostname}:8005`
  : '';
