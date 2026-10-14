import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { fullDate, relativeTime } from '../../lib/format';
import { listFinishReviews, reviewActualFinish } from '../tasks/api';
import type { FinishReview } from '../tasks/types';

const STATUS_LABEL = {
  Pending: 'Awaiting decision',
  Approved: 'Approved',
  Rejected: 'Rejected',
} as const;

/**
 * Manager queue inside the project workspace: every as-built finish date a PIC submitted from
 * My Tasks. Rejecting rolls the task back to In Progress so the PIC has to resubmit.
 */
export default function FinishReviewPanel({ projectId, onReviewed }: { projectId: number; onReviewed: () => void }) {
  const [rows, setRows] = useState<FinishReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listFinishReviews(projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the finish date queue.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(row: FinishReview, decision: 'Approved' | 'Rejected') {
    if (decision === 'Rejected' && !comment.trim()) {
      setError('A rejection needs a reason for the PIC.');
      return;
    }
    setBusyId(row.taskId);
    setError(null);
    try {
      await reviewActualFinish(row.taskId, decision, decision === 'Rejected' ? comment.trim() : null);
      setRejectingId(null);
      setComment('');
      await load();
      onReviewed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the decision.');
    } finally {
      setBusyId(null);
    }
  }

  const pending = rows.filter((r) => r.status === 'Pending');

  return (
    <section className="rounded-xl border border-line bg-surface shadow-xs">
      <header className="flex items-center justify-between gap-3 border-b border-line-hairline px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Actual finish dates</h2>
          <p className="mt-0.5 text-xs text-ink-secondary">
            {pending.length > 0
              ? `${pending.length} submitted by your team still need a decision.`
              : 'Nothing waiting. Approved and rejected dates are listed below.'}
          </p>
        </div>
        <button type="button" onClick={() => void load()} aria-label="Refresh queue" className="icon-btn">
          <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
        </button>
      </header>

      {error && (
        <p role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {loading && rows.length === 0 ? (
        <div aria-busy="true" className="space-y-2 p-4">
          <div className="skeleton h-12 w-full rounded-md" />
          <div className="skeleton h-12 w-full rounded-md" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-ink-muted">
          No finish dates submitted yet. PICs report them when they tick a task off in My Tasks.
        </p>
      ) : (
        <ul className="divide-y divide-line-hairline">
          {rows.map((row) => (
            <li key={row.taskId} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">
                    {row.picName ?? row.picNip ?? 'Unassigned'} · submitted{' '}
                    {relativeTime(row.submittedAt) || 'earlier'}
                  </p>
                </div>
                <div className="flex items-baseline gap-4 text-xs tabular">
                  <span className="text-ink-muted">Planned {fullDate(row.plannedFinish)}</span>
                  <span className="font-semibold text-ink">Actual {fullDate(row.actualFinish)}</span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                    row.status === 'Pending'
                      ? 'bg-[#FEF3C7] text-[#B45309]'
                      : row.status === 'Approved'
                        ? 'bg-brand-soft text-brand'
                        : 'bg-danger-soft text-danger'
                  }`}
                >
                  {STATUS_LABEL[row.status]}
                </span>

                {row.status === 'Pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void decide(row, 'Approved')}
                      disabled={busyId === row.taskId}
                      className="btn-secondary"
                    >
                      {busyId === row.taskId ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(rejectingId === row.taskId ? null : row.taskId);
                        setComment('');
                        setError(null);
                      }}
                      disabled={busyId === row.taskId}
                      className="btn-secondary"
                    >
                      <X size={14} /> Reject
                    </button>
                  </>
                )}

                {row.comment && <span className="text-xs text-ink-secondary">“{row.comment}”</span>}
              </div>

              {rejectingId === row.taskId && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={500}
                    placeholder="Why is the date wrong?"
                    aria-label="Rejection reason"
                    className="field flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => void decide(row, 'Rejected')}
                    disabled={busyId === row.taskId || !comment.trim()}
                    className="btn-primary"
                  >
                    Confirm reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}