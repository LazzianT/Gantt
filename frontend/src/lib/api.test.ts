import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { getToken, setToken } from './auth';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: '',
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api 401 handling', () => {
  it('surfaces the server message for a 401 with no token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: { message: 'Invalid NIP or date of birth.' } })),
    );

    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: 'Invalid NIP or date of birth.',
      status: 401,
    });
  });

  it('clears the token and throws session-expired for a 401 with a token', async () => {
    setToken('jwt-token', true);
    // Point pathname at /login so api skips window.location.assign (not implemented in jsdom).
    window.history.pushState({}, '', '/login');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: { message: 'nope' } })));

    await expect(api('/projects')).rejects.toMatchObject({
      message: 'Your session expired. Sign in again.',
      status: 401,
    });
    expect(getToken()).toBeNull();
  });
});
