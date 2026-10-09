import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import Modal from '../../components/Modal';
import DateField from '../../components/DateField';
import Select from '../../components/Select';
import { statusDot } from '../../components/StatusPill';
import { healthDot } from '../../components/HealthPill';
import { api, ApiError } from '../../lib/api';
import LeaderPicker, { type LeaderValue } from './LeaderPicker';

const STATUSES = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'] as const;
const HEALTHS = ['On Track', 'At Risk', 'Delayed', 'Critical'] as const;

const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: value, dot: statusDot(value) }));
const HEALTH_OPTIONS = HEALTHS.map((value) => ({ value, label: value, dot: healthDot(value) }));

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  manager_nip: string;
  manager_name: string;
  start_date: string;
  target_end_date: string;
  status: (typeof STATUSES)[number];
  health: (typeof HEALTHS)[number];
}

const EMPTY: FormState = {
  code: '',
  name: '',
  description: '',
  manager_nip: '',
  manager_name: '',
  start_date: '',
  target_end_date: '',
  status: 'Planning',
  health: 'On Track',
};

export default function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCodeLoading(true);
    api<{ code: string }>('/projects/next-code')
      .then((data) => {
        if (active) setForm((prev) => ({ ...prev, code: data.code }));
      })
      .catch(() => {
        if (active) setError('Could not generate a project code. Close and reopen the form.');
      })
      .finally(() => {
        if (active) setCodeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setLeader(value: LeaderValue | null) {
    setForm((prev) => ({
      ...prev,
      manager_nip: value?.nip ?? '',
      manager_name: value?.name ?? '',
    }));
  }

  function close() {
    if (submitting) return;
    setForm(EMPTY);
    setError(null);
    onClose();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!form.name.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!form.code.trim()) {
      setError('Project code is still generating. Please wait.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api('/projects', {
        method: 'POST',
        body: {
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          manager_nip: form.manager_nip.trim() || null,
          manager_name: form.manager_name.trim() || null,
          start_date: form.start_date || null,
          target_end_date: form.target_end_date || null,
          status: form.status,
          health: form.health,
        },
      });
      setForm(EMPTY);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the project. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const leader: LeaderValue | null = form.manager_name
    ? { nip: form.manager_nip, name: form.manager_name }
    : null;

  return (
    <Modal
      open={open}
      onClose={close}
      title="New project"
      description="Create a project for your department."
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={close} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" form="new-project-form" className="btn-primary" disabled={submitting || codeLoading}>
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {submitting ? 'Creating…' : 'Create project'}
          </button>
        </div>
      }
    >
      <form id="new-project-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Project code</span>
            <input
              className="field cursor-not-allowed bg-surface-sunken text-ink-secondary"
              value={form.code}
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              placeholder={codeLoading ? 'Generating…' : '—'}
            />
            <span className="text-xs text-ink-muted">Generated automatically.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Project name</span>
            <input
              className="field"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="e.g. Office relocation"
              maxLength={200}
              required
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">
            Description <span className="font-normal text-ink-muted">(optional)</span>
          </span>
          <textarea
            className="field h-auto min-h-[76px] resize-y py-2"
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="What is this project about?"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">
            Leader Project <span className="font-normal text-ink-muted">(optional)</span>
          </span>
          <LeaderPicker value={leader} onChange={setLeader} ariaLabel="Leader Project" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Start date <span className="font-normal text-ink-muted">(optional)</span>
            </span>
            <DateField
              value={form.start_date}
              onChange={(value) => set('start_date', value)}
              ariaLabel="Start date"
              placeholder="Pick a start date"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Target end date <span className="font-normal text-ink-muted">(optional)</span>
            </span>
            <DateField
              value={form.target_end_date}
              onChange={(value) => set('target_end_date', value)}
              min={form.start_date || undefined}
              ariaLabel="Target end date"
              placeholder="Pick an end date"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Status</span>
            <Select
              value={form.status}
              onChange={(value) => set('status', value)}
              options={STATUS_OPTIONS}
              ariaLabel="Status"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">Health</span>
            <Select
              value={form.health}
              onChange={(value) => set('health', value)}
              options={HEALTH_OPTIONS}
              ariaLabel="Health"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[#F8D4D2] bg-danger-soft px-3 py-2 text-xs font-medium text-danger"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
