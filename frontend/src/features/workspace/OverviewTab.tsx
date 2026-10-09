import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fullDate, relativeTime, shortDate } from '../../lib/format';
import Skeleton from '../../components/Skeleton';
import StatusPill from '../../components/StatusPill';

interface DashboardMilestone {
  milestone_id: number;
  task_id: number | null;
  name: string;
  due_date: string | null;
  status: string;
}

interface DashboardTask {
  task_id: number;
  code: string | null;
  name: string;
  finish_date: string | null;
  status: string;
  progress_percent: number;
  is_critical: boolean;
}

interface DashboardActivity {
  log_id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  actor_nip: string | null;
  detail: string | null;
  created_at: string;
}

interface ProjectDashboard {
  health: string;
  weighted_progress: number;
  schedule: {
    baseline_finish: string | null;
    current_finish: string | null;
    variance_days: number | null;
    on_track: boolean;
  };
  upcoming_milestones: DashboardMilestone[];
  overdue_tasks: DashboardTask[];
  critical_tasks: DashboardTask[];
  workload_summary: { under: number; balanced: number; over: number };
  recent_activity: DashboardActivity[];
}

export default function OverviewTab({ projectId }: { projectId: number }) {
  const [data, setData] = useState<ProjectDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api<ProjectDashboard>(`/projects/${projectId}/dashboard`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the dashboard.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [projectId]);

  if (loading && !data) return <OverviewSkeleton />;

  if (!data) {
    return (
      <div className="px-6 py-5">
        <div
          role="alert"
          className="flex items-center gap-3 rounded-sm border border-[#FECACA] bg-[#FEE2E2] px-3 py-2 text-sm text-[#B91C1C]"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error ?? 'Could not load the dashboard.'}</span>
          <button type="button" onClick={load} className="btn-secondary h-7 border-[#FECACA] bg-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const variance = data.schedule.variance_days;
  const varianceText = variance == null ? 'No baseline' : variance === 0 ? 'On time' : `${variance > 0 ? '+' : ''}${variance}d`;
  const varianceTone = variance == null ? 'muted' : variance > 0 ? 'danger' : variance < 0 ? 'good' : 'muted';

  return (
    <div className="space-y-4 px-6 py-5">
      <dl className="grid grid-cols-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface md:grid-cols-4 md:divide-x md:divide-y-0">
        <Kpi label="Weighted progress" value={`${Math.round(data.weighted_progress)}%`} />
        <Kpi
          label="Schedule variance"
          value={varianceText}
          tone={varianceTone}
          hint={data.schedule.current_finish ? `Finish ${fullDate(data.schedule.current_finish)}` : undefined}
        />
        <Kpi
          label="Critical tasks"
          value={String(data.critical_tasks.length)}
          tone={data.critical_tasks.length ? 'danger' : undefined}
          hint="On the critical path"
        />
        <Kpi
          label="Overdue"
          value={String(data.overdue_tasks.length)}
          tone={data.overdue_tasks.length ? 'danger' : undefined}
          hint="Past planned finish"
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Upcoming milestones" count={data.upcoming_milestones.length}>
          {data.upcoming_milestones.length === 0 ? (
            <Empty>No upcoming milestones. Add one from the Milestones tab.</Empty>
          ) : (
            <ul className="divide-y divide-line-hairline">
              {data.upcoming_milestones.map((milestone) => {
                const done = milestone.status === 'Completed';
                return (
                  <li key={milestone.milestone_id} className="flex items-center gap-2 py-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rotate-45 border"
                      style={{
                        borderColor: '#D4A843',
                        backgroundColor: done ? '#D4A843' : 'transparent',
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">{milestone.name}</span>
                    <span className="shrink-0 text-xs tabular text-ink-muted">{fullDate(milestone.due_date)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Overdue tasks" count={data.overdue_tasks.length}>
          {data.overdue_tasks.length === 0 ? (
            <Empty>Nothing overdue.</Empty>
          ) : (
            <ul className="divide-y divide-line-hairline">
              {data.overdue_tasks.map((task) => (
                <li key={task.task_id} className="flex items-center gap-2 py-1.5">
                  {task.is_critical && (
                    <AlertTriangle size={12} className="shrink-0 text-[#DC2626]" aria-label="On the critical path" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{task.name}</span>
                  <span className="shrink-0 text-xs tabular text-[#B91C1C]">{shortDate(task.finish_date)}</span>
                  <StatusPill status={task.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Workload this project">
          <ul className="space-y-2">
            <WorkloadRow label="Underallocated" value={data.workload_summary.under} dot="#8B94A7" />
            <WorkloadRow label="Balanced" value={data.workload_summary.balanced} dot="#16A34A" />
            <WorkloadRow label="Overallocated" value={data.workload_summary.over} dot="#D97706" />
          </ul>
          <p className="mt-3 text-2xs text-ink-muted">
            Classified per resource from assigned task allocation. Under &lt; 80%, over &gt; 100%.
          </p>
        </Panel>

        <Panel title="Recent activity" count={data.recent_activity.length}>
          {data.recent_activity.length === 0 ? (
            <Empty>No activity recorded yet.</Empty>
          ) : (
            <ul className="divide-y divide-line-hairline">
              {data.recent_activity.map((entry) => (
                <li key={entry.log_id} className="flex items-baseline gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">
                    {entry.action}{' '}
                    <span className="text-ink-muted">
                      {entry.entity_type}
                      {entry.entity_id ? ` #${entry.entity_id}` : ''}
                    </span>
                    {entry.actor_nip && <span className="text-ink-muted"> · {entry.actor_nip}</span>}
                  </span>
                  <time className="shrink-0 text-2xs tabular text-ink-muted" dateTime={entry.created_at}>
                    {relativeTime(entry.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

type KpiTone = 'good' | 'danger' | 'muted' | undefined;

const KPI_TONE: Record<Exclude<KpiTone, undefined>, string> = {
  good: 'text-[#15803D]',
  danger: 'text-[#B91C1C]',
  muted: 'text-ink-muted',
};

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: KpiTone; hint?: string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 text-lg font-bold tabular ${tone ? KPI_TONE[tone] : 'text-ink'}`}>{value}</dd>
      {hint && <p className="mt-0.5 text-2xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <header className="flex h-9 items-center gap-2 border-b border-line px-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {count != null && <span className="text-2xs font-semibold tabular text-ink-muted">{count}</span>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function WorkloadRow({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
      <span className="flex-1 text-ink-secondary">{label}</span>
      <span className="tabular font-semibold text-ink">{value}</span>
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-xs text-ink-muted">{children}</p>;
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4 px-6 py-5">
      <p className="sr-only">Loading dashboard…</p>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-surface px-3 py-2.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-2 h-4 w-12" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-md border border-line bg-surface">
            <div className="flex h-9 items-center border-b border-line px-3">
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((__, row) => (
                <Skeleton key={row} className="h-3 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
