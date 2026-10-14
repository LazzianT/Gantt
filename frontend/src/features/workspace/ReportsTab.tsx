import { Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { fullDate } from '../../lib/format';
import Skeleton from '../../components/Skeleton';
import { EmptyState, ErrorBanner, TabToolbar, useAsync } from './common';
import { getProjectReports } from './api';

export default function ReportsTab({ projectId }: { projectId: number }) {
  const reports = useAsync(() => getProjectReports(projectId), [projectId]);
  if (reports.loading && !reports.data) return <ReportSkeleton />;
  if (reports.error && !reports.data) return <ErrorBanner message={reports.error} onRetry={() => void reports.reload(true)} />;
  if (!reports.data) return <EmptyState title="No reports" description="Reports are not available for this project." />;
  const data = reports.data;
  return (
    <div className="reports-print-area min-h-0 overflow-auto">
      <TabToolbar>
        <div>
          <h2 className="text-sm font-semibold text-ink">Project reports</h2>
          <p className="text-xs text-ink-secondary">Schedule health, delays, and evidence audit.</p>
        </div>
        <button type="button" className="btn-secondary gap-1 print:hidden" onClick={() => window.print()}>
          <Printer size={15} /> Print / PDF
        </button>
      </TabToolbar>
      {reports.error && <ErrorBanner message={reports.error} onRetry={() => void reports.reload(false)} />}
      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-5">
        <Metric label="Tasks" value={data.summary.tasks} />
        <Metric label="Completed" value={data.summary.completed} />
        <Metric label="Open" value={data.summary.open} />
        <Metric label="Overdue" value={data.summary.overdue} danger={data.summary.overdue > 0} />
        <Metric label="Max slip" value={data.summary.variance_days == null ? '—' : `${data.summary.variance_days}d`} danger={(data.summary.variance_days ?? 0) > 0} />
      </div>
      <div className="space-y-4 p-3">
        <ReportSection title="Schedule variance" empty={data.variance.length === 0} emptyText="No baseline captured yet.">
          <ReportTable headers={['Task', 'Baseline finish', 'Current finish', 'Variance']}>
            {data.variance.slice(0, 100).map((row) => <tr key={row.task_id} className="border-b border-line-hairline"><Cell>{row.name}</Cell><Cell>{fullDate(row.baseline_finish)}</Cell><Cell>{fullDate(row.current_finish)}</Cell><Cell tone={row.slip ? 'danger' : undefined}>{row.variance_days == null ? '—' : `${row.variance_days > 0 ? '+' : ''}${row.variance_days}d`}</Cell></tr>)}
          </ReportTable>
        </ReportSection>
        <ReportSection title="Delay analysis" empty={data.delays.length === 0} emptyText="No overdue open tasks.">
          <ReportTable headers={['Task', 'PIC', 'Planned finish', 'Days overdue', 'Progress']}>
            {data.delays.map((row) => <tr key={row.task_id} className="border-b border-line-hairline"><Cell>{row.name}{row.is_critical && <span className="ml-2 text-xs font-semibold text-danger">Critical</span>}</Cell><Cell>{row.pic_nip ?? '—'}</Cell><Cell>{fullDate(row.finish_date)}</Cell><Cell tone="danger">{row.days_overdue}d</Cell><Cell>{Math.round(row.progress_percent)}%</Cell></tr>)}
          </ReportTable>
        </ReportSection>
        <ReportSection title="Evidence & approval audit" empty={data.audit.length === 0} emptyText="No audit events yet.">
          <ReportTable headers={['When', 'Type', 'Task', 'Actor', 'Action', 'Detail']}>
            {data.audit.map((row) => <tr key={`${row.kind}-${row.id}`} className="border-b border-line-hairline"><Cell>{fullDate(row.created_at)}</Cell><Cell>{row.kind}</Cell><Cell>{row.task_name ?? '—'}</Cell><Cell>{row.actor_nip ?? '—'}</Cell><Cell>{row.action}</Cell><Cell>{row.detail ?? '—'}</Cell></tr>)}
          </ReportTable>
        </ReportSection>
      </div>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return <div className="rounded-xl border border-line bg-surface p-3"><span className="text-xs text-ink-secondary">{label}</span><p className={`mt-1 text-xl font-bold tabular ${danger ? 'text-danger' : 'text-ink'}`}>{value}</p></div>;
}

function ReportSection({ title, empty, emptyText, children }: { title: string; empty: boolean; emptyText: string; children: ReactNode }) {
  return <section className="rounded-xl border border-line bg-surface shadow-xs"><h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{title}</h3>{empty ? <p className="px-4 py-6 text-center text-xs text-ink-muted">{emptyText}</p> : children}</section>;
}

function ReportTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="overflow-auto"><table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr className="border-b border-line bg-surface-subtle text-2xs font-semibold text-ink-muted">{headers.map((header) => <th key={header} className="px-3 py-2 text-left">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function Cell({ children, tone }: { children: ReactNode; tone?: 'danger' }) {
  return <td className={`px-3 py-2 text-xs tabular ${tone === 'danger' ? 'font-semibold text-danger' : 'text-ink-secondary'}`}>{children}</td>;
}

function ReportSkeleton() {
  return <div aria-busy="true" className="space-y-3 p-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>;
}