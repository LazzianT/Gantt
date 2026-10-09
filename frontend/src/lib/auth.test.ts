import { describe, expect, it } from 'vitest';
import { clearToken, decodeToken, getToken, isAuthenticated, setToken } from './auth';

const KEY = 'pm_token';

function token(payload: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

describe('setToken', () => {
  it('writes to localStorage only when remember is true', () => {
    setToken('t', true);
    expect(localStorage.getItem(KEY)).toBe('t');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('writes to sessionStorage only when remember is false', () => {
    setToken('t', false);
    expect(sessionStorage.getItem(KEY)).toBe('t');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('getToken', () => {
  it('finds a token in either storage', () => {
    localStorage.setItem(KEY, 'from-local');
    expect(getToken()).toBe('from-local');

    localStorage.clear();
    sessionStorage.setItem(KEY, 'from-session');
    expect(getToken()).toBe('from-session');
  });
});

describe('clearToken', () => {
  it('clears both storages', () => {
    localStorage.setItem(KEY, 'a');
    sessionStorage.setItem(KEY, 'b');
    clearToken();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe('decodeToken', () => {
  it('parses sub, name and role', () => {
    const t = token({ sub: '1234', name: 'Ada', role: 'manager' });
    expect(decodeToken(t)).toMatchObject({ sub: '1234', name: 'Ada', role: 'manager' });
  });
});

describe('isAuthenticated', () => {
  it('returns false and clears when exp is in the past', () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    setToken(token({ sub: '1', role: 'member', exp }), true);
    expect(isAuthenticated()).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('returns true for a token without exp', () => {
    setToken(token({ sub: '1', role: 'member' }), true);
    expect(isAuthenticated()).toBe(true);
  });
});
