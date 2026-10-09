import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RequireAuth } from './router';
import { setToken } from '../lib/auth';

function token(payload: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <div>Login UI</div> },
      {
        element: <RequireAuth />,
        children: [{ path: '/', element: <div>Protected content</div> }],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe('RequireAuth', () => {
  it('redirects unauthenticated users to login', () => {
    renderAt('/');
    expect(screen.getByText('Login UI')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders protected content when authenticated', () => {
    setToken(token({ sub: '1', name: 'Ada', role: 'admin' }), true);
    renderAt('/');
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
