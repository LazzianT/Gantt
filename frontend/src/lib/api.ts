import { clearToken, getToken } from './auth';

const BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const token = getToken();

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // A 401 with no token is a rejected login attempt, not an expired session:
  // fall through so the server message reaches the form.
  if (res.status === 401 && token) {
    clearToken();
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    throw new ApiError(401, 'Your session expired. Sign in again.');
  }

  const payload: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const error = (payload as { error?: unknown } | null)?.error;
    const message =
      typeof error === 'string'
        ? error
        : ((error as { message?: string } | undefined)?.message ?? res.statusText);
    throw new ApiError(
      res.status,
      message,
      (error as { code?: string } | undefined)?.code,
      (error as { details?: unknown } | undefined)?.details,
    );
  }

  return (payload as { data: T } | null)?.data as T;
}

/** Authenticated binary download — plain `<a href>` would omit the bearer token. */
export async function apiBlob(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401 && token) {
    clearToken();
    if (window.location.pathname !== '/login') window.location.assign('/login');
    throw new ApiError(401, 'Your session expired. Sign in again.');
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, payload?.error?.message ?? res.statusText);
  }

  return res.blob();
}
