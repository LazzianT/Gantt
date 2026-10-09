import { ConflictError, NotFoundError, ValidationError } from "../../middleware/error.js";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type CreateTaskData,
  type TaskPriority,
  type TaskRepository,
  type TaskRow,
  type TaskStatus,
  type TaskType,
  type UpdateTaskPatch,
} from "./tasks.repository.js";

export type CreateTaskInput = CreateTaskData;
export type UpdateTaskInput = UpdateTaskPatch;

export interface TaskDTO {
  id: number;
  projectId: number;
  parentTaskId: number | null;
  calendarId: number | null;
  code: string | null;
  name: string;
  description: string | null;
  taskType: TaskType;
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progressPercent: number;
  status: TaskStatus;
  priority: TaskPriority;
  picNip: string | null;
  picName: string | null;
  isMilestone: boolean;
  sortOrder: number;
  wbsCode: string | null;
  esDate: string | null;
  efDate: string | null;
  lsDate: string | null;
  lfDate: string | null;
  totalFloatDays: number | null;
  freeFloatDays: number | null;
  isCritical: boolean;
  scheduleVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskNode extends TaskDTO {
  children: TaskNode[];
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function num(value: unknown): number {
  return numOrNull(value) ?? 0;
}

function isoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoStamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value == null ? "" : String(value);
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`Invalid ${field}`);
  }
  return value as T;
}

export function toTaskDTO(row: TaskRow): TaskDTO {
  return {
    id: row.task_id,
    projectId: row.project_id,
    parentTaskId: row.parent_task_id,
    calendarId: row.calendar_id,
    code: row.code,
    name: row.name,
    description: row.description,
    taskType: row.task_type,
    startDate: isoDate(row.start_date),
    finishDate: isoDate(row.finish_date),
    durationDays: numOrNull(row.duration_days),
    progressPercent: num(row.progress_percent),
    status: row.status,
    priority: row.priority,
    picNip: row.pic_nip,
    picName: row.pic_name,
    isMilestone: Boolean(row.is_milestone),
    sortOrder: num(row.sort_order),
    wbsCode: null,
    esDate: isoDate(row.es_date),
    efDate: isoDate(row.ef_date),
    lsDate: isoDate(row.ls_date),
    lfDate: isoDate(row.lf_date),
    totalFloatDays: numOrNull(row.total_float_days),
    freeFloatDays: numOrNull(row.free_float_days),
    isCritical: Boolean(row.is_critical),
    scheduleVersion: num(row.schedule_version),
    createdAt: isoStamp(row.created_at),
    updatedAt: isoStamp(row.updated_at),
  };
}

/** Nested WBS: children sorted by (sort_order, id); wbs_code recomputed as 1, 1.1, 1.1.1. */
export function buildTree(rows: TaskRow[]): TaskNode[] {
  const nodes = new Map<number, TaskNode>();
  for (const row of rows) nodes.set(row.task_id, { ...toTaskDTO(row), children: [] });

  const roots: TaskNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.task_id)!;
    const parent = row.parent_task_id == null ? undefined : nodes.get(row.parent_task_id);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const assign = (list: TaskNode[], prefix: string): void => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    list.forEach((node, index) => {
      node.wbsCode = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      assign(node.children, node.wbsCode);
    });
  };
  assign(roots, "");
  return roots;
}

/** Summary tasks roll up and are never dependency endpoints (400 at write time). */
export function assertNotSummary(task: Pick<TaskRow, "task_type">): void {
  if (task.task_type === "Summary") {
    throw new ValidationError("Summary tasks cannot be dependency endpoints");
  }
}

/** A child task's dates must stay within its parent's date range whenever both sides are known. */
function assertWithinParent(
  child: { startDate: string | null; finishDate: string | null; parentId: number | null },
  parent: TaskRow | null,
): void {
  if (child.parentId == null || !parent) return;
  const parentStart = isoDate(parent.start_date);
  const parentFinish = isoDate(parent.finish_date);
  if (child.startDate && parentStart && child.startDate < parentStart) {
    throw new ValidationError("Task start date cannot be before its parent's start date");
  }
  if (child.finishDate && parentFinish && child.finishDate > parentFinish) {
    throw new ValidationError("Task finish date cannot be after its parent's finish date");
  }
}

