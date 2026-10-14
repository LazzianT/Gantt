import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CheckSquare,
  LayoutDashboard,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { clearToken, decodeToken, getToken } from '../lib/auth';
import { APP_NAME } from '../config/app';
import { LogoLockup, LogoMark } from '../components/Logo';
import PageTransition from './PageTransition';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';

const COLLAPSE_KEY = 'pm_nav_collapsed';

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = getToken();
  const user = token ? decodeToken(token) : null;

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onSignOut() {
      clearToken();
      navigate('/login', { replace: true });
    }
    window.addEventListener('pm:signout', onSignOut);
    return () => window.removeEventListener('pm:signout', onSignOut);
  }, [navigate]);

  const displayName = user?.name ?? user?.sub ?? '';
  const initials = (displayName || '?').slice(0, 2).toUpperCase();
  const canManageProjects = user?.canManageProjects === true;

  function renderNav(isCollapsed: boolean) {
    return (
      <nav aria-label="Primary" className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
        <SectionLabel collapsed={isCollapsed}>Overview</SectionLabel>
        <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Dashboard" collapsed={isCollapsed} end />

        <SectionLabel collapsed={isCollapsed}>Projects</SectionLabel>
        <NavItem to="/portfolio" icon={<LayoutGrid size={18} />} label="Portfolio" collapsed={isCollapsed} />
        {canManageProjects && (
          <button
            type="button"
            onClick={() => navigate('/portfolio?new=1')}
            title={isCollapsed ? 'New project' : undefined}
            className={`flex h-9 items-center gap-2.5 rounded-md text-sm font-semibold text-brand transition-colors duration-fast ease-standard hover:bg-brand-soft focus-visible:outline-none focus-visible:shadow-focus ${
              isCollapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            <span className="shrink-0">
              <Plus size={18} />
            </span>
            {!isCollapsed && <span className="truncate">New project</span>}
          </button>
        )}
        <NavItem to="/my-tasks" icon={<CheckSquare size={18} />} label="My Tasks" collapsed={isCollapsed} />
        <NavItem to="/reports" icon={<BarChart3 size={18} />} label="Reports" collapsed={isCollapsed} />

        <SectionLabel collapsed={isCollapsed}>People</SectionLabel>
        <PlaceholderItem icon={<Users size={18} />} label="Directory" collapsed={isCollapsed} />
      </nav>
    );
  }

  return (
    <div className="flex h-full bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-toast focus:rounded-md focus:bg-brand focus:px-3 focus:py-1.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      {/* Desktop side nav */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-line bg-surface lg:flex ${
          collapsed ? 'w-16' : 'w-[248px]'
        } transition-[width] duration-drawer ease-standard`}
      >
        <Brand collapsed={collapsed} />
        {renderNav(collapsed)}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : undefined}
          className={`mx-2 mb-3 flex h-9 items-center gap-2.5 rounded-md text-sm font-medium text-ink-secondary transition-colors duration-fast ease-standard hover:bg-surface-sunken ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      {/* Mobile off-canvas nav */}
      {mobileOpen && (
        <div className="fixed inset-0 z-drawer lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-overlay-in bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[272px] max-w-[85vw] animate-[menuIn_220ms_cubic-bezier(.16,1,.3,1)] flex-col border-r border-line bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <LogoLockup size={24} className="text-[15px] text-ink" />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="icon-btn">
                <X size={18} />
              </button>
            </div>
            {renderNav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-toolbar flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:px-6">
          <Topbar
            displayName={displayName}
            role={user?.role ?? 'member'}
            initials={initials}
            onOpenMenu={() => setMobileOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
          />
        </header>

        <main id="main" className="min-h-0 flex-1 overflow-auto">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/"
      className={`flex h-14 shrink-0 items-center gap-2 border-b border-line-hairline text-ink ${
        collapsed ? 'justify-center px-2' : 'px-4'
      }`}
      aria-label={`${APP_NAME} home`}
    >
      {collapsed ? (
        <LogoMark size={24} className="shrink-0" />
      ) : (
        <LogoLockup size={24} className="text-[15px]" />
      )}
    </Link>
  );
}

function NavItem({
  to,
  icon,
  label,
  collapsed,
  end,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `relative flex h-9 items-center gap-2.5 rounded-md text-sm transition-colors duration-fast ease-standard ${
          collapsed ? 'justify-center px-0' : 'px-3'
        } ${
          isActive
            ? 'bg-brand-soft font-semibold text-brand'
            : 'font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="shrink-0 text-current">{icon}</span>
          {!collapsed && <span className="truncate">{label}</span>}
          {!collapsed && isActive && (
            <span aria-hidden className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />
          )}
        </>
      )}
    </NavLink>
  );
}

function SectionLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  if (collapsed) return <span className="sr-only">{children}</span>;
  return (
    <p className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted first:pt-0">
      {children}
    </p>
  );
}

function PlaceholderItem({
  icon,
  label,
  collapsed,
}: {
  icon: ReactNode;
  label: string;
  collapsed: boolean;
}) {
  return (
    <div
      aria-disabled="true"
      title={collapsed ? `${label} (coming soon)` : undefined}
      className={`flex h-9 cursor-not-allowed items-center gap-2.5 rounded-md text-sm font-medium text-ink-disabled ${
        collapsed ? 'justify-center px-0' : 'px-3'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          <span className="ml-auto rounded-xs border border-line bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Soon
          </span>
        </>
      )}
    </div>
  );
}
