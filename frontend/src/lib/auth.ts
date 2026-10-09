export type Role = 'admin' | 'manager' | 'member' | 'viewer';

export interface TokenPayload {
  sub: string;
  name?: string;
  role: Role;
  /** Zero-padded HRIS department code (e.g. "0800"); null when unknown. */
  departCode?: string | null;
  /** Server-granted capability: may create/edit/delete projects. */
  canManageProjects?: boolean;
  iat?: number;
  exp?: number;
}

const TOKEN_KEY = 'pm_token';

// localStorage survives browser restarts (remember me); sessionStorage clears on tab close.
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, remember = false): void {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

export function getRole(): Role | null {
  const token = getToken();
  return token ? (decodeToken(token)?.role ?? null) : null;
}

/** Department-granted capability. The server re-checks on every mutation. */
export function canManageProjects(): boolean {
  const token = getToken();
  return token ? decodeToken(token)?.canManageProjects === true : false;
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  const { exp } = decodeToken(token) ?? {};
  if (exp && exp * 1000 <= Date.now()) {
    clearToken();
    return false;
  }
  return true;
}