function validateEnums(input: CreateTaskInput | UpdateTaskInput): void {
  if (input.task_type !== undefined) assertEnum(input.task_type, TASK_TYPES, "task_type");
  if (input.status !== undefined) assertEnum(input.status, TASK_STATUSES, "status");
  if (input.priority !== undefined) assertEnum(input.priority, TASK_PRIORITIES, "priority");
  if (input.duration_days != null && input.duration_days < 0) {
    throw new ValidationError("duration_days must be >= 0");
  }
  if (input.progress_percent != null && (input.progress_percent < 0 || input.progress_percent > 100)) {
    throw new ValidationError("progress_percent must be between 0 and 100");
  }
}

export async function listTasks(repo: TaskRepository, projectId: number): Promise<TaskNode[]> {
  return buildTree(await repo.listByProject(projectId));
}

export async function getTask(repo: TaskRepository, id: number): Promise<TaskDTO> {
  const row = await repo.getById(id);
  if (!row) throw new NotFoundError("Task not found");
  return toTaskDTO(row);
}

export async function createTask(repo: TaskRepository, input: CreateTaskInput): Promise<TaskDTO> {
  const name = input.name?.trim();
  if (!name) throw new ValidationError("name is required");
  validateEnums(input);
  const taskType = input.task_type ?? "Normal";
  const data: CreateTaskData = {
    ...input,
    name,
    task_type: taskType,
    // Milestone invariant: zero duration, milestone flag forced on.
    is_milestone: taskType === "Milestone" ? true : (input.is_milestone ?? false),
    duration_days: taskType === "Milestone" ? 0 : (input.duration_days ?? null),
  };
  const parent = data.parent_task_id != null ? await repo.getById(data.parent_task_id) : null;
  assertWithinParent(
    {
      startDate: data.start_date ?? null,
      finishDate: data.finish_date ?? null,
      parentId: data.parent_task_id ?? null,
    },
    parent,
  );
  const row = await repo.create(data);
  if (!row) throw new NotFoundError("Task not found after create");
  return toTaskDTO(row);
}

export async function updateTask(repo: TaskRepository, id: number, patch: UpdateTaskInput): Promise<TaskDTO> {
  const current = await repo.getById(id);
  if (!current) throw new NotFoundError("Task not found");
  validateEnums(patch);

  const next: UpdateTaskPatch = { ...patch };
  if (next.name !== undefined) {
    const name = next.name.trim();
    if (!name) throw new ValidationError("name is required");
    next.name = name;
  }
  if ((next.task_type ?? current.task_type) === "Milestone") {
    next.task_type = "Milestone";
    next.is_milestone = true;
    next.duration_days = 0;
  }
  const parentId = next.parent_task_id !== undefined ? next.parent_task_id : current.parent_task_id;
  const parent = parentId != null ? await repo.getById(parentId) : null;
  assertWithinParent(
    {
      startDate: next.start_date !== undefined ? next.start_date : isoDate(current.start_date),
      finishDate: next.finish_date !== undefined ? next.finish_date : isoDate(current.finish_date),
      parentId,
    },
    parent,
  );
  const row = await repo.update(id, next);
  if (!row) throw new NotFoundError("Task not found");
  return toTaskDTO(row);
}

export async function softDeleteTask(repo: TaskRepository, id: number): Promise<void> {
  if (!(await repo.softDelete(id))) throw new NotFoundError("Task not found");
}

/** Reparent + reorder. Rejects moving a task under its own descendant (WBS cycle). */
export async function move(
  repo: TaskRepository,
  id: number,
  newParentId: number | null,
  newOrder: number,
): Promise<void> {
  const task = await repo.getById(id);
  if (!task) throw new NotFoundError("Task not found");

  if (newParentId != null) {
    if (newParentId === id) throw new ValidationError("Task cannot be its own parent");
    const parent = await repo.getById(newParentId);
    if (!parent) throw new NotFoundError("Parent task not found");
    if (parent.project_id !== task.project_id) {
      throw new ValidationError("Parent task belongs to a different project");
    }

    const byId = new Map((await repo.listByProject(task.project_id)).map((t) => [t.task_id, t]));
    let cursor: TaskRow | undefined = parent;
    while (cursor) {
      if (cursor.task_id === id) throw new ConflictError("Cannot move a task under its own descendant");
      cursor = cursor.parent_task_id == null ? undefined : byId.get(cursor.parent_task_id);
    }
  }

  await repo.setParent(id, newParentId ?? null, newOrder);
}
