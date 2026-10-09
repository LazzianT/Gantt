import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, LayoutDashboard, LayoutGrid, Search } from 'lucide-react';
import { api } from '../lib/api';
import type { ComponentType } from 'react';

interface ProjectOption {
  id: number;
  code: string;
  name: string;
}

interface PaletteItem {
  key: string;
  label: string;
  hint: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  run: () => void;
}

interface PortfolioApiRow {
  project_id: number;
  code: string;
  name: string;
}

/**
 * Global command palette (Cmd/Ctrl+K). Searches navigation targets and the
 * real project list so the control always does something it promises.
 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    if (projects === null) {
      api<PortfolioApiRow[]>('/portfolio')
        .then((rows) =>
          setProjects((rows ?? []).map((row) => ({ id: row.project_id, code: row.code, name: row.name }))),
        )
        .catch(() => setProjects([]));
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open, projects]);

  const items = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = [
      {
        key: 'nav-dashboard',
        label: 'Go to Dashboard',
        hint: 'Overview',
        icon: LayoutDashboard,
        run: () => navigate('/'),
      },
      {
        key: 'nav-portfolio',
        label: 'Go to Portfolio',
        hint: 'All projects',
        icon: LayoutGrid,
        run: () => navigate('/portfolio'),
      },
    ];
    const proj: PaletteItem[] = (projects ?? []).map((project) => ({
      key: `project-${project.id}`,
      label: project.name,
      hint: project.code,
      icon: FolderKanban,
      run: () => navigate(`/projects/${project.id}`),
    }));
    const all = [...nav, ...proj];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (item) => item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q),
    );
  }, [projects, query, navigate]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[active]?.run();
      onClose();
    } else if (event.key === 'Escape') {
      onClose();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search and jump to"
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-0 bg-ink/30 animate-overlay-in" onClick={onClose} />
      <div className="relative w-full max-w-[560px] animate-dialog-in overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Search size={17} className="shrink-0 text-ink-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects or jump to a page..."
            aria-label="Search projects or jump to a page"
            className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded-xs border border-line bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted sm:block">
            ESC
          </kbd>
        </div>

        <ul ref={listRef} role="listbox" aria-label="Results" className="max-h-[340px] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-ink-muted">
              {projects === null ? 'Loading projects…' : 'No matches found.'}
            </li>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon;
              const isActive = index === active;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-fast ease-standard ${
                      isActive ? 'bg-tint-lavender text-ink' : 'text-ink-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        isActive ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-secondary'
                      }`}
                    >
                      <Icon size={15} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.label}</span>
                    <span className="shrink-0 text-2xs uppercase tracking-wide text-ink-muted">{item.hint}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
