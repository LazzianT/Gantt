import { useMemo, useState } from 'react';
import Skeleton from '../../components/Skeleton';
import { fullDate } from '../../lib/format';
import { EmptyState, ErrorBanner, TabToolbar, useAsync } from './common';
import {
  getWorkload,
  listResources,
  type Classification,
  type WorkloadDayRow,
  type WorkloadResult,
} from './api';

const CLASSIFICATION: Record<Classification, { bg: string; fg: string; label: string }> = {
  Underallocated: { bg: '#FEF3C7', fg: '#B45309', label: 'Under' },
  Balanced: { bg: '#DCFCE7', fg: '#15803D', label: 'Balanced' },
  Overallocated: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Over' },
};

const EMPTY: WorkloadResult = { from: '', to: '', rows: [], summary: [] };

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentMonth(): [string, string] {
  const now = new Date();
  return [isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(iso: string): { dow: string; day: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return { dow: DOW[date.getDay()], day: String(d) };
}

export default function WorkloadView({ projectId }: { projectId: number }) {
  const [from, setFrom] = useState(() => currentMonth()[0]);
  const [to, setTo] = useState(() => currentMonth()[1]);

  const workload = useAsync<WorkloadResult>(() => {
    if (!from || !to) return Promise.resolve(EMPTY);
    return getWorkload(projectId, from, to);
  }, [projectId, from, to]);
  const resources = useAsync(() => listResources(projectId), [projectId]);

  const data = workload.data;

  const columns = useMemo(() => {
    const dates = new Set<string>();
    for (const row of data?.rows ?? []) dates.add(row.date);
    return [...dates].sort();
  }, [data]);

  const grid = useMemo(() => {
    const map = new Map<string, Map<string, WorkloadDayRow>>();
    for (const row of data?.rows ?? []) {
      let days = map.get(row.employee_nip);
      if (!days) {
        days = new Map();
        map.set(row.employee_nip, days);
      }
      days.set(row.date, row);
    }
    return map;
  }, [data]);

  const nameByNip = useMemo(() => {
    const map = new Map<string, string>();
    for (const resource of resources.data ?? []) {
      if (resource.employeeNip) map.set(resource.employeeNip, resource.employeeName ?? resource.name);
    }
    return map;
  }, [resources.data]);

  const employees = useMemo(() => {
    const summary = data?.summary ?? [];
    return [...summary].sort((a, b) => {
      const an = nameByNip.get(a.employee_nip) ?? a.employee_nip;
      const bn = nameByNip.get(b.employee_nip) ?? b.employee_nip;
      return an.localeCompare(bn);
    });
  }, [data, nameByNip]);

  const error = workload.error ?? resources.error;

  return (
    <div className="flex min-h-0 flex-col">
      <TabToolbar>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          From
          <input
            type="date"
            className="field w-36"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          To
          <input
            type="date"
            className="field w-36"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-secondary h-8"
          onClick={() => {
            const [first, last] = currentMonth();
            setFrom(first);
            setTo(last);
          }}
        >
          This month
        </button>
        <ul className="ml-auto hidden items-center gap-3 text-2xs text-ink-muted sm:flex" aria-label="Workload legend">
          {(Object.keys(CLASSIFICATION) as Classification[]).map((key) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs border border-line-hairline" style={{ backgroundColor: CLASSIFICATION[key].bg }} aria-hidden />
              {CLASSIFICATION[key].label}
            </li>
          ))}
        </ul>
      </TabToolbar>

      {error && <ErrorBanner message={error} onRetry={() => void workload.reload(true)} />}

      {workload.loading && !data ? (
        <WorkloadSkeleton />
      ) : employees.length === 0 ? (
        <EmptyState
          title="No workload in this range"
          description="Assign resources to tasks, or widen the date range, to see demand against capacity."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-max border-collapse text-xs">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-rowFrozen border-b border-r border-line bg-surface-subtle px-3 py-1.5 text-left font-semibold text-ink-muted"
                >
                  Employee
                </th>
                {columns.map((date) => {
                  const { dow, day } = dayLabel(date);
                  return (
                    <th
                      key={date}
                      scope="col"
                      className="sticky top-0 z-stickyHead w-11 border-b border-r border-line-hairline bg-surface-subtle py-1 text-center font-medium leading-tight text-ink-muted"
                    >
                      <span className="block">{dow}</span>
                      <span className="block tabular">{day}</span>
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className="sticky top-0 z-stickyHead border-b border-l border-line bg-surface-subtle px-3 py-1.5 text-right font-semibold text-ink-muted"
                >
                  Util
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const name = nameByNip.get(employee.employee_nip) ?? employee.employee_nip;
                const days = grid.get(employee.employee_nip);
                const overall = CLASSIFICATION[employee.classification];
                return (
                  <tr key={employee.employee_nip} className="h-8">
                    <th
                      scope="row"
                      className="sticky left-0 z-rowFrozen max-w-[220px] border-b border-r border-line-hairline bg-surface px-3 text-left font-semibold text-ink"
                    >
                      <span className="block truncate" title={name}>
                        {name}
                      </span>
                    </th>
                    {columns.map((date) => {
                      const cell = days?.get(date);
                      const meta = cell ? CLASSIFICATION[cell.classification] : null;
                      const pct = cell ? Math.round(cell.utilization * 100) : 0;
                      return (
                        <td
                          key={date}
                          className="border-b border-r border-line-hairline text-center tabular"
                          style={meta ? { backgroundColor: meta.bg, color: meta.fg } : undefined}
                          title={
                            cell
                              ? `${name} · ${fullDate(date)} · ${cell.hours}h of ${cell.capacity}h (${pct}%) · ${cell.classification}`
                              : `${name} · ${fullDate(date)} · no working day`
                          }
                        >
                          {cell ? `${pct}%` : ''}
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-line-hairline px-3 text-right">
                      <span
                        className="inline-flex h-5 items-center rounded-xs border px-1.5 text-2xs font-semibold"
                        style={{ backgroundColor: overall.bg, color: overall.fg, borderColor: overall.bg }}
                        title={`${name}: ${Math.round(employee.utilization * 100)}% over ${employee.days} days · ${employee.classification}`}
                      >
                        {Math.round(employee.utilization * 100)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WorkloadSkeleton() {
  return (
    <div aria-busy="true" className="min-h-0 flex-1 overflow-hidden p-3">
      <p className="sr-only">Loading workload…</p>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
