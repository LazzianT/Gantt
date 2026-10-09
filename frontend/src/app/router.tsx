import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth';
import AppShell from './AppShell';
import LoginPage from '../features/auth/LoginPage';
import DashboardPage from '../features/dashboard/DashboardPage';
import PortfolioPage from '../features/portfolio/PortfolioPage';
import WorkspacePage from '../features/workspace/WorkspacePage';

export function RequireAuth() {
  return isAuthenticated() ? <Outlet /> : <Navigate to="/login" replace />;
}

export function RedirectIfAuthed() {
  return isAuthenticated() ? <Navigate to="/" replace /> : <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'portfolio', element: <PortfolioPage /> },
          { path: 'projects/:id', element: <WorkspacePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
