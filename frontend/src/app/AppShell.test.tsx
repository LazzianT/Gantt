import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';
import { getToken, setToken } from '../lib/auth';

const KEY = 'pm_token';

function token(payload: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div>Stub child</div>} />
        </Route>
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    setToken(token({ sub: '1234', name: 'Ada Lovelace', role: 'admin' }), true);
  });

  it('signs out, clears both storages and navigates to /login', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.getByText('Stub child')).toBeInTheDocument();
    expect(getToken()).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /Ada Lovelace/i }));
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }));

    await waitFor(() => expect(screen.getByText('Login screen')).toBeInTheDocument());
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
