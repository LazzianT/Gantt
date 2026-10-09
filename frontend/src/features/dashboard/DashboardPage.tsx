import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Flag, RefreshCw } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { decodeToken, getToken } from '../../lib/auth';
import { shortDate } from '../../lib/format';
import StatusPill from '../../components/StatusPill';
import HealthPill from '../../components/HealthPill';
import ProgressBar from '../../components/ProgressBar';
import {
  CriticalFlag,
  EmptyHint,
  RelativeTime,
  SectionCard,
  StatCard,
  labelize,
} from './components';
import { getDashboard, type DashboardData } from './api';

const STATUS_ORDER = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;

const dateHeading = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const tokenName = decodeToken(getToken() ?? '')?.name ?? '';
  const firstName = (data?.user?.name || tokenName).trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Good {partOfDay}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {dateHeading.format(new Date())} · Here's what's happening across your projects.
        </p>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <DashboardSkeleton />
      ) : data ? (
        <DashboardBody data={data} />
      ) : null}
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const summary = data.summary;
  const statusCounts = STATUS_ORDER.map((key) => ({
    key,
    label: labelize(key),
    count: summary.by_status?.[key] ?? 0,
  }));
  const shownStatuses = statusCounts.filter((status) => status.count > 0);

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Projects" value={summary.projects_total} to="/portfolio">
          {shownStatuses.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line-hairline pt-3">
              {shownStatuses.map((status) => (
                <span key={status.key} className="text-2xs text-ink-muted">
                  <span className="font-semibold tabular text-ink">{status.count}</span> {status.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 border-t border-line-hairline pt-3 text-2xs text-ink-muted">No projects yet</p>
          )}
        </StatCard>
        <StatCard label="Open tasks" value={summary.tasks_open} hint={`${summary.tasks_total} total`} to="/portfolio" />
        <StatCard
          label="Overdue"
          value={summary.tasks_overdue}
          hint={summary.tasks_overdue > 0 ? 'Needs attention' : 'Nothing overdue'}
          tone={summary.tasks_overdue > 0 ? 'danger' : 'default'}
          to="/portfolio"
        />
        <StatCard label="Due soon" value={summary.tasks_due_soon} to="/portfolio" />
        <StatCard label="Upcoming milestones" value={summary.milestones_upcoming} to="/portfolio" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Recent task updates"
          className="h-full"
          bodyClassName="max-h-[560px] overflow-y-auto"
        >
          {data.recent_updates.length === 0 ? (
            <EmptyHint>No recent updates yet.</EmptyHint>
          ) : (
            <ul className="divide-y divide-line-hairline">
              {data.recent_updates.map((update) => (
                <li key={update.id}>
                  <Link
                    to={`/projects/${update.project_id}`}
                    className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-surface-subtle focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                      <Activity size={14} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        <span className="font-semibold">
                          {labelize(update.entity_type)} {update.action.replace(/_/g, ' ')}
                        </span>
                      </p>
                      <p className="truncate text-xs text-ink-secondary">{update.project_name}</p>
                      {update.detail && (
                        <p className="truncate text-2xs text-ink-muted">{update.detail}</p>
                      )}
                    </div>
                    <RelativeTime iso={update.created_at} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="flex flex-col gap-4">
          <SectionCard title="My tasks">
            {data.my_tasks.length === 0 ? (
              <EmptyHint>No tasks assigned to you.</EmptyHint>
            ) : (
              <ul className="space-y-2">
                {data.my_tasks.map((task) => (
                  <li key={task.task_id}>
                    <Link
                      to={`/projects/${task.project_id}`}
                      className="block rounded-lg border border-line p-2.5 transition-[transform,box-shadow] duration-fast ease-out hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium text-ink">{task.name}</p>
                        {task.is_critical && <CriticalFlag />}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <StatusPill status={labelize(task.status)} />
                        <span className="min-w-0 truncate text-xs text-ink-muted">{task.project_name}</span>
                        <span className="ml-auto shrink-0 text-xs tabular text-ink-secondary">
                          {shortDate(task.finish_date)}
                        </span>
                      </div>
                      <ProgressBar
                        className="mt-2"
                        size="xs"
                        value={task.progress_percent}
                        ariaLabel={`${task.name} progress`}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Upcoming milestones">
            {data.upcoming_milestones.length === 0 ? (
              <EmptyHint>No upcoming milestones.</EmptyHint>
            ) : (
              <ul className="divide-y divide-line-hairline">
                {data.upcoming_milestones.map((milestone) => (
                  <li key={milestone.milestone_id}>
                    <Link
                      to={`/projects/${milestone.project_id}`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-surface-subtle focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                        <Flag size={14} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{milestone.name}</p>
                        <p className="truncate text-xs text-ink-muted">{milestone.project_name}</p>
                      </div>
                      <span className="shrink-0 text-xs tabular text-ink-secondary">
                        {shortDate(milestone.due_date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Project summary</h2>
          <Link
            to="/portfolio"
            className="rounded-md text-sm font-semibold text-brand transition-colors duration-fast hover:text-brand-hover hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          >
            See all
          </Link>
        </div>
        {data.projects.length === 0 ? (
          <EmptyHint>No projects yet.</EmptyHint>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.projects.map((project) => (
              <li key={project.project_id}>
                <Link
                  to={`/projects/${project.project_id}`}
                  className="block rounded-xl border border-line bg-surface p-4 shadow-xs transition-[transform,box-shadow] duration-fast ease-out hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                      {project.code}
                    </span>
                    <HealthPill health={labelize(project.health)} />
                  </div>
                  <p className="mt-1 truncate text-[15px] font-semibold text-ink">{project.name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusPill status={labelize(project.status)} />
                    <span className="text-xs tabular text-ink-muted">
                      Due {shortDate(project.target_end_date)}
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-3"
                    tone="health"
                    health={labelize(project.health)}
                    value={project.weighted_progress}
                    label={`${Math.round(project.weighted_progress)}%`}
                    ariaLabel={`${project.name} progress`}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-danger-soft">
        <AlertTriangle size={24} className="text-danger" />
      </span>
      <h2 className="mt-5 text-lg font-bold text-ink">We couldn't load your dashboard</h2>
      <p className="mt-2 text-sm text-ink-secondary">{message}</p>
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

function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Loading dashboard…</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-line bg-surface p-4">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-3 h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="skeleton h-4 w-40" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton mt-3 h-10 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="skeleton h-4 w-28" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton mt-3 h-12 w-full" />
            ))}
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="skeleton h-4 w-40" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton mt-3 h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
