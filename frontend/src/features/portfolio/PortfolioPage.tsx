import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertTriangle, FolderOpen, Plus, RefreshCw, Search } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { canManageProjects } from '../../lib/auth';
import StatusPill from '../../components/StatusPill';
import HealthPill from '../../components/HealthPill';
import ProgressBar from '../../components/ProgressBar';
import { labelize } from '../dashboard/components';
import NewProjectModal from './NewProjectModal';
import type { HealthStatus, PortfolioProject, ProjectStatus } from '../../types';

type FilterKey = 'all' | ProjectStatus | 'at_risk' | 'delayed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'planning', label: 'Planning' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'at_risk', label: 'At Risk' },
  { key: 'delayed', label: 'Delayed' },
];

const ATTENTION_HEALTH: HealthStatus[] = ['at_risk', 'delayed', 'critical'];

/** Raw `GET /api/v1/portfolio` row: snake_case, Title-Case enums. */
interface PortfolioApiRow {
  project_id: number;
  code: string;
  name: string;
  manager_name: string | null;
  status: string;
  health: string;
  start_date: string | null;
  target_end_date: string | null;
  weighted_progress: number;
  team_size: number;
  open_tasks: number;
  done_tasks: number;
  overdue_tasks: number;
  critical_tasks: number;
  slip_days: number;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '_');
}

function toPortfolioItem(row: PortfolioApiRow): PortfolioProject {
  return {
    id: row.project_id,
    code: row.code,
    name: row.name,
    managerName: row.manager_name,
    status: normalize(row.status) as ProjectStatus,
    health: normalize(row.health) as HealthStatus,
    startDate: row.start_date,
    finishDate: row.target_end_date,
    progress: row.weighted_progress,
    teamSize: row.team_size,
    openTasks: row.open_tasks,
    doneTasks: row.done_tasks,
    overdueTasks: row.overdue_tasks,
    criticalTasks: row.critical_tasks,
    slipDays: row.slip_days,
  };
}

function matches(project: PortfolioProject, key: FilterKey): boolean {
  if (key === 'all') return true;
  if (key === 'at_risk') return project.health === 'at_risk';
  if (key === 'delayed') return project.health === 'delayed';
  return project.status === key;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFmt.format(date);
}

