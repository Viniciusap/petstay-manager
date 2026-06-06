import axios from 'axios';

export const apiBase = import.meta.env.VITE_API_URL ?? '/api';
export const backendBase = apiBase.replace(/\/api$/, '');

// Resolves a stored file path to a usable URL.
// Handles full URLs (Blob/BACKEND_PUBLIC_URL) and relative paths (same-origin dev).
export function resolveFileUrl(storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  if (storedPath.startsWith('http')) return storedPath;
  return `${backendBase}/${storedPath.replace(/^\//, '')}`;
}

const api = axios.create({ baseURL: apiBase, withCredentials: true });

api.interceptors.response.use(
  res => res.data,
  err => Promise.reject(err.response?.data || err)
);

export default api;
