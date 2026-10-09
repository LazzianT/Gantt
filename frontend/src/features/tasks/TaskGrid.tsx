import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  CornerUpLeft,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ApiError } from '../../lib/api';
import DateField from '../../components/DateField';
import Skeleton from '../../components/Skeleton';
import StatusPill from '../../components/StatusPill';
import { useConfirm } from '../../components/ConfirmDialog';
import LeaderPicker from '../portfolio/LeaderPicker';
import { createTask, deleteTask, listTasks, moveTask, updateTask } from './api';
import type { Task, TaskPatch } from './types';

const COLS = '40px minmax(240px, 1fr) 112px 112px 52px 112px 168px 120px';
const ROW = 32;

type SortKey = 'name' | 'start' | 'finish' | 'duration' | 'status';
type SortDir = 'asc' | 'desc';

interface Column {
  key: SortKey | null;
  label: string;
  align?: 'right';
}

const COLUMNS: Column[] = [
  { key: null, label: '#' },
  { key: 'name', label: 'Task' },
  { key: 'start', label: 'Start' },
  { key: 'finish', label: 'Finish' },
  { key: 'duration', label: 'Dur', align: 'right' },
  { key: 'status', label: 'Status' },
  { key: null, label: 'PIC' },
  { key: null, label: 'Resources' },
];

function compare(a: Task, b: Task, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'start':
      return (a.startDate ?? '9999-12-31').localeCompare(b.startDate ?? '9999-12-31');
    case 'finish':
      return (a.finishDate ?? '9999-12-31').localeCompare(b.finishDate ?? '9999-12-31');
    case 'duration':
      return (a.durationDays ?? 0) - (b.durationDays ?? 0);
    case 'status':
      return a.status.localeCompare(b.status);
  }
}

function sortTree(nodes: Task[], key: SortKey, dir: SortDir): Task[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...nodes]
    .sort((a, b) => compare(a, b, key) * factor || a.sortOrder - b.sortOrder || a.id - b.id)
    .map((node) => ({ ...node, children: sortTree(node.children, key, dir) }));
}

function mapPatch(task: Task, patch: TaskPatch): Task {
  return {
    ...task,
    name: patch.name ?? task.name,
    startDate: patch.start_date !== undefined ? patch.start_date : task.startDate,
    finishDate: patch.finish_date !== undefined ? patch.finish_date : task.finishDate,
    durationDays: patch.duration_days !== undefined ? patch.duration_days : task.durationDays,
    progress: patch.progress_percent !== undefined ? patch.progress_percent : task.progress,
    picNip: patch.pic_nip !== undefined ? patch.pic_nip : task.picNip,
    picName: patch.pic_name !== undefined ? patch.pic_name : task.picName,
  };
}

interface EditableCellProps {
  value: string | number | null;
  type: 'text' | 'number' | 'date';
  onCommit: (value: string | number | null) => void;
  ariaLabel: string;
  display?: ReactNode;
  editToken?: number;
  className?: string;
  align?: 'left' | 'right';
  min?: number;
  max?: number;
}

function EditableCell({
  value,
  type,
  onCommit,
  ariaLabel,
  display,
  editToken,
  className = '',
  align = 'left',
  min,
  max,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const committed = useRef(false);

  const start = useCallback(() => {
    setDraft(value == null ? '' : String(value));
    committed.current = false;
    setEditing(true);
  }, [value]);

  useEffect(() => {
    if (editToken && editToken > 0) start();
  }, [editToken, start]);

  function commit() {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    if (type === 'text') {
      const next = draft.trim();
      if (next && next !== value) onCommit(next);
      return;
    }
    if (type === 'number') {
      if (draft.trim() === '') {
        if (value != null) onCommit(null);
        return;
      }
      let n = Number(draft);
      if (!Number.isFinite(n)) return;
      if (min != null) n = Math.max(min, n);
      if (max != null) n = Math.min(max, n);
      if (n !== value) onCommit(n);
      return;
    }
    const next = draft.trim() === '' ? null : draft.trim();
    if (next !== value) onCommit(next);
  }

  function cancel() {
    committed.current = true;
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        value={draft}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
        className={`h-6 w-full min-w-0 rounded-sm border border-brand bg-surface px-1 text-xs tabular text-ink focus:outline-none focus:ring-2 focus:ring-brand/10 ${
          align === 'right' ? 'text-right' : ''
        }`}
      />
    );
  }

  return (
    <div
      onDoubleClick={start}
      title={display == null ? String(value ?? '') : undefined}
      className={`min-w-0 cursor-text truncate px-2 text-xs tabular ${
        align === 'right' ? 'text-right' : ''
      } ${className}`}
    >
      {display ?? (value == null || value === '' ? '—' : String(value))}
    </div>
  );
}

