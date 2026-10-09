import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  SearchX,
} from 'lucide-react';
import { api } from '../lib/api';
import { relativeTime } from '../lib/format';
import type { RecentUpdate } from '../features/dashboard/api';

interface ScopeProject {
  id: number;
  code: string;
  name: string;
}

interface PortfolioApiRow {
  project_id: number;
  code: string;
  name: string;
}

type PopoverKey = 'scope' | 'bell' | 'user' | null;

interface TopbarProps {
  displayName: string;
  role: string;
  initials: string;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}

export default function Topbar({ displayName, role, initials, onOpenMenu, onOpenSearch }: TopbarProps) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<PopoverKey>(null);
  const [projects, setProjects] = useState<ScopeProject[] | null>(null);
  const [activity, setActivity] = useState<RecentUpdate[] | null>(null);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function toggleScope() {
    const next = open === 'scope' ? null : 'scope';
    setOpen(next);
    if (next === 'scope' && projects === null) {
      api<PortfolioApiRow[]>('/portfolio')
        .then((rows) =>
          setProjects((rows ?? []).map((row) => ({ id: row.project_id, code: row.code, name: row.name }))),
        )
        .catch(() => setProjects([]));
    }
  }

  function toggleBell() {
    const next = open === 'bell' ? null : 'bell';
    setOpen(next);
    if (next === 'bell' && activity === null) {
      api<{ recent_updates: RecentUpdate[] }>('/dashboard')
        .then((data) => setActivity(data?.recent_updates ?? []))
        .catch(() => setActivity([]));
    }
  }

  function go(path: string) {
    setOpen(null);
    navigate(path);
  }

  return (
    <div ref={rootRef} className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={onOpenMenu}
        className="icon-btn -ml-1 h-9 w-9 lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu size={20} />
      </button>

      {/* Workspace / scope selector */}
      <div className="relative">
        <button
          type="button"
          onClick={toggleScope}
          aria-haspopup="menu"
          aria-expanded={open === 'scope'}
          className="inline-flex h-9 max-w-[220px] items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors duration-fast ease-standard hover:bg-surface-subtle focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Building2 size={16} className="shrink-0 text-brand" aria-hidden />
          <span className="truncate">All projects</span>
          <ChevronDown size={15} className="shrink-0 text-ink-muted" aria-hidden />
        </button>

        {open === 'scope' && (
          <div
            role="menu"
            className="absolute left-0 top-11 z-popover w-72 animate-menu-in overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
          >
            <p className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
              Workspace
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/portfolio')}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-surface-subtle focus-visible:outline-none focus-visible:bg-surface-subtle"
            >
              <Check size={15} className="text-brand" aria-hidden />
              <span className="flex-1 font-medium">All projects</span>
              <span className="text-2xs text-ink-muted">Portfolio</span>
            </button>
            <div className="my-1 border-t border-line-hairline" />
            <p className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
              Jump to project
            </p>
            <div className="max-h-64 overflow-y-auto">
              {projects === null ? (
                <p className="px-3 py-3 text-sm text-ink-muted">Loading…</p>
              ) : projects.length === 0 ? (
                <p className="px-3 py-3 text-sm text-ink-muted">No projects available.</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitem"
                    onClick={() => go(`/projects/${project.id}`)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:bg-surface-subtle"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{project.name}</span>
                    <span className="shrink-0 text-2xs tabular text-ink-muted">{project.code}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Global search */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="ml-1 hidden h-9 w-full max-w-[360px] items-center gap-2.5 rounded-md border border-line bg-surface-subtle px-3 text-left text-sm text-ink-muted transition-colors duration-fast ease-standard hover:border-line-strong hover:bg-surface focus-visible:outline-none focus-visible:shadow-focus md:flex"
      >
        <Search size={16} className="shrink-0" aria-hidden />
        <span className="flex-1 truncate">Search projects…</span>
        <kbd className="shrink-0 rounded-xs border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenSearch}
          className="icon-btn h-9 w-9 md:hidden"
          aria-label="Search projects"
        >
          <Search size={19} />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={toggleBell}
            aria-haspopup="menu"
            aria-expanded={open === 'bell'}
            aria-label="Notifications"
            className="icon-btn h-9 w-9"
          >
            <Bell size={19} />
            {activity && activity.length > 0 && (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand ring-2 ring-surface"
              />
            )}
          </button>

          {open === 'bell' && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-popover w-80 animate-menu-in overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
            >
              <div className="flex h-10 items-center justify-between border-b border-line px-3">
                <p className="text-sm font-semibold text-ink">Activity</p>
                <span className="text-2xs text-ink-muted">Recent updates</span>
              </div>
              {activity === null ? (
                <p className="px-3 py-6 text-center text-sm text-ink-muted">Loading…</p>
              ) : activity.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <SearchX size={22} className="mx-auto text-ink-disabled" aria-hidden />
                  <p className="mt-2 text-sm text-ink-secondary">You're all caught up.</p>
                </div>
              ) : (
                <ul className="max-h-[360px] divide-y divide-line-hairline overflow-y-auto">
                  {activity.slice(0, 8).map((update) => (
                    <li key={update.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => go(`/projects/${update.project_id}`)}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:bg-surface-subtle"
                      >
                        <p className="w-full truncate text-sm text-ink">
                          <span className="font-medium capitalize">
                            {update.entity_type} {update.action.replace(/_/g, ' ')}
                          </span>
                        </p>
                        <p className="w-full truncate text-xs text-ink-secondary">{update.project_name}</p>
                        <time dateTime={update.created_at} className="text-2xs text-ink-muted">
                          {relativeTime(update.created_at)}
                        </time>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((key) => (key === 'user' ? null : 'user'))}
            aria-haspopup="menu"
            aria-expanded={open === 'user'}
            className="flex h-9 items-center gap-2 rounded-md pl-1 pr-1.5 transition-colors duration-fast ease-standard hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
              {initials}
            </span>
            <span className="hidden max-w-[160px] truncate text-sm font-medium text-ink sm:inline">
              {displayName}
            </span>
            <ChevronDown size={15} className="hidden text-ink-muted sm:block" aria-hidden />
          </button>

          {open === 'user' && (
            <div
              role="menu"
              className="absolute right-0 top-11 z-popover w-60 animate-menu-in overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
            >
              <div className="border-b border-line-hairline px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-ink">{displayName || 'Signed in'}</p>
                <p className="mt-0.5 text-2xs uppercase tracking-wide text-ink-muted">{role}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(null);
                  window.dispatchEvent(new Event('pm:signout'));
                }}
                className="flex h-9 w-full items-center gap-2 px-3 text-sm text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:bg-surface-sunken"
              >
                <LogOut size={16} className="text-ink-secondary" aria-hidden />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
