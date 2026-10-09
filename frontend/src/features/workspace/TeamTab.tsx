import { useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import EmployeeSearch from './EmployeeSearch';
import { EmptyState, ErrorBanner, TabToolbar, errorText, useAsync } from './common';
import {
  addMember,
  listMembers,
  removeMember,
  type AddMemberInput,
  type EmployeeSearchResult,
  type ProjectMember,
} from './api';

export default function TeamTab({ projectId }: { projectId: number }) {
  const { notify } = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload, setData } = useAsync(() => listMembers(projectId), [projectId]);
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const members = data ?? [];

  async function remove(member: ProjectMember) {
    const ok = await confirm({
      title: `Remove ${member.employeeName}?`,
      description: 'This member will be removed from the project.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    setPendingId(member.id);
    try {
      await removeMember(projectId, member.id);
      setData((prev) => (prev ? prev.filter((item) => item.id !== member.id) : prev));
      notify('success', `Removed ${member.employeeName}.`);
    } catch (err) {
      notify('error', errorText(err, 'Could not remove the member.'));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <TabToolbar>
        <p className="text-sm font-semibold text-ink">Project members</p>
        <button type="button" className="btn-primary ml-auto h-8 gap-1" onClick={() => setAdding((value) => !value)}>
          <Plus size={15} />
          Add member
        </button>
      </TabToolbar>

      <div className="min-h-0 flex-1 overflow-auto">
        {error && <ErrorBanner message={error} onRetry={() => void reload(true)} />}

        {adding && (
          <MemberForm
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
        ) : members.length === 0 ? (
          <EmptyState
            title="No members yet"
            description="Add team members and their allocation to share this project."
            action={
              <button type="button" className="btn-primary gap-1" onClick={() => setAdding(true)}>
                <Plus size={15} />
                Add member
              </button>
            }
          />
        ) : (
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-subtle text-2xs font-semibold text-ink-muted">
                <th scope="col" className="px-3 py-2 text-left">Name</th>
                <th scope="col" className="px-3 py-2 text-left">Role</th>
                <th scope="col" className="px-3 py-2 text-left">Allocation</th>
                <th scope="col" className="px-3 py-2 text-left">NIP</th>
                <th scope="col" className="px-3 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-line-hairline hover:bg-surface-subtle">
                  <td className="px-3 py-2 font-semibold text-ink">{member.employeeName}</td>
                  <td className="px-3 py-2 text-xs text-ink-secondary">{member.role ?? '—'}</td>
                  <td className="px-3 py-2 text-xs tabular text-ink-secondary">{Math.round(member.allocationPercent)}%</td>
                  <td className="px-3 py-2 text-xs tabular text-ink-muted">{member.employeeNip}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Remove ${member.employeeName}`}
                      disabled={pendingId === member.id}
                      onClick={() => void remove(member)}
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-muted hover:bg-[#FEE2E2] hover:text-[#B91C1C] focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50"
                    >
                      {pendingId === member.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MemberForm({
  projectId,
  onCancel,
  onSaved,
}: {
  projectId: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [employee, setEmployee] = useState<EmployeeSearchResult | null>(null);
  const [role, setRole] = useState('');
  const [allocation, setAllocation] = useState('100');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!employee) {
      notify('error', 'Pick an employee to add.');
      return;
    }
    setBusy(true);
    const body: AddMemberInput = {
      employee_nip: employee.nip,
      employee_name: employee.name,
      role: role.trim() || null,
      allocation_percent: Number(allocation) >= 0 ? Number(allocation) : 100,
    };
    try {
      await addMember(projectId, body);
      notify('success', `Added ${employee.name}.`);
      onSaved();
    } catch (err) {
      notify('error', errorText(err, 'Could not add the member.'));
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
        Employee
        <EmployeeSearch onSelect={setEmployee} className="w-64" />
      </label>
      {employee && (
        <span className="mb-1.5 inline-flex h-8 items-center gap-2 rounded-sm border border-line bg-surface px-2 text-xs text-ink">
          <span className="font-semibold">{employee.name}</span>
          <span className="text-ink-muted">{employee.nip}</span>
          <button
            type="button"
            aria-label={`Clear ${employee.name}`}
            onClick={() => setEmployee(null)}
            className="text-ink-muted hover:text-ink-secondary"
          >
            <X size={14} />
          </button>
        </span>
      )}
      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        Role
        <input
          className="field w-44"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="e.g. Developer"
        />
      </label>
      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        Allocation %
        <input
          className="field w-24 text-right tabular"
          type="number"
          min={0}
          max={100}
          value={allocation}
          onChange={(event) => setAllocation(event.target.value)}
        />
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
      <p className="sr-only">Loading members…</p>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
