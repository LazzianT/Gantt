export const TASK_TYPES = ["Summary", "Normal", "Milestone"] as const;
export const TASK_STATUSES = ["Not Started", "In Progress", "Completed", "Blocked", "Cancelled"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface TaskRow {
  task_id: number;
  project_id: number;
  parent_task_id: number | null;
  calendar_id: number | null;
  code: string | null;
  name: string;
  description: string | null;
  task_type: TaskType;
  start_date: Date | string | null;
  finish_date: Date | string | null;
  duration_days: number | null;
  progress_percent: number;
  status: TaskStatus;
  priority: TaskPriority;
  pic_nip: string | null;
  pic_name: string | null;
  is_milestone: boolean;
  es_date: Date | string | null;
  ef_date: Date | string | null;
  ls_date: Date | string | null;
  lf_date: Date | string | null;
  total_float_days: number | null;
  free_float_days: number | null;
  is_critical: boolean;
  schedule_version: number;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateTaskData {
  project_id: number;
  parent_task_id?: number | null;
  code?: string | null;
  name: string;
  description?: string | null;
  task_type?: TaskType;
  start_date?: string | null;
  finish_date?: string | null;
  duration_days?: number | null;
  progress_percent?: number | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  pic_nip?: string | null;
  pic_name?: string | null;
  is_milestone?: boolean;
  calendar_id?: number | null;
  sort_order?: number;
}

export type UpdateTaskPatch = Partial<
  Pick<
    CreateTaskData,
    | "parent_task_id"
    | "code"
    | "name"
    | "description"
    | "task_type"
    | "start_date"
    | "finish_date"
    | "duration_days"
    | "progress_percent"
    | "status"
    | "priority"
    | "pic_nip"
    | "pic_name"
    | "is_milestone"
    | "calendar_id"
    | "sort_order"
  >
>;

export interface ScheduleFields {
  es_date: string | null;
  ef_date: string | null;
  ls_date: string | null;
  lf_date: string | null;
  total_float_days: number | null;
  free_float_days: number | null;
  is_critical: boolean;
  schedule_version: number;
}

export interface TaskRepository {
  listByProject(projectId: number): Promise<TaskRow[]>;
  listProject(projectId: number): Promise<TaskRow[]>;
  getById(id: number): Promise<TaskRow | null>;
  create(data: CreateTaskData): Promise<TaskRow | null>;
  update(id: number, patch: UpdateTaskPatch): Promise<TaskRow | null>;
  softDelete(id: number): Promise<boolean>;
  setParent(id: number, parentTaskId: number | null, sortOrder: number): Promise<void>;
  updateScheduleFields(id: number, fields: ScheduleFields): Promise<void>;
}

const TASK_SELECT = `SELECT task_id, project_id, parent_task_id, calendar_id, code, name, description, task_type,
       start_date, finish_date, duration_days, progress_percent, status, priority, pic_nip, pic_name, is_milestone,
       es_date, ef_date, ls_date, lf_date, total_float_days, free_float_days, is_critical,
       schedule_version, sort_order, created_at, updated_at
FROM pm.project_tasks`;

const UPDATE_COLUMNS: Record<keyof UpdateTaskPatch, string> = {
  parent_task_id: "parent_task_id",
  code: "code",
  name: "name",
  description: "description",
  task_type: "task_type",
  start_date: "start_date",
  finish_date: "finish_date",
  duration_days: "duration_days",
  progress_percent: "progress_percent",
  status: "status",
  priority: "priority",
  pic_nip: "pic_nip",
  pic_name: "pic_name",
  is_milestone: "is_milestone",
  calendar_id: "calendar_id",
  sort_order: "sort_order",
};

export async function listByProject(exec: Exec, projectId: number): Promise<TaskRow[]> {
  return exec(
    `${TASK_SELECT} WHERE project_id = @projectId AND is_deleted = 0 ORDER BY sort_order, task_id`,
    { projectId },
  );
}

/** Scheduling/baseline read: same active set, kept as a named export for engine call sites. */
export const listProject = listByProject;

export async function getById(exec: Exec, id: number): Promise<TaskRow | null> {
  const rows = await exec(`${TASK_SELECT} WHERE task_id = @id AND is_deleted = 0`, { id });
  return (rows[0] as TaskRow | undefined) ?? null;
}

export async function create(exec: Exec, data: CreateTaskData): Promise<TaskRow | null> {
  const rows = await exec(
    `INSERT INTO pm.project_tasks
       (project_id, parent_task_id, code, name, description, task_type, start_date, finish_date, duration_days,
        progress_percent, status, priority, pic_nip, pic_name, is_milestone, calendar_id, sort_order)
     OUTPUT INSERTED.task_id
     VALUES (@project_id, @parent_task_id, @code, @name, @description, COALESCE(@task_type, 'Normal'),
             @start_date, @finish_date, @duration_days, COALESCE(@progress_percent, 0), COALESCE(@status, 'Not Started'),
             COALESCE(@priority, 'Medium'), @pic_nip, @pic_name, COALESCE(@is_milestone, 0), @calendar_id, COALESCE(@sort_order, 0))`,
    {
      project_id: data.project_id,
      parent_task_id: data.parent_task_id ?? null,
      code: data.code ?? null,
      name: data.name,
      description: data.description ?? null,
      task_type: data.task_type ?? null,
      start_date: data.start_date ?? null,
      finish_date: data.finish_date ?? null,
      duration_days: data.duration_days ?? null,
      progress_percent: data.progress_percent ?? null,
      status: data.status ?? null,
      priority: data.priority ?? null,
      pic_nip: data.pic_nip ?? null,
      pic_name: data.pic_name ?? null,
      is_milestone: data.is_milestone ?? null,
      calendar_id: data.calendar_id ?? null,
      sort_order: data.sort_order ?? null,
    },
  );
  const id = rows[0]?.task_id;
  return id == null ? null : getById(exec, id);
}

export async function update(exec: Exec, id: number, patch: UpdateTaskPatch): Promise<TaskRow | null> {
  const params: Record<string, unknown> = { id };
  const sets: string[] = [];
  for (const key of Object.keys(patch) as (keyof UpdateTaskPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`${UPDATE_COLUMNS[key]} = @${key}`);
    params[key] = value;
  }
  if (sets.length > 0) {
    sets.push("updated_at = SYSUTCDATETIME()");
    await exec(`UPDATE pm.project_tasks SET ${sets.join(", ")} WHERE task_id = @id AND is_deleted = 0`, params);
  }
  return getById(exec, id);
}

export async function softDelete(exec: Exec, id: number): Promise<boolean> {
  const rows = await exec(
    `UPDATE pm.project_tasks SET is_deleted = 1, updated_at = SYSUTCDATETIME()
     OUTPUT INSERTED.task_id
     WHERE task_id = @id AND is_deleted = 0`,
    { id },
  );
  return rows.length > 0;
}

export async function setParent(
  exec: Exec,
  id: number,
  parentTaskId: number | null,
  sortOrder: number,
): Promise<void> {
  await exec(
    `UPDATE pm.project_tasks SET parent_task_id = @parentTaskId, sort_order = @sortOrder, updated_at = SYSUTCDATETIME()
     WHERE task_id = @id AND is_deleted = 0`,
    { id, parentTaskId, sortOrder },
  );
}

export async function updateScheduleFields(exec: Exec, id: number, fields: ScheduleFields): Promise<void> {
  await exec(
    `UPDATE pm.project_tasks
     SET es_date = @es_date, ef_date = @ef_date, ls_date = @ls_date, lf_date = @lf_date,
         total_float_days = @total_float_days, free_float_days = @free_float_days,
         is_critical = @is_critical, schedule_version = @schedule_version, updated_at = SYSUTCDATETIME()
     WHERE task_id = @id AND is_deleted = 0`,
    { id, ...fields },
  );
}

export function createTaskRepository(exec: Exec): TaskRepository {
  return {
    listByProject: (projectId) => listByProject(exec, projectId),
    listProject: (projectId) => listProject(exec, projectId),
    getById: (id) => getById(exec, id),
    create: (data) => create(exec, data),
    update: (id, patch) => update(exec, id, patch),
    softDelete: (id) => softDelete(exec, id),
    setParent: (id, parentTaskId, sortOrder) => setParent(exec, id, parentTaskId, sortOrder),
    updateScheduleFields: (id, fields) => updateScheduleFields(exec, id, fields),
  };
}
