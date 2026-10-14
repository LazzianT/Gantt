import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Paperclip } from 'lucide-react';
import Modal from '../../components/Modal';
import { ApiError } from '../../lib/api';
import { addTaskEvidence, setTaskCompletion } from './api';
import type { MyTask } from '../dashboard/api';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv';
const MAX_BYTES = 5 * 1024 * 1024;

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CompleteTaskModalProps {
  task: MyTask | null;
  onClose: () => void;
  onDone: (taskId: number, completed: boolean, actualFinish: string | null) => void;
}

/**
 * Confirmation step for the My Tasks checklist: the PIC states the date the work actually
 * finished (required) and may attach evidence (optional). The date stays provisional until a
 * manager reviews it in the project workspace.
 */
export default function CompleteTaskModal({ task, onClose, onDone }: CompleteTaskModalProps) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task) return;
    setDate(task.actual_finish ?? todayIso());
    setNote('');
    setFile(null);
    setError(null);
  }, [task]);

  if (!task) return null;
  // Narrowed alias: the handlers below close over this, not the nullable prop.
  const current = task;
  const done = current.status === 'Completed';

  function close() {
    if (submitting) return;
    setError(null);
    onClose();
  }

  function pickFile(next: File | null) {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (next.size > MAX_BYTES) {
      setFile(null);
      setError(`"${next.name}" is ${formatBytes(next.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(next);
  }

  async function complete(event: FormEvent) {
    event.preventDefault();
    if (!date) {
      setError('Enter the date the task actually finished.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setTaskCompletion(current.task_id, true, date);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark the task as done.');
      setSubmitting(false);
      return;
    }

    // Evidence is optional: skip the request entirely when there is nothing to attach.
    if (note.trim() || file) {
      try {
        await addTaskEvidence(current.task_id, { note, file });
      } catch (err) {
        setError(
          `Task marked done, but the evidence was not saved: ${
            err instanceof ApiError ? err.message : 'the upload failed'
          }`,
        );
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    onDone(current.task_id, true, date);
  }

  async function reopen() {
    setSubmitting(true);
    setError(null);
    try {
      await setTaskCompletion(current.task_id, false);
      onDone(current.task_id, false, null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reopen the task.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={close}
      title={done ? 'Reopen task' : 'Mark task as done'}
      description={current.name}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close} disabled={submitting}>
            Cancel
          </button>
          {done ? (
            <button type="button" className="btn-primary" onClick={() => void reopen()} disabled={submitting}>
              {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
              Reopen task
            </button>
          ) : (
            <button type="submit" form="complete-task-form" className="btn-primary" disabled={submitting || !date}>
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {submitting ? 'Saving' : 'Confirm done'}
            </button>
          )}
        </div>
      }
    >
      {error && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {done ? (
        <p className="text-sm text-ink-secondary">
          Progress returns to 0% and any submitted finish date is discarded. You will need to submit a new one.
        </p>
      ) : (
        <form id="complete-task-form" onSubmit={complete} noValidate className="space-y-4">
          <div>
            <label htmlFor="actual-finish" className="text-xs font-semibold text-ink-secondary">
              Finished on
            </label>
            <input
              id="actual-finish"
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              required
              className="field mt-1 w-full"
            />
            <p className="mt-1 text-xs text-ink-muted">
              Planned finish was {current.finish_date ?? 'not set'}. A manager reviews this date before it counts.
            </p>
          </div>

          <div>
            <label htmlFor="complete-note" className="text-xs font-semibold text-ink-secondary">
              Evidence note <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <textarea
              id="complete-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Optional. What did you deliver?"
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>

          <div>
            <label htmlFor="complete-file" className="text-xs font-semibold text-ink-secondary">
              Evidence file <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              ref={fileInputRef}
              id="complete-file"
              type="file"
              accept={ACCEPTED}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
            />
            {file && (
              <p className="mt-1 flex items-center gap-2 text-xs text-ink">
                <Paperclip size={13} className="shrink-0 text-ink-muted" />
                <span className="truncate">{file.name}</span>
                <span className="ml-auto shrink-0 tabular text-ink-muted">{formatBytes(file.size)}</span>
              </p>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}