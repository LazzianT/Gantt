import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from './LoginPage';
import { api, ApiError } from '../../lib/api';
import { getToken } from '../../lib/auth';

vi.mock('../../lib/api', () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  return { api: vi.fn(), ApiError };
});

const mockApi = vi.mocked(api);

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/target' } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/target" element={<div>Target page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/NIP/i), '1234');
  await user.type(screen.getByLabelText(/Tanggal Lahir/i), '1990-01-01');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeEach(() => {
  mockApi.mockReset();
});

describe('LoginPage', () => {
  it('renders NIP, Tanggal Lahir and submit', () => {
    renderLogin();
    expect(screen.getByLabelText(/NIP/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tanggal Lahir/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows validation on empty submit and does not call api', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('NIP is required.')).toBeInTheDocument();
    expect(screen.getByText('Tanggal Lahir is required.')).toBeInTheDocument();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('calls api, stores token and navigates on valid submit', async () => {
    mockApi.mockResolvedValueOnce({
      token: 'jwt-token',
      user: { nip: '1234', name: 'Ada', role: 'manager' },
    });
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText('Target page')).toBeInTheDocument());
    expect(mockApi).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { nip: '1234', birthDate: '1990-01-01' },
    });
    expect(getToken()).toBe('jwt-token');
  });

  it('shows the error alert on ApiError', async () => {
    mockApi.mockRejectedValueOnce(new ApiError(401, 'Your session expired. Sign in again.'));
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session expired. Sign in again.',
    );
  });

  it('disables the submit button while the request is pending', async () => {
    let resolve: (value: unknown) => void = () => {};
    mockApi.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmit(user);

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();

    resolve({ token: 'x', user: { nip: '1234', name: 'Ada', role: 'manager' } });
    await waitFor(() => expect(screen.getByText('Target page')).toBeInTheDocument());
  });
});