interface RowProps {
  task: Task;
  depth: number;
  active: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  pending: boolean;
  editToken: number;
  registerRef: (id: number, el: HTMLDivElement | null) => void;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onPatch: (task: Task, patch: TaskPatch) => void;
}

function Row({
  task,
  depth,
  active,
  collapsed,
  hasChildren,
  pending,
  editToken,
  registerRef,
  onSelect,
  onToggle,
  onPatch,
}: RowProps) {
  const frozen = 'sticky z-rowFrozen border-r border-line-hairline bg-inherit';
  return (
    <div
      role="row"
      aria-selected={active}
      ref={(el) => registerRef(task.id, el)}
      onMouseDown={() => onSelect(task.id)}
      style={{ gridTemplateColumns: COLS, height: ROW }}
      className={`grid items-stretch border-b border-line-hairline transition-colors duration-fast ${
        active ? 'bg-brand-soft' : 'bg-surface hover:bg-surface-subtle'
      } ${pending ? 'opacity-60' : ''}`}
    >
      <div role="gridcell" className={`${frozen} left-0 flex items-center px-2 text-2xs tabular text-ink-muted`}>
        {task.wbs}
      </div>

      <div role="gridcell" className={`${frozen} left-10 flex min-w-0 items-center gap-1 pr-2`}>
        <div className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingLeft: depth * 16 }}>
          {hasChildren ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggle(task.id);
              }}
              aria-label={collapsed ? `Expand ${task.name}` : `Collapse ${task.name}`}
              aria-expanded={!collapsed}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-ink-muted hover:bg-surface-sunken hover:text-ink-secondary focus-visible:outline-none focus-visible:shadow-focus"
            >
              {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {task.isMilestone && <span className="h-2 w-2 shrink-0 rotate-45 border border-gold bg-gold" aria-hidden />}
          <EditableCell
            value={task.name}
            type="text"
            ariaLabel={`Task name: ${task.name}`}
            editToken={editToken}
            onCommit={(value) => onPatch(task, { name: value as string })}
            className={`flex-1 ${task.type === 'Summary' ? 'font-semibold text-ink' : 'text-ink'}`}
          />
          {task.type === 'Summary' && (
            <span className="shrink-0 rounded-xs border border-line bg-surface-subtle px-1 text-2xs font-semibold text-ink-muted">
              SUM
            </span>
          )}
          {task.isCritical && (
            <AlertTriangle size={12} className="shrink-0 text-[#DC2626]" aria-label="On the critical path" />
          )}
        </div>
      </div>

      <div role="gridcell" className="flex items-center border-r border-line-hairline px-1">
        <DateField
          value={task.startDate ?? ''}
          allowTyping
          variant="cell"
          max={task.finishDate ?? undefined}
          ariaLabel={`Start date: ${task.name}`}
          onChange={(value) => onPatch(task, { start_date: value || null })}
          className="w-full"
        />
      </div>

      <div role="gridcell" className="flex items-center border-r border-line-hairline px-1">
        <DateField
          value={task.finishDate ?? ''}
          allowTyping
          variant="cell"
          min={task.startDate ?? undefined}
          ariaLabel={`Finish date: ${task.name}`}
          onChange={(value) => onPatch(task, { finish_date: value || null })}
          className="w-full"
        />
      </div>

      <div
        role="gridcell"
        title="Working days, calculated from the project calendar"
        className="flex items-center justify-end border-r border-line-hairline px-2 text-xs tabular text-ink-secondary"
      >
        {task.durationDays == null ? '—' : task.durationDays}
      </div>

      <div role="gridcell" className="flex items-center border-r border-line-hairline px-2">
        <StatusPill status={task.status} />
      </div>

      <div role="gridcell" className="flex items-center border-r border-line-hairline px-1">
        <LeaderPicker
          variant="cell"
          value={task.picName ? { nip: task.picNip ?? '', name: task.picName } : null}
          ariaLabel={`Person in charge: ${task.name}`}
          onChange={(pic) => onPatch(task, { pic_nip: pic?.nip ?? null, pic_name: pic?.name ?? null })}
          className="w-full"
        />
      </div>

      <div
        role="gridcell"
        className="flex items-center px-2 text-ink-disabled"
        title="Task-level resource assignments are not part of the task list response yet."
      >
        —
      </div>
    </div>
  );
}

