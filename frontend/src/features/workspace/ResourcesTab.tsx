import { useState, type ReactNode } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { canManageProjects } from '../../lib/auth';
import EmployeeSearch from './EmployeeSearch';
import WorkloadView from './WorkloadView';
import { EmptyState, ErrorBanner, TabToolbar, errorText, useAsync } from './common';
import {
  addResource,
  listResources,
  removeResource,
  type AddResourceInput,
  type EmployeeSearchResult,
  type ProjectResource,
  type ResourceType,
} from './api';

const RESOURCE_TYPES: ResourceType[] = ['Employee', 'Equipment'];

export default function ResourcesTab({ projectId }: { projectId: number }) {
  const { notify } = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload, setData } = useAsync(() => listResources(projectId), [projectId]);
  const [view, setView] = useState<'list' | 'workload'>('list');
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const resources = data ?? [];
  const canManage = canManageProjects();

  async function remove(resource: ProjectResource) {
    const ok = await confirm({
      title: `Remove "${resource.name}"?`,
      description: 'This resource will be removed from the project.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    setPendingId(resource.id);
    try {
      await removeResource(resource.id);
      setData((prev) => (prev ? prev.filter((item) => item.id !== resource.id) : prev));
      notify('success', `Removed ${resource.name}.`);
    } catch (err) {
      notify('error', errorText(err, 'Could not remove the resource.'));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <TabToolbar>
        <div role="tablist" aria-label="Resources view" className="flex items-center gap-1">
          <SegButton active={view === 'list'} onClick={() => setView('list')}>
            Resources
          </SegButton>
          <SegButton active={view === 'workload'} onClick={() => setView('workload')}>
            Workload
          </SegButton>
        </div>
        {view === 'list' && canManage && (
          <button type="button" className="btn-primary ml-auto h-8 gap-1" onClick={() => setAdding((value) => !value)}>
            <Plus size={15} />
            Add resource
          </button>
        )}
      </TabToolbar>

      {view === 'workload' ? (
        <WorkloadView projectId={projectId} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {error && <ErrorBanner message={error} onRetry={() => void reload(true)} />}

           {canManage && adding && (
             <ResourceForm
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
          ) : resources.length === 0 ? (
            <EmptyState
              title="No resources yet"
              description="Add people or equipment to plan capacity and track workload."
             action={
               canManage ? (
                <button type="button" className="btn-primary gap-1" onClick={() => setAdding(true)}>
                  <Plus size={15} />
                  Add resource
                </button>
              ) : undefined
             }
            />
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-subtle text-2xs font-semibold text-ink-muted">
                  <Th>Resource</Th>
                  <Th>Type</Th>
                  <Th>NIP</Th>
                  <Th>Department</Th>
                  <Th align="right">Max units</Th>
                  <Th align="right"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => (
                  <tr key={resource.id} className="border-b border-line-hairline hover:bg-surface-subtle">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-ink">{resource.name}</p>
                      {resource.employeeName && resource.employeeName !== resource.name && (
                        <p className="text-2xs text-ink-muted">{resource.employeeName}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-secondary">{resource.type}</td>
                    <td className="px-3 py-2 text-xs tabular text-ink-muted">{resource.employeeNip ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-ink-secondary">{resource.departmentName ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-xs tabular text-ink-secondary">{resource.maxUnits}</td>
                     <td className="px-3 py-2 text-right">
                       {canManage && <button
                        type="button"
                        aria-label={`Remove ${resource.name}`}
                        disabled={pendingId === resource.id}
                        onClick={() => void remove(resource)}
                        className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-muted hover:bg-[#FEE2E2] hover:text-[#B91C1C] focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50"
                      >
                        {pendingId === resource.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                       </button>}
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function ResourceForm({
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
  const [name, setName] = useState('');
  const [type, setType] = useState<ResourceType>('Employee');
  const [maxUnits, setMaxUnits] = useState('1');
  const [busy, setBusy] = useState(false);

  function pick(selected: EmployeeSearchResult) {
    setEmployee(selected);
    setName(selected.name);
    setType('Employee');
  }

  async function submit() {
    const resourceName = name.trim();
    if (!resourceName) {
      notify('error', 'A resource name is required.');
      return;
    }
    setBusy(true);
    const body: AddResourceInput = {
      employee_nip: employee?.nip ?? null,
      employee_name: employee?.name ?? null,
      department_name: employee?.departmentName ?? null,
      position_name: employee?.position ?? null,
      resource_name: resourceName,
      resource_type: type,
      max_units: Number(maxUnits) > 0 ? Number(maxUnits) : 1,
    };
    try {
      await addResource(projectId, body);
      notify('success', `Added ${resourceName}.`);
      onSaved();
    } catch (err) {
      notify('error', errorText(err, 'Could not add the resource.'));
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
        Find employee
        <EmployeeSearch onSelect={pick} className="w-64" />
      </label>
      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        Resource name
        <input
          className="field w-48"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Andi Pratama"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        Type
        <select className="field w-36" value={type} onChange={(event) => setType(event.target.value as ResourceType)}>
          {RESOURCE_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        Max units
        <input
          className="field w-24 text-right tabular"
          type="number"
          min={0}
          step={0.5}
          value={maxUnits}
          onChange={(event) => setMaxUnits(event.target.value)}
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

function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-8 rounded-sm px-2 text-sm font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus ${
        active ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:bg-surface-subtle hover:text-ink-secondary'
      }`}
    >
      {children}
    </button>
  );
}

function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th scope="col" className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="p-3">
      <p className="sr-only">Loading resources…</p>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
