import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import StatusPill from '../../components/StatusPill';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { fullDate, shortDate } from '../../lib/format';
import { EmptyState, ErrorBanner, TabToolbar, errorText, useAsync } from './common';
import {
  createMilestone,
  deleteMilestone,
  listMilestones,
  type CreateMilestoneInput,
  type Milestone,
  type MilestoneStatus,
} from './api';

const STATUSES: MilestoneStatus[] = ['Not Started', 'In Progress', 'Completed', 'Missed'];

function dayValue(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export default function MilestonesTab({ projectId }: { projectId: number }) {
  const { notify } = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload, setData } = useAsync(() => listMilestones(projectId), [projectId]);
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const milestones = data ?? [];
  const dated = useMemo(
    () =>
      milestones
        .filter((milestone): milestone is Milestone & { due_date: string } => Boolean(milestone.due_date))
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [milestones],
  );

  async function remove(milestone: Milestone) {
    const ok = await confirm({
      title: `Delete "${milestone.name}"?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setPendingId(milestone.milestone_id);
    try {
      await deleteMilestone(milestone.milestone_id);
      setData((prev) => (prev ? prev.filter((item) => item.milestone_id !== milestone.milestone_id) : prev));
      notify('success', `Deleted ${milestone.name}.`);
    } catch (err) {
      notify('error', errorText(err, 'Could not delete the milestone.'));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <TabToolbar>
        <p className="text-sm font-semibold text-ink">Milestones</p>
        <button type="button" className="btn-primary ml-auto h-8 gap-1" onClick={() => setAdding((value) => !value)}>
          <Plus size={15} />
          Add milestone
        </button>
      </TabToolbar>

      <div className="min-h-0 flex-1 overflow-auto">
        {error && <ErrorBanner message={error} onRetry={() => void reload(true)} />}

        {adding && (
          <MilestoneForm
            projectId={projectId}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              void reload(false);
            }}
          />
        )}

        {loading && !data ? (
          <ListSkeleton />
        ) : milestones.length === 0 ? (
          <EmptyState
            title="No milestones yet"
            description="Add key dates to track them on the schedule."
            action={
              <button type="button" className="btn-primary gap-1" onClick={() => setAdding(true)}>
                <Plus size={15} />
                Add milestone
              </button>
            }
          />
        ) : (
          <>
            {dated.length > 0 && <TimelineStrip milestones={dated} />}
            <ul className="divide-y divide-line-hairline">
              {milestones.map((milestone) => (
                <li key={milestone.milestone_id} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-subtle">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rotate-45 border"
                    style={{
                      borderColor: '#D4A843',
                      backgroundColor: milestone.status === 'Completed' ? '#D4A843' : 'transparent',
                    }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={milestone.name}>
                    {milestone.name}
                  </span>
                  <span className="shrink-0 text-xs tabular text-ink-muted">{fullDate(milestone.due_date)}</span>
                  <StatusPill status={milestone.status} />
                  <button
                    type="button"
                    aria-label={`Delete ${milestone.name}`}
                    disabled={pendingId === milestone.milestone_id}
                    onClick={() => void remove(milestone)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-[#FEE2E2] hover:text-[#B91C1C] focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50"
                  >
                    {pendingId === milestone.milestone_id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function TimelineStrip({ milestones }: { milestones: (Milestone & { due_date: string })[] }) {
  const first = dayValue(milestones[0].due_date);
  const last = dayValue(milestones[milestones.length - 1].due_date);
  const span = Math.max(1, last - first);

  return (
    <div className="border-b border-line bg-surface px-6 py-4">
      <div className="relative h-10">
        <div className="absolute left-0 right-0 top-1.5 h-px bg-line-strong" aria-hidden />
        {milestones.map((milestone) => {
          const ratio = (dayValue(milestone.due_date) - first) / span;
          const left = milestones.length === 1 ? 50 : ratio * 100;
          return (
            <div
              key={milestone.milestone_id}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${left}%` }}
              title={`${milestone.name} · ${fullDate(milestone.due_date)} · ${milestone.status}`}
            >
              <span
                className="mx-auto block h-3 w-3 rotate-45 border-2 border-gold bg-surface"
                style={{ backgroundColor: milestone.status === 'Completed' ? '#D4A843' : undefined }}
                aria-hidden
              />
              <span className="mt-1 block max-w-[120px] truncate text-center text-2xs font-semibold text-ink-secondary">
                {milestone.name}
              </span>
              <span className="block text-center text-2xs tabular text-ink-muted">{shortDate(milestone.due_date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneForm({
  projectId,
  onCancel,
  onSaved,
}: {
  projectId: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<MilestoneStatus>('Not Started');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      notify('error', 'A milestone name is required.');
      return;
    }
    setBusy(true);
    const body: CreateMilestoneInput = {
      name: trimmed,
      due_date: dueDate || null,
      status,
    };
    try {
      await createMilestone(projectId, body);
      notify('success', `Added ${trimmed}.`);
      onSaved();
    } catch (err) {
      notify('error', errorText(err, 'Could not add the milestone.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-wrap items-end gap-3 border-b border-line bg-surface-subtle px-3 py-3"
    >
      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        Name
        <input
          className="field w-64"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Design freeze"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        Due date
        <input type="date" className="field w-40" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        Status
        <select
          className="field w-40"
          value={status}
          onChange={(event) => setStatus(event.target.value as MilestoneStatus)}
        >
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-primary h-8 gap-1" disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" />}
          Add
        </button>
        <button type="button" className="btn-secondary h-8 gap-1" onClick={onCancel}>
          <X size={15} />
          Cancel
        </button>
      </div>
    </form>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="p-3">
      <p className="sr-only">Loading milestones…</p>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
