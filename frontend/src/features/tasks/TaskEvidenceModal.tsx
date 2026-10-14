import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Download, FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import Modal from '../../components/Modal';
import { ApiError } from '../../lib/api';
import { relativeTime } from '../../lib/format';
import {
  addTaskEvidence,
  deleteTaskEvidence,
  downloadEvidenceFile,
  listTaskEvidence,
} from './api';
import type { TaskEvidence } from './types';

/** Mirrors the server allow-list in evidence.storage.ts. */
const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv';
const MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TaskEvidenceModalProps {
  open: boolean;
  taskId: number | null;
  taskName: string;
  onClose: () => void;
}

export default function TaskEvidenceModal({ open, taskId, taskName, onClose }: TaskEvidenceModalProps) {
  const [items, setItems] = useState<TaskEvidence[]>([]);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || taskId == null) return;
    setLoading(true);
    setError(null);
    listTaskEvidence(taskId)
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load evidence.'))
      .finally(() => setLoading(false));
  }, [open, taskId]);

  function reset() {
    setNote('');
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function close() {
    if (submitting) return;
    reset();
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (taskId == null) return;
    // Nothing to attach: skip the request instead of asking the server to reject it.
    if (!note.trim() && !file) {
      setError('Add a note or attach a file first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await addTaskEvidence(taskId, { note, file });
      setItems((prev) => [created, ...prev]);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the evidence.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDownload(item: TaskEvidence) {
    if (!item.fileName) return;
    setBusyId(item.id);
    setError(null);
    try {
      await downloadEvidenceFile(item.id, item.fileName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not download the file.');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(item: TaskEvidence) {
    setBusyId(item.id);
    setError(null);
    try {
      await deleteTaskEvidence(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the evidence.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Task evidence"
      description={taskName}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close} disabled={submitting}>
            Close
          </button>
          <button
            type="submit"
            form="task-evidence-form"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {submitting ? 'Saving' : 'Save evidence'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <form id="task-evidence-form" onSubmit={onSubmit} noValidate className="space-y-3">
          <div>
            <label htmlFor="evidence-note" className="text-xs font-semibold text-ink-secondary">
              Note
            </label>
            <textarea
              id="evidence-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="What was done? Optional if you attach a file."
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>

          <div>
            <span className="text-xs font-semibold text-ink-secondary">Attachment</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                ref={fileInputRef}
                id="evidence-file"
                type="file"
                accept={ACCEPTED}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
              />
            </div>
            <p className="mt-1 text-xs text-ink-muted">Up to {formatBytes(MAX_BYTES)} per file.</p>
          </div>

          {file && (
            <p className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2 text-xs text-ink">
              <Paperclip size={13} className="shrink-0 text-ink-muted" />
              <span className="truncate">{file.name}</span>
              <span className="ml-auto shrink-0 tabular text-ink-muted">{formatBytes(file.size)}</span>
            </p>
          )}
        </form>

        <div>
          <h3 className="text-xs font-semibold text-ink-secondary">
            History{items.length > 0 && <span className="ml-1 tabular text-ink-muted">({items.length})</span>}
          </h3>
          {loading ? (
            <div aria-busy="true" className="mt-2 space-y-2">
              <div className="skeleton h-12 w-full rounded-md" />
              <div className="skeleton h-12 w-full rounded-md" />
            </div>
          ) : items.length === 0 ? (
            <p className="mt-2 rounded-md bg-surface-sunken px-3 py-4 text-center text-xs text-ink-muted">
              No evidence recorded yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line-hairline">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-2.5">
                  <FileText size={15} className="mt-0.5 shrink-0 text-ink-muted" />
                  <div className="min-w-0 flex-1">
                    {item.note && <p className="whitespace-pre-wrap break-words text-sm text-ink">{item.note}</p>}
                    {item.hasFile && item.fileName && (
                      <button
                        type="button"
                        onClick={() => void onDownload(item)}
                        disabled={busyId === item.id}
                        className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-hover disabled:opacity-60"
                      >
                        {busyId === item.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Download size={12} />
                        )}
                        <span className="truncate">{item.fileName}</span>
                        {item.sizeBytes != null && (
                          <span className="tabular text-ink-muted">({formatBytes(item.sizeBytes)})</span>
                        )}
                      </button>
                    )}
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {item.uploadedByNip ?? 'Unknown'} · {relativeTime(item.createdAt) || item.createdAt}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete evidence"
                    onClick={() => void onDelete(item)}
                    disabled={busyId === item.id}
                    className="icon-btn shrink-0 text-ink-muted hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}