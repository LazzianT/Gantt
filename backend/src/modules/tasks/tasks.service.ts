import { ConflictError, NotFoundError, ValidationError } from "../../middleware/error.js";
import { writeActivity } from "../activity/activity.repository.js";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type ActualFinishStatus,
  type CreateTaskData,
  type FinishReviewRow,
  type TaskPriority,
  type TaskRepository,
  type TaskRow,
  type TaskStatus,
  type TaskType,
  type UpdateTaskPatch,
} from "./tasks.repository.js";

export type CreateTaskInput = CreateTaskData;
export type UpdateTaskInput = UpdateTaskPatch;

/** Route schemas validate format; the service re-checks because it is also called from tests and scripts. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  actualStart: string | null;
  actualFinish: string | null;
  actualFinishStatus: ActualFinishStatus | null;
  actualFinishComment: string | null;
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
    actualStart: isoDate(row.actual_start),
    actualFinish: isoDate(row.actual_finish),
    actualFinishStatus: row.actual_finish_status ?? null,
    actualFinishComment: row.actual_finish_comment ?? null,
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

/**
 * Container tasks derive their timeframe from their subtasks, so a child may legitimately sit
 * outside the parent's current range. Rather than rejecting the move, widen every ancestor so it
 * still encloses the child. Ancestors only ever grow (never shrink) and each step is guarded by a
 * visited set so malformed cycles cannot loop forever.
 */
async function growAncestors(
  repo: TaskRepository,
  parentId: number | null,
  childStart: string | null,
  childFinish: string | null,
): Promise<void> {
  if (parentId == null || (childStart == null && childFinish == null)) return;
  const visited = new Set<number>();
  let cursorId: number | null = parentId;
  while (cursorId != null && !visited.has(cursorId)) {
    visited.add(cursorId);
    const ancestor = await repo.getById(cursorId);
    if (!ancestor) return;
    const patch: UpdateTaskPatch = {};
    const start = isoDate(ancestor.start_date);
    const finish = isoDate(ancestor.finish_date);
    if (childStart && (start == null || childStart < start)) patch.start_date = childStart;
    if (childFinish && (finish == null || childFinish > finish)) patch.finish_date = childFinish;
    if (patch.start_date !== undefined || patch.finish_date !== undefined) {
      await repo.update(cursorId, patch);
    }
    cursorId = ancestor.parent_task_id;
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
  const row = await repo.create(data);
  if (!row) throw new NotFoundError("Task not found after create");
  await growAncestors(repo, data.parent_task_id ?? null, data.start_date ?? null, data.finish_date ?? null);
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
  const row = await repo.update(id, next);
  if (!row) throw new NotFoundError("Task not found");
  const newStart = next.start_date !== undefined ? next.start_date : isoDate(current.start_date);
  const newFinish = next.finish_date !== undefined ? next.finish_date : isoDate(current.finish_date);
  await growAncestors(repo, parentId, newStart, newFinish);
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

/**
 * "My Tasks" completion toggle. Completing requires the as-built finish date the PIC reports and
 * parks it as `Pending` for a manager to review; reopening discards it and returns the task to
 * In Progress at 0 progress. Deliberately narrower than `updateTask` — a PIC may only say whether
 * their own task is done and when, not reshape it.
 */
export async function setMyTaskCompletion(
  repo: TaskRepository,
  id: number,
  input: { completed: boolean; actual_finish?: string | null },
  employeeNip: string,
): Promise<TaskDTO> {
  const current = await repo.getById(id);
  if (!current) throw new NotFoundError("Task not found");

  const actualFinish = input.actual_finish ?? null;
  if (input.completed && !actualFinish) {
    throw new ValidationError("actual_finish is required when marking a task as done");
  }
  if (actualFinish && !DATE_PATTERN.test(actualFinish)) {
    throw new ValidationError("actual_finish must be an ISO date (YYYY-MM-DD)");
  }

  const row = await repo.setCompletion(id, input.completed, actualFinish, employeeNip);
  if (!row) throw new NotFoundError("Task not found");

  await writeActivity(repo.exec, {
    project_id: row.project_id,
    entity_type: "task",
    entity_id: id,
    action: input.completed ? "complete" : "reopen",
    actor_nip: employeeNip,
    detail: {
      status: row.status,
      progress_percent: Number(row.progress_percent),
      actual_finish: isoDate(row.actual_finish),
      actual_finish_status: row.actual_finish_status ?? null,
    },
  });
  return toTaskDTO(row);
}

/**
 * Manager decision on a submitted as-built finish date. Only `Pending` rows can be decided, so a
 * resubmission cannot be reviewed twice.
 */
export async function reviewActualFinish(
  repo: TaskRepository,
  id: number,
  decision: "Approved" | "Rejected",
  reviewerNip: string,
  comment: string | null,
): Promise<TaskDTO> {
  const current = await repo.getById(id);
  if (!current) throw new NotFoundError("Task not found");
  if (current.actual_finish_status !== "Pending") {
    throw new ConflictError("This finish date has already been reviewed");
  }
  const trimmed = comment?.trim();
  if (decision === "Rejected" && !trimmed) {
    throw new ValidationError("A rejection needs a reason");
  }
  if (trimmed && trimmed.length > 500) throw new ValidationError("comment must be at most 500 characters");

  const row = await repo.reviewActualFinish(id, decision, reviewerNip, trimmed || null);
  if (!row) throw new NotFoundError("Task not found");

  await writeActivity(repo.exec, {
    project_id: row.project_id,
    entity_type: "task",
    entity_id: id,
    action: decision === "Approved" ? "approve_actual_finish" : "reject_actual_finish",
    actor_nip: reviewerNip,
    detail: {
      actual_finish: isoDate(current.actual_finish),
      decision,
      comment: trimmed || null,
      status: row.status,
    },
  });
  return toTaskDTO(row);
}

export interface FinishReviewDTO {
  task_id: number;
  name: string;
  pic_nip: string | null;
  pic_name: string | null;
  planned_finish: string | null;
  actual_finish: string | null;
  actual_finish_status: ActualFinishStatus;
  actual_finish_submitted_by: string | null;
  actual_finish_submitted_at: string | null;
  actual_finish_comment: string | null;
}

function toFinishReviewDTO(row: FinishReviewRow): FinishReviewDTO {
  return {
    task_id: row.task_id,
    name: row.name,
    pic_nip: row.pic_nip,
    pic_name: row.pic_name,
    planned_finish: isoDate(row.planned_finish),
    actual_finish: isoDate(row.actual_finish),
    actual_finish_status: row.actual_finish_status,
    actual_finish_submitted_by: row.actual_finish_submitted_by,
    actual_finish_submitted_at: isoStamp(row.actual_finish_submitted_at),
    actual_finish_comment: row.actual_finish_comment,
  };
}

export async function listFinishReviews(
  repo: TaskRepository,
  projectId: number,
  status?: ActualFinishStatus | null,
): Promise<FinishReviewDTO[]> {
  return (await repo.listFinishReviews(projectId, status ?? null)).map(toFinishReviewDTO);
}