interface TaskGridProps {
  projectId: number;
  addToken?: number;
  onAddConsumed?: () => void;
}

export default function TaskGrid({ projectId, addToken = 0, onAddConsumed }: TaskGridProps) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [editRequest, setEditRequest] = useState<{ id: number; token: number } | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const addHandled = useRef(0);
  const confirm = useConfirm();

  const load = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        setTasks(await listTasks(projectId));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load tasks.');
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const index = useMemo(() => {
    const parentOf = new Map<number, Task | null>();
    const siblingsOf = new Map<number, Task[]>();
    const walk = (nodes: Task[], parent: Task | null) => {
      for (const node of nodes) {
        parentOf.set(node.id, parent);
        siblingsOf.set(node.id, nodes);
        walk(node.children, node);
      }
    };
    walk(tasks ?? [], null);
    return { parentOf, siblingsOf };
  }, [tasks]);

  const roots = useMemo(
    () => (sortKey ? sortTree(tasks ?? [], sortKey, sortDir) : tasks ?? []),
    [tasks, sortKey, sortDir],
  );

  const flat = useMemo(() => {
    const out: { task: Task; depth: number }[] = [];
    const walk = (nodes: Task[], depth: number) => {
      for (const node of nodes) {
        out.push({ task: node, depth });
        if (node.children.length && !collapsed.has(node.id)) walk(node.children, depth + 1);
      }
    };
    walk(roots, 0);
    return out;
  }, [roots, collapsed]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    const all: { task: Task; depth: number }[] = [];
    const walk = (nodes: Task[], depth: number) => {
      for (const node of nodes) {
        all.push({ task: node, depth });
        walk(node.children, depth + 1);
      }
    };
    walk(roots, 0);
    return all.filter(
      ({ task }) =>
        task.name.toLowerCase().includes(q) ||
        (task.code ?? '').toLowerCase().includes(q) ||
        task.wbs.includes(q),
    );
  }, [flat, roots, search]);

  useEffect(() => {
    if (activeId != null) rowRefs.current.get(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const registerRef = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }, []);

  const addTask = useCallback(
    async (parent: Task | null) => {
      setError(null);
      try {
        const created = await createTask(projectId, {
          name: 'New task',
          parent_task_id: parent?.id ?? null,
          task_type: 'Normal',
        });
        await load(false);
        setActiveId(created.id);
        setCollapsed((prev) => {
          if (!parent) return prev;
          const next = new Set(prev);
          next.delete(parent.id);
          return next;
        });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not add the task.');
      }
    },
    [projectId, load],
  );

  useEffect(() => {
    if (addToken > 0 && addHandled.current !== addToken) {
      addHandled.current = addToken;
      void addTask(null);
      onAddConsumed?.();
    }
  }, [addToken, addTask, onAddConsumed]);

  async function patch(task: Task, next: TaskPatch) {
    setEditRequest(null);
    setPendingId(task.id);
    setTasks((prev) => (prev ? prev.map((n) => (n.id === task.id ? mapPatch(n, next) : n)) : prev));
    try {
      await updateTask(task.id, next);
      await load(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the change.');
      await load(false);
    } finally {
      setPendingId(null);
    }
  }

  async function remove(task: Task) {
    const ok = await confirm({
      title: `Delete "${task.name}"?`,
      description: 'This task and any subtasks under it will be removed.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    try {
      await deleteTask(task.id);
      await load(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the task.');
    }
  }

  async function move(task: Task, parent: Task | null, sortOrder: number) {
    setError(null);
    try {
      await moveTask(task.id, { parentTaskId: parent?.id ?? null, sortOrder });
      await load(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not move the task.');
    }
  }

  const active = useMemo(
    () => (activeId == null ? null : rows.find((row) => row.task.id === activeId)?.task ?? null),
    [rows, activeId],
  );

  function indent(task: Task) {
    const siblings = index.siblingsOf.get(task.id) ?? [];
    const position = siblings.findIndex((s) => s.id === task.id);
    if (position <= 0) return;
    const previous = siblings[position - 1];
    void move(task, previous, previous.children.length);
  }

  function outdent(task: Task) {
    const parent = index.parentOf.get(task.id) ?? null;
    if (!parent) return;
    const grandparent = index.parentOf.get(parent.id) ?? null;
    void move(task, grandparent, parent.sortOrder + 1);
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (event.altKey && event.key === 'ArrowRight') {
      if (active) {
        event.preventDefault();
        indent(active);
      }
      return;
    }
    if (event.altKey && event.key === 'ArrowLeft') {
      if (active) {
        event.preventDefault();
        outdent(active);
      }
      return;
    }

    const position = activeId == null ? -1 : rows.findIndex((row) => row.task.id === activeId);
    const select = (next: number) => {
      if (next < 0 || next >= rows.length) return;
      event.preventDefault();
      setActiveId(rows[next].task.id);
    };

    if (event.key === 'ArrowDown') select(position + 1);
    else if (event.key === 'ArrowUp') select(position <= 0 ? 0 : position - 1);
    else if ((event.key === 'Enter' || event.key === 'F2') && active) {
      event.preventDefault();
      setEditRequest((prev) => ({ id: active.id, token: (prev?.token ?? 0) + 1 }));
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && active) {
      event.preventDefault();
      void remove(active);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function collapseAll() {
    const ids = new Set<number>();
    const walk = (nodes: Task[]) => {
      for (const node of nodes) {
        if (node.children.length) ids.add(node.id);
        walk(node.children);
      }
    };
    walk(tasks ?? []);
    setCollapsed(ids);
  }

  const busy = tasks === null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-toolbar flex h-12 shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface px-3">
        <button type="button" className="btn-primary h-8 gap-1" onClick={() => void addTask(null)}>
          <Plus size={15} />
          Add Task
        </button>
        <button
          type="button"
          className="btn-secondary h-8 gap-1"
          disabled={!active}
          onClick={() => active && void addTask(active)}
        >
          <CornerDownRight size={15} />
          Add Child
        </button>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <ToolbarButton label="Indent (Alt+Right)" disabled={!active} onClick={() => active && indent(active)}>
          <CornerDownRight size={15} />
        </ToolbarButton>
        <ToolbarButton label="Outdent (Alt+Left)" disabled={!active} onClick={() => active && outdent(active)}>
          <CornerUpLeft size={15} />
        </ToolbarButton>
        <ToolbarButton label="Delete task" disabled={!active} onClick={() => active && void remove(active)}>
          <Trash2 size={15} />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <ToolbarButton label="Expand all" disabled={busy} onClick={() => setCollapsed(new Set())}>
          <ChevronsUpDown size={15} />
        </ToolbarButton>
        <ToolbarButton label="Collapse all" disabled={busy} onClick={collapseAll}>
          <ChevronsDownUp size={15} />
        </ToolbarButton>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="field pl-7"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center gap-3 rounded-sm border border-[#FECACA] bg-[#FEE2E2] px-3 py-2 text-sm text-[#B91C1C]"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void load(true)} className="btn-secondary h-7 border-[#FECACA] bg-white">
            Retry
          </button>
        </div>
      )}

      {loading && tasks === null ? (
        <GridSkeleton />
      ) : (
        <div
          role="grid"
          aria-label="Task grid"
          aria-busy={busy}
          tabIndex={0}
          onKeyDown={onGridKeyDown}
          className="min-h-0 flex-1 overflow-auto focus:outline-none"
        >
          <div
            role="row"
            style={{ gridTemplateColumns: COLS, height: ROW }}
            className="sticky top-0 z-toolbar grid items-stretch border-b border-line bg-surface-subtle text-2xs font-semibold text-ink-muted"
          >
            {COLUMNS.map((column, position) => (
              <div
                key={column.label}
                role="columnheader"
                className={`flex items-center border-r border-line-hairline bg-surface-subtle px-2 ${
                  position === 0 ? 'sticky left-0 z-[1]' : position === 1 ? 'sticky left-10 z-[1]' : ''
                } ${column.align === 'right' ? 'justify-end' : ''}`}
              >
                {column.key ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key as SortKey)}
                    aria-label={`Sort by ${column.label}`}
                    className={`inline-flex items-center gap-1 rounded-xs focus-visible:outline-none focus-visible:shadow-focus ${
                      sortKey === column.key ? 'text-brand' : 'hover:text-ink-secondary'
                    }`}
                  >
                    {column.label}
                    {sortKey === column.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : (
                      <ArrowUpDown size={11} className="opacity-40" />
                    )}
                  </button>
                ) : (
                  column.label
                )}
              </div>
            ))}
          </div>

          {tasks && tasks.length === 0 ? (
            <EmptyTasks onAdd={() => void addTask(null)} />
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-ink">No tasks match this search</p>
              <p className="mt-1 text-xs text-ink-muted">Clear the search to see the full WBS.</p>
            </div>
          ) : (
            rows.map(({ task, depth }) => (
              <Row
                key={task.id}
                task={task}
                depth={depth}
                active={activeId === task.id}
                collapsed={collapsed.has(task.id)}
                hasChildren={task.children.length > 0}
                pending={pendingId === task.id}
                editToken={editRequest?.id === task.id ? editRequest.token : 0}
                registerRef={registerRef}
                onSelect={setActiveId}
                onToggle={(id) =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onPatch={(t, patchBody) => void patch(t, patchBody)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GridSkeleton() {
  return (
    <div aria-busy="true" className="min-h-0 flex-1 overflow-hidden">
      <p className="sr-only">Loading tasks…</p>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          style={{ gridTemplateColumns: COLS, height: ROW }}
          className="grid items-center border-b border-line-hairline"
        >
          <Skeleton className="mx-2 h-3 w-5" />
          <Skeleton className="mx-2 h-3 w-40" />
          <Skeleton className="mx-2 h-3 w-14" />
          <Skeleton className="mx-2 h-3 w-14" />
          <Skeleton className="mx-2 h-3 w-6" />
          <Skeleton className="mx-2 h-3 w-12" />
          <Skeleton className="mx-2 h-3 w-16" />
          <Skeleton className="mx-2 h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

function EmptyTasks({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center">
      <h2 className="text-sm font-semibold text-ink">No tasks yet</h2>
      <p className="mt-1 text-xs text-ink-muted">Add the first task to start scheduling.</p>
      <button type="button" onClick={onAdd} className="btn-primary mt-4 gap-1">
        <Plus size={15} />
        Add Task
      </button>
    </div>
  );
}
