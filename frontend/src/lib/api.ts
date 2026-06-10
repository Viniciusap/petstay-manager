function deriveSlug(): string {
  if (typeof window === 'undefined') return '';
  const segs = window.location.pathname.split('/').filter(Boolean);
  const first = segs[0] ?? '';
  const RESERVED = new Set(['system', 'health', 'api', 'assets', 'uploads', 'public']);
  if (!first || RESERVED.has(first)) return '';
  return first;
}

export const tenantSlug = deriveSlug();
export const apiBase = tenantSlug ? `/${tenantSlug}/api/v1` : '/api/v1';
export const uploadsBase = tenantSlug ? `/${tenantSlug}` : '';

export function resolveFileUrl(storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  if (storedPath.startsWith('http')) return storedPath;
  return `${uploadsBase}/${storedPath.replace(/^\//, '')}`;
}

export interface ApiEnvelope<T> {
  data?: T;
  error?: string;
  code?: string;
  meta?: { total?: number };
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = await res.json() as ApiEnvelope<T>;

  if (!res.ok) {
    throw new ApiError(body.error ?? 'Request failed', body.code ?? 'UNKNOWN', res.status);
  }

  return body;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData, headers: {} }),
};

export default api;
