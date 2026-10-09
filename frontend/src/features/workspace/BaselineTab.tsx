import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { fullDate } from '../../lib/format';
import { EmptyState, ErrorBanner, TabToolbar, errorText, useAsync } from './common';
import {
  createBaseline,
  getVariance,
  listBaselines,
  type VarianceRow,
} from './api';

function defaultName(): string {
  return `Baseline ${new Date().toISOString().slice(0, 10)}`;
}

export default function BaselineTab({ projectId }: { projectId: number }) {
  const { notify } = useToast();
  const baselines = useAsync(() => listBaselines(projectId), [projectId]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);

  const variance = useAsync<VarianceRow[]>(
    () => (selectedId ? getVariance(selectedId) : Promise.resolve([])),
    [selectedId],
  );

  const list = baselines.data ?? [];
  const selected = list.find((baseline) => baseline.baseline_id === selectedId) ?? null;

  async function capture() {
    const label = name.trim() || defaultName();
    setBusy(true);
    try {
      const created = await createBaseline(projectId, label);
      notify('success', 'Baseline captured.');
      setName(defaultName());
      await baselines.reload(false);
      setSelectedId(created.baseline_id);
    } catch (err) {
      notify('error', errorText(err, 'Could not capture a baseline.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <TabToolbar>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          Name
          <input
            className="field w-56"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={defaultName()}
            aria-label="Baseline name"
          />
        </label>
        <button type="button" className="btn-primary h-8 gap-1" disabled={busy} onClick={() => void capture()}>
          {busy && <Loader2 size={15} className="animate-spin" />}
          Set Baseline
        </button>
      </TabToolbar>

      {baselines.error && <ErrorBanner message={baselines.error} onRetry={() => void baselines.reload(true)} />}

      {baselines.loading && !baselines.data ? (
        <ListSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          title="No baseline captured yet"
          description="Capture a snapshot to compare planned dates against the current schedule."
          action={
            <button type="button" className="btn-primary gap-1" disabled={busy} onClick={() => void capture()}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              Set Baseline
            </button>
          }
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_1fr]">
          <ul
            role="listbox"
            aria-label="Baselines"
            className="max-h-[40vh] overflow-auto border-b border-line lg:max-h-none lg:border-b-0 lg:border-r"
          >
            {list.map((baseline) => (
              <li key={baseline.baseline_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={baseline.baseline_id === selectedId}
                  onClick={() => setSelectedId(baseline.baseline_id)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus ${
                    baseline.baseline_id === selectedId ? 'bg-brand-soft' : 'hover:bg-surface-subtle'
                  }`}
                >
                  <span className={`text-sm font-semibold ${baseline.baseline_id === selectedId ? 'text-brand' : 'text-ink'}`}>
                    {baseline.name}
                  </span>
                  <span className="text-2xs text-ink-muted">
                    Captured {fullDate(baseline.captured_at)}
                    {baseline.captured_by_nip ? ` · ${baseline.captured_by_nip}` : ''}
                    {baseline.task_count != null ? ` · ${baseline.task_count} tasks` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-h-0 overflow-auto">
            {!selectedId ? (
              <EmptyState title="Select a baseline" description="Pick a snapshot on the left to see how the schedule has shifted." />
            ) : variance.loading && !variance.data ? (
              <VarianceSkeleton />
            ) : variance.error ? (
              <ErrorBanner message={variance.error} onRetry={() => void variance.reload(true)} />
            ) : (variance.data ?? []).length === 0 ? (
              <EmptyState title="No tasks in this baseline" description="This snapshot captured no tasks to compare." />
            ) : (
              <VarianceTable rows={variance.data ?? []} baselineName={selected?.name ?? 'Baseline'} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function delta(value: number | null): string {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${value}d`;
}

function VarianceCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-muted">—</span>;
  const tone = value > 0 ? 'text-[#B91C1C]' : value < 0 ? 'text-[#15803D]' : 'text-ink-secondary';
  return <span className={`tabular font-semibold ${tone}`}>{delta(value)}</span>;
}

function VarianceTable({ rows, baselineName }: { rows: VarianceRow[]; baselineName: string }) {
  const slipped = rows.filter((row) => row.slip).length;
  return (
    <div>
      <p className="border-b border-line bg-surface-subtle px-3 py-2 text-2xs text-ink-muted">
        Comparing current schedule against <span className="font-semibold text-ink-secondary">{baselineName}</span>
        {slipped > 0 && <span className="text-[#B91C1C]"> · {slipped} task{slipped === 1 ? '' : 's'} slipped</span>}
      </p>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-subtle text-2xs font-semibold text-ink-muted">
            <th scope="col" className="px-3 py-2 text-left">Task</th>
            <th scope="col" className="px-3 py-2 text-left">Baseline start</th>
            <th scope="col" className="px-3 py-2 text-left">Current start</th>
            <th scope="col" className="px-3 py-2 text-right">Δ Start</th>
            <th scope="col" className="px-3 py-2 text-left">Baseline finish</th>
            <th scope="col" className="px-3 py-2 text-left">Current finish</th>
            <th scope="col" className="px-3 py-2 text-right">Δ Finish</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.task_id}
              className={`border-b border-line-hairline ${row.slip ? 'bg-[#FEF2F2]' : 'hover:bg-surface-subtle'}`}
            >
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  {row.slip && (
                    <span className="inline-flex h-5 items-center rounded-xs border border-[#FECACA] bg-[#FEE2E2] px-1.5 text-2xs font-semibold text-[#B91C1C]">
                      Slip
                    </span>
                  )}
                  <span className="min-w-0 truncate text-ink" title={row.name ?? undefined}>
                    {row.name ?? `Task #${row.task_id}`}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-xs tabular text-ink-secondary">{fullDate(row.baseline_start)}</td>
              <td className="px-3 py-2 text-xs tabular text-ink-secondary">{fullDate(row.current_start)}</td>
              <td className="px-3 py-2 text-right text-xs">
                <VarianceCell value={row.start_variance_days} />
              </td>
              <td className="px-3 py-2 text-xs tabular text-ink-secondary">{fullDate(row.baseline_finish)}</td>
              <td className="px-3 py-2 text-xs tabular text-ink-secondary">{fullDate(row.current_finish)}</td>
              <td className="px-3 py-2 text-right text-xs">
                <VarianceCell value={row.finish_variance_days} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="p-3">
      <p className="sr-only">Loading baselines…</p>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

function VarianceSkeleton() {
  return (
    <div aria-busy="true" className="p-3">
      <p className="sr-only">Loading variance…</p>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
