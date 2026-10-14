import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, Clock, RefreshCw } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { fullDate } from '../../lib/format';
import ProgressBar from '../../components/ProgressBar';
import StatusPill from '../../components/StatusPill';
import { CriticalFlag, EmptyHint, SectionCard, labelize } from '../dashboard/components';
import { getMyTasks, type ActualFinishStatus, type MyTask, type MyTasksData } from '../dashboard/api';
import CompleteTaskModal from './CompleteTaskModal';
import TaskEvidenceModal from './TaskEvidenceModal';

type Filter = 'all' | 'open' | 'overdue' | 'critical';

/** Local calendar day; overdue is a business-date comparison, so UTC would misclassify near midnight. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const FINISH_REVIEW_LABEL: Record<ActualFinishStatus, string> = {
  Pending: 'Awaiting manager',
  Approved: 'Date approved',
  Rejected: 'Date rejected',
};

const FINISH_REVIEW_TONE: Record<ActualFinishStatus, string> = {
  Pending: 'text-[#B45309]',
  Approved: 'text-ink-muted',
  Rejected: 'text-danger',
};

export default function MyTasksPage() {
  const [data, setData] = useState<MyTasksData | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmTask, setConfirmTask] = useState<MyTask | null>(null);
  const [evidenceTask, setEvidenceTask] = useState<MyTask | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getMyTasks()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your tasks.'))
      .finally(() => setLoading(false));
  }

  /** Re-reads from the server without flashing the skeleton over rows that are already on screen. */
  function refresh() {
    return getMyTasks()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not refresh your tasks.'));
  }

  useEffect(load, []);

  const tasks = useMemo(() => {
    if (!data) return [];
    const today = todayIso();
    return data.tasks.filter((task) => {
      if (filter === 'open') return task.status !== 'Completed';
      if (filter === 'overdue') return task.status !== 'Completed' && task.finish_date != null && task.finish_date < today;
      if (filter === 'critical') return task.is_critical;
      return true;
    });
  }, [data, filter]);

  /** Patch locally so the row reacts immediately, then re-read so the server stays authoritative. */
  function applyCompletion(taskId: number, completed: boolean, actualFinish: string | null) {
    setConfirmTask(null);
    setData((prev) =>
      prev
        ? {
            ...prev,
            summary: summarize(prev.tasks.map((row) =>
              row.task_id === taskId
                ? {
                    ...row,
                    status: completed ? 'Completed' : 'In Progress',
                    progress_percent: completed ? 100 : 0,
                    actual_finish: completed ? actualFinish : null,
                    actual_finish_status: completed ? 'Pending' : null,
                  }
                : row,
            )),
          }
        : prev,
    );
    void refresh();
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
      <header>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <CheckSquare size={20} aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">My Tasks</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Tasks where you are the PIC. Tick one off, state when you finished it, and attach evidence.
            </p>
          </div>
        </div>
      </header>

      {error && data && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {loading ? (
        <div aria-busy="true" className="mt-6 space-y-3">
          <div className="skeleton h-20 w-full rounded-xl" />
          <div className="skeleton h-16 w-full rounded-xl" />
          <div className="skeleton h-16 w-full rounded-xl" />
        </div>
      ) : !data ? (
        <div role="alert" className="mx-auto max-w-md py-16 text-center">
          <AlertTriangle className="mx-auto text-danger" size={24} />
          <p className="mt-3 text-sm text-ink-secondary">{error ?? 'Could not load your tasks.'}</p>
          <button type="button" onClick={load} className="btn-primary mx-auto mt-4">
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Total" value={data.summary.total} />
            <Metric label="Open" value={data.summary.open} />
            <Metric label="Overdue" value={data.summary.overdue} tone={data.summary.overdue > 0 ? 'danger' : undefined} />
            <Metric label="Critical" value={data.summary.critical} tone={data.summary.critical > 0 ? 'danger' : undefined} />
          </div>

          <SectionCard
            className="mt-6"
            title="Assigned tasks"
            action={
              <div className="flex gap-1" role="tablist" aria-label="Task filters">
                {(['all', 'open', 'overdue', 'critical'] as Filter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={filter === value}
                    onClick={() => setFilter(value)}
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${filter === value ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'}`}
                  >
                    {labelize(value)}
                  </button>
                ))}
              </div>
            }
          >
            {tasks.length === 0 ? (
              <EmptyHint>{filter === 'all' ? 'No tasks assigned to you.' : 'No tasks match this filter.'}</EmptyHint>
            ) : (
              <div className="divide-y divide-line-hairline">
                {tasks.map((task) => (
                  <TaskRow key={task.task_id} task={task} onConfirm={() => setConfirmTask(task)} />
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      <CompleteTaskModal task={confirmTask} onClose={() => setConfirmTask(null)} onDone={applyCompletion} />

      <TaskEvidenceModal
        open={evidenceTask != null}
        taskId={evidenceTask?.task_id ?? null}
        taskName={evidenceTask?.name ?? ''}
        onClose={() => setEvidenceTask(null)}
      />
    </div>
  );
}

function isDone(task: MyTask): boolean {
  return task.status === 'Completed';
}

function summarize(tasks: MyTask[]): MyTasksData['summary'] {
  const today = todayIso();
  return {
    total: tasks.length,
    open: tasks.filter((t) => t.status !== 'Completed').length,
    overdue: tasks.filter((t) => t.status !== 'Completed' && t.finish_date != null && t.finish_date < today).length,
    critical: tasks.filter((t) => t.is_critical).length,
  };
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <p className={`mt-2 text-2xl font-bold tabular ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

interface TaskRowProps {
  task: MyTask;
  onConfirm: () => void;
}

function TaskRow({ task, onConfirm }: TaskRowProps) {
  const done = isDone(task);
  const review = task.actual_finish_status;
  return (
    <div className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-surface-subtle">
      <label className="flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={done}
          onChange={onConfirm}
          aria-label={done ? `Reopen ${task.name}` : `Mark ${task.name} as done`}
          className="h-4 w-4 cursor-pointer rounded border-line accent-brand"
        />
      </label>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm font-semibold ${done ? 'text-ink-secondary line-through' : 'text-ink'}`}>
            {task.name}
          </span>
          {task.is_critical && <CriticalFlag />}
        </div>
        <p className="mt-1 truncate text-xs text-ink-muted">{task.project_name}</p>
        {done && task.actual_finish && (
          <p className={`mt-0.5 text-xs ${FINISH_REVIEW_TONE[review ?? 'Pending']}`}>
            Finished {fullDate(task.actual_finish)}
            {review && ` · ${FINISH_REVIEW_LABEL[review]}`}
          </p>
        )}
      </div>

      <div className="hidden w-40 shrink-0 sm:block">
        <ProgressBar
          value={task.progress_percent}
          label={`${Math.round(task.progress_percent)}%`}
          size="xs"
          ariaLabel={`${task.name} progress`}
        />
      </div>

      <StatusPill status={labelize(task.status)} />

      {review === 'Pending' && (
        <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-[#B45309] md:flex">
          <Clock size={13} /> Awaiting manager
        </span>
      )}

      <time
        className="w-24 shrink-0 text-right text-xs tabular text-ink-secondary"
        dateTime={task.finish_date ?? undefined}
      >
        {fullDate(task.finish_date)}
      </time>
    </div>
  );
}