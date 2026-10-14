import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { getRole } from '../../lib/auth';
import HealthPill from '../../components/HealthPill';
import ProgressBar from '../../components/ProgressBar';
import Skeleton from '../../components/Skeleton';
import StatusPill from '../../components/StatusPill';
import { ConfirmProvider } from '../../components/ConfirmDialog';
import { ToastProvider } from '../../components/Toast';
import TaskGrid from '../tasks/TaskGrid';
import GanttView from '../gantt/GanttView';
import OverviewTab from './OverviewTab';
import ResourcesTab from './ResourcesTab';
import TeamTab from './TeamTab';
import MilestonesTab from './MilestonesTab';
import BaselineTab from './BaselineTab';
import FinishReviewPanel from './FinishReviewPanel';
import ReportsTab from './ReportsTab';

interface ProjectDetail {
  id: number;
  code: string;
  name: string;
  description: string | null;
  managerName: string | null;
  status: string;
  health: string;
  startDate: string | null;
  targetEndDate: string | null;
  progress: number;
  taskCount: number;
  doneCount: number;
  scheduleVersion: number;
}

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'gantt', label: 'Gantt' },
  { key: 'resources', label: 'Resources' },
  { key: 'team', label: 'Team' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'baseline', label: 'Baseline' },
  { key: 'reports', label: 'Reports' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const PLACEHOLDERS: Record<string, { title: string; note: string }> = {
  reports: { title: 'Reports', note: 'Derived project reports will appear here.' },
};

export default function WorkspacePage() {
  const { id } = useParams();
  const projectId = Number(id);
  const validId = Number.isInteger(projectId) && projectId > 0;

  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: TabKey = (TABS.some((t) => t.key === rawTab) ? rawTab : 'overview') as TabKey;
  // Server enforces this too; the client copy only avoids rendering a panel that would 403.
  const canReviewFinishDates = getRole() === 'admin' || getRole() === 'manager';

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addToken, setAddToken] = useState(0);
  // Bumped after a manager decides an actual finish date so the task grid re-reads the tree.
  const [reviewToken, setReviewToken] = useState(0);
  const [baseline, setBaseline] = useState<{ busy: boolean; message: string | null }>({
    busy: false,
    message: null,
  });

  const load = useCallback(() => {
    if (!validId) {
      setError('That project id is not valid.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api<ProjectDetail>(`/projects/${projectId}`)
      .then(setProject)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this project.'))
      .finally(() => setLoading(false));
  }, [projectId, validId]);

  useEffect(load, [load]);

  function selectTab(key: TabKey) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', key);
        return next;
      },
      { replace: true },
    );
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, key: TabKey) {
    const index = TABS.findIndex((t) => t.key === key);
    let next = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = TABS[next].key;
    selectTab(target);
    requestAnimationFrame(() => document.getElementById(`tab-${target}`)?.focus());
  }

  async function captureBaseline() {
    setBaseline({ busy: true, message: null });
    try {
      const name = `Baseline ${new Date().toISOString().slice(0, 10)}`;
      await api(`/projects/${projectId}/baselines`, { method: 'POST', body: { name } });
      setBaseline({ busy: false, message: 'Baseline captured.' });
    } catch (err) {
      setBaseline({
        busy: false,
        message: err instanceof ApiError ? err.message : 'Could not capture a baseline.',
      });
    }
  }

  function requestAddTask() {
    selectTab('tasks');
    setAddToken((token) => token + 1);
  }

  if (loading && !project) return <WorkspaceSkeleton />;

  if (!project) {
    return (
      <div className="px-6 py-5">
        <div
          role="alert"
          className="flex items-center gap-3 rounded-sm border border-[#FECACA] bg-[#FEE2E2] px-3 py-2 text-sm text-[#B91C1C]"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error ?? 'Could not load this project.'}</span>
          <button type="button" onClick={load} className="btn-secondary h-7 border-[#FECACA] bg-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-surface px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-ink">{project.name}</h1>
              <StatusPill status={project.status} />
              <HealthPill health={project.health} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
              <span>{project.code}</span>
              {project.managerName && <span className="normal-case tracking-normal">· {project.managerName}</span>}
              <span className="normal-case tracking-normal">
                · {project.doneCount}/{project.taskCount} tasks
              </span>
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-secondary h-8 gap-1" disabled={baseline.busy} onClick={captureBaseline}>
              {baseline.busy && <Loader2 size={15} className="animate-spin" />}
              Set Baseline
            </button>
            <button type="button" className="btn-primary h-8 gap-1" onClick={requestAddTask}>
              <Plus size={15} />
              Add Task
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
            Weighted progress
          </span>
          <ProgressBar
            value={project.progress}
            label={`${Math.round(project.progress)}%`}
            className="w-full max-w-md"
            ariaLabel="Weighted project progress"
          />
        </div>

        {baseline.message && (
          <p role="status" className="mt-2 text-xs text-ink-secondary">
            {baseline.message}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          role="tablist"
          aria-label="Project views"
          aria-orientation="vertical"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-2 md:w-44 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:py-3"
        >
          {TABS.map((item) => {
            const selected = item.key === tab;
            return (
              <button
                key={item.key}
                id={`tab-${item.key}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`panel-${item.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(item.key)}
                onKeyDown={(event) => onTabKey(event, item.key)}
                className={`h-8 shrink-0 whitespace-nowrap rounded-sm px-2 text-sm font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus ${
                  selected
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink-muted hover:bg-surface-subtle hover:text-ink-secondary'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <section
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="min-h-0 min-w-0 flex-1"
        >
          <ToastProvider>
            <ConfirmProvider>
              {tab === 'overview' && <OverviewTab projectId={projectId} />}
              {tab === 'tasks' && (
                <div className="space-y-4">
                  {canReviewFinishDates && (
                    <FinishReviewPanel projectId={projectId} onReviewed={() => setReviewToken((n) => n + 1)} />
                  )}
                  <TaskGrid
                    key={`tasks-${reviewToken}`}
                    projectId={projectId}
                    addToken={addToken}
                    onAddConsumed={() => setAddToken(0)}
                  />
                </div>
              )}
              {tab === 'gantt' && <GanttView projectId={projectId} />}
              {tab === 'resources' && <ResourcesTab projectId={projectId} />}
              {tab === 'team' && <TeamTab projectId={projectId} />}
              {tab === 'milestones' && <MilestonesTab projectId={projectId} />}
              {tab === 'baseline' && <BaselineTab projectId={projectId} />}
              {tab === 'reports' && <ReportsTab projectId={projectId} />}
              {PLACEHOLDERS[tab] && tab !== 'reports' && (
                <PlaceholderPanel title={PLACEHOLDERS[active.key].title} note={PLACEHOLDERS[active.key].note} />
              )}
            </ConfirmProvider>
          </ToastProvider>
        </section>
      </div>
    </div>
  );
}

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-md font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-xs text-ink-muted">{note}</p>
        <p className="mt-3 inline-flex items-center rounded-xs border border-line bg-surface-subtle px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          Coming soon
        </p>
      </div>
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" className="flex min-h-full flex-col">
      <p className="sr-only">Loading project…</p>
      <div className="border-b border-line bg-surface px-6 py-4">
        <Skeleton className="h-6 w-64" />
        <div className="mt-3 flex items-center gap-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-1.5 w-64" />
        </div>
      </div>
      <div className="flex flex-col md:flex-row">
        <div className="space-y-1 border-b border-line bg-surface p-2 md:w-44 md:border-b-0 md:border-r">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
        <div className="flex-1 space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