export default function PortfolioPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<PortfolioProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);

  const canManage = canManageProjects();

  function load() {
    setLoading(true);
    setError(null);
    api<PortfolioApiRow[]>('/portfolio')
      .then((data) => setProjects((data ?? []).map(toPortfolioItem)))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the portfolio.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (canManage) setShowNew(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, canManage, setSearchParams]);

  const filtered = useMemo(() => {
    const list = projects ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((project) => {
      if (!matches(project, filter)) return false;
      if (!q) return true;
      return (
        project.code.toLowerCase().includes(q) ||
        project.name.toLowerCase().includes(q) ||
        (project.managerName ?? '').toLowerCase().includes(q)
      );
    });
  }, [projects, filter, query]);

  const metrics = useMemo(() => {
    const list = projects ?? [];
    return {
      total: list.length,
      active: list.filter((project) => project.status === 'active').length,
      completed: list.filter((project) => project.status === 'completed').length,
      attention: list.filter((project) => ATTENTION_HEALTH.includes(project.health)).length,
    };
  }, [projects]);

  const hasData = (projects?.length ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Portfolio</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Track and manage every project in one place.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[320px]">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
              className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          {canManage && (
            <button type="button" onClick={() => setShowNew(true)} className="btn-primary h-10 shrink-0">
              <Plus size={16} />
              New project
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Total projects" value={metrics.total} hint="Across the portfolio" />
        <Metric label="Active" value={metrics.active} hint="In delivery now" tone="brand" />
        <Metric label="Completed" value={metrics.completed} hint="Successfully delivered" tone="success" />
        <Metric
          label="Needs attention"
          value={metrics.attention}
          hint={metrics.attention > 0 ? 'At risk, delayed or critical' : 'All projects healthy'}
          tone={metrics.attention > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-b border-line">
        <div role="tablist" aria-label="Project filters" className="flex gap-1 overflow-x-auto">
          {FILTERS.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setFilter(tab.key)}
                className={`-mb-px h-10 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-fast focus-visible:outline-none ${
                  active
                    ? 'border-brand text-brand'
                    : 'border-transparent text-ink-secondary hover:border-line-strong hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {hasData && !loading && !error && (
          <p className="hidden shrink-0 text-xs tabular text-ink-muted sm:block">
            {filtered.length} of {metrics.total}
          </p>
        )}
      </div>

      {!loading && error && <ErrorState onRetry={load} />}

      {loading && <TableSkeleton />}

      {!loading && !error && !hasData && (
        <EmptyState
          title="No projects yet"
          description={
            canManage
              ? 'Create the first project to get started.'
              : 'Projects appear here once your department creates one.'
          }
          action={
            canManage ? (
              <button type="button" onClick={() => setShowNew(true)} className="btn-primary h-10">
                <Plus size={16} />
                New project
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && hasData && filtered.length === 0 && (
        <EmptyState
          title="No projects match these filters"
          description="Try a different status or clear the search."
          action={
            <button
              type="button"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white transition-colors duration-fast hover:bg-brand-hover"
            >
              Clear filters
            </button>
          }
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-line bg-surface shadow-xs md:block">
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-b border-line bg-surface-subtle text-left text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2.5">Project</th>
                  <th className="w-32 px-3 py-2.5">Status</th>
                  <th className="hidden w-32 px-3 py-2.5 lg:table-cell">Health</th>
                  <th className="w-40 px-3 py-2.5">Progress</th>
                  <th className="hidden w-40 px-3 py-2.5 lg:table-cell">Manager</th>
                  <th className="hidden w-16 px-3 py-2.5 text-right xl:table-cell">Team</th>
                  <th className="w-24 px-3 py-2.5 text-right">Open</th>
                  <th className="w-24 px-3 py-2.5 text-right">Overdue</th>
                  <th className="w-32 px-4 py-2.5 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="group h-[56px] cursor-pointer border-b border-line-hairline transition-colors duration-fast last:border-b-0 hover:bg-surface-subtle"
                  >
                    <td className="px-4">
                      <div className="flex min-w-0 flex-col">
                        <Link
                          to={`/projects/${project.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="truncate text-sm font-semibold text-ink group-hover:text-brand focus-visible:outline-none"
                        >
                          {project.name}
                        </Link>
                        <span className="truncate text-2xs tabular text-ink-muted">{project.code}</span>
                      </div>
                    </td>
                    <td className="px-3">
                      <StatusPill status={labelize(project.status)} />
                    </td>
                    <td className="hidden px-3 lg:table-cell">
                      <HealthPill health={labelize(project.health)} />
                    </td>
                    <td className="px-3">
                      <ProgressBar
                        size="xs"
                        tone="health"
                        health={labelize(project.health)}
                        value={project.progress}
                        label={`${Math.round(project.progress)}%`}
                        ariaLabel={`${project.name} progress`}
                      />
                    </td>
                    <td className="hidden truncate px-3 text-sm text-ink-secondary lg:table-cell">
                      {project.managerName ?? '—'}
                    </td>
                    <td className="hidden px-3 text-right text-sm tabular text-ink-secondary xl:table-cell">
                      {project.teamSize}
                    </td>
                    <td className="px-3 text-right text-sm tabular">
                      <Count value={project.openTasks} />
                    </td>
                    <td className="px-3 text-right text-sm tabular">
                      <Count value={project.overdueTasks} danger />
                    </td>
                    <td className="px-4 text-right text-sm tabular text-ink-secondary">
                      {formatDate(project.finishDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <ul className="mt-4 space-y-2.5 md:hidden">
            {filtered.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 shadow-xs transition-shadow duration-fast hover:shadow-sm focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{project.name}</p>
                      <span className="text-2xs tabular text-ink-muted">{project.code}</span>
                    </div>
                    <HealthPill health={labelize(project.health)} />
                  </div>
                  <div className="mt-3">
                    <ProgressBar
                      size="xs"
                      tone="health"
                      health={labelize(project.health)}
                      value={project.progress}
                      label={`${Math.round(project.progress)}%`}
                      ariaLabel={`${project.name} progress`}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <StatusPill status={labelize(project.status)} />
                    <span className="text-xs text-ink-muted">
                      {project.managerName ?? 'Unassigned'} · {project.teamSize} on team
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <NewProjectModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          load();
        }}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'default' | 'brand' | 'success' | 'danger';
}) {
  const valueTone =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'success'
        ? 'text-success'
        : tone === 'brand'
          ? 'text-brand'
          : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
      <p className="text-xs font-medium text-ink-secondary">{label}</p>
      <p className={`mt-2 text-2xl font-bold leading-none tabular ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1.5 text-2xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Count({ value, danger }: { value: number; danger?: boolean }) {
  if (value === 0) return <span className="text-ink-disabled">0</span>;
  return <span className={danger ? 'font-semibold text-danger' : 'text-ink-secondary'}>{value}</span>;
}

function TableSkeleton() {
  return (
    <div aria-busy="true" className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
      <p className="sr-only">Loading portfolio…</p>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex h-[56px] items-center gap-4 border-b border-line-hairline px-4 last:border-b-0"
        >
          <div className="skeleton h-3.5 w-48" />
          <div className="skeleton h-5 w-20" />
          <div className="skeleton hidden h-3.5 w-24 lg:block" />
          <div className="skeleton ml-auto h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-danger-soft">
        <AlertTriangle size={24} className="text-danger" />
      </span>
      <h2 className="mt-5 text-lg font-bold text-ink">We couldn't load your projects</h2>
      <p className="mt-2 text-sm text-ink-secondary">
        Something went wrong while fetching portfolio data. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white transition-colors duration-fast hover:bg-brand-hover focus-visible:outline-none focus-visible:shadow-focus"
      >
        <RefreshCw size={16} />
        Try again
      </button>
      <p className="mt-4 text-xs text-ink-muted">If the problem persists, contact your administrator.</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft">
        <FolderOpen size={24} className="text-brand" />
      </span>
      <h2 className="mt-5 text-lg font-bold text-ink">{title}</h2>
      <p className="mt-2 text-sm text-ink-secondary">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
