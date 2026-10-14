export const TASK_TYPES = ["Summary", "Normal", "Milestone"] as const;
export const TASK_STATUSES = ["Not Started", "In Progress", "Completed", "Blocked", "Cancelled"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

/** Manager review state of an as-built finish date. NULL when no date has been submitted. */
export type ActualFinishStatus = "Pending" | "Approved" | "Rejected";

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
  /** As-built dates, distinct from the planned schedule above. Added in 016. */
  actual_start: Date | string | null;
  actual_finish: Date | string | null;
  /** Manager review state for `actual_finish`. Added in 017. */
  actual_finish_status: ActualFinishStatus | null;
  actual_finish_submitted_by: string | null;
  actual_finish_submitted_at: Date | string | null;
  actual_finish_reviewed_by: string | null;
  actual_finish_reviewed_at: Date | string | null;
  actual_finish_comment: string | null;
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
setCompletion(id: number, completed: boolean, actualFinish: string | null, submittedBy: string): Promise<TaskRow | null>;
reviewActualFinish(id: number, decision: "Approved" | "Rejected", reviewer: string, comment: string | null): Promise<TaskRow | null>;
listFinishReviews(projectId: number, status?: ActualFinishStatus | null): Promise<FinishReviewRow[]>;
/** Raw runner, exposed so services can write to sibling tables (activity log) in the same request. */
exec: Exec;
}

const TASK_SELECT = `SELECT task_id, project_id, parent_task_id, calendar_id, code, name, description, task_type,
       start_date, finish_date, duration_days, progress_percent, status, priority, pic_nip, pic_name, is_milestone,
       es_date, ef_date, ls_date, lf_date, total_float_days, free_float_days, is_critical,
       actual_start, actual_finish, actual_finish_status, actual_finish_submitted_by, actual_finish_submitted_at,
       actual_finish_reviewed_by, actual_finish_reviewed_at, actual_finish_comment,
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
  if (patch.pic_nip) {
    await exec(
      `INSERT INTO pm.project_members (project_id, employee_nip, employee_name, role, allocation_percent)
       SELECT project_id, @pic_nip, COALESCE(@pic_name, @pic_nip), NULL, 100
       FROM pm.project_tasks
       WHERE task_id = @id AND is_deleted = 0
         AND NOT EXISTS (
           SELECT 1 FROM pm.project_members
           WHERE project_id = pm.project_tasks.project_id AND employee_nip = @pic_nip
         )`,
      { id, pic_nip: patch.pic_nip, pic_name: patch.pic_name ?? patch.pic_nip },
    );
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

/** Owning project of a task, or null when the task does not exist / is deleted. */
export async function projectIdOfTask(exec: Exec, id: number): Promise<number | null> {
  const rows = await exec(
    `SELECT project_id FROM pm.project_tasks WHERE task_id = @id AND is_deleted = 0`,
    { id },
  );
  const projectId = (rows[0] as { project_id?: number } | undefined)?.project_id;
  return projectId == null ? null : Number(projectId);
}

/**
 * Completion toggle for "My Tasks". Completing pins progress at 100, stamps the as-built finish
 * date, and parks it as `Pending` until a manager reviews it. Reopening clears the as-built data
 * and returns the task to In Progress at 0 progress.
 */
export async function setCompletion(
  exec: Exec,
  id: number,
  completed: boolean,
  actualFinish: string | null,
  submittedBy: string,
): Promise<TaskRow | null> {
  await exec(
    `UPDATE pm.project_tasks
     SET status = CASE WHEN @completed = 1 THEN 'Completed' ELSE 'In Progress' END,
         progress_percent = CASE WHEN @completed = 1 THEN 100 ELSE 0 END,
         actual_finish = CASE WHEN @completed = 1 THEN @actual_finish ELSE NULL END,
         actual_finish_status = CASE WHEN @completed = 1 THEN 'Pending' ELSE NULL END,
         actual_finish_submitted_by = CASE WHEN @completed = 1 THEN @submitted_by ELSE NULL END,
         actual_finish_submitted_at = CASE WHEN @completed = 1 THEN SYSUTCDATETIME() ELSE NULL END,
         actual_finish_reviewed_by = NULL,
         actual_finish_reviewed_at = NULL,
         actual_finish_comment = NULL,
         updated_at = SYSUTCDATETIME()
     WHERE task_id = @id AND is_deleted = 0`,
    { id, completed: completed ? 1 : 0, actual_finish: actualFinish, submitted_by: submittedBy },
  );
  return getById(exec, id);
}

/**
 * Records a manager's decision on a submitted as-built finish date. Rejecting also rolls the
 * task back to In Progress so the completion itself has to be re-submitted with a valid date.
 */
export async function reviewActualFinish(
  exec: Exec,
  id: number,
  decision: "Approved" | "Rejected",
  reviewer: string,
  comment: string | null,
): Promise<TaskRow | null> {
  await exec(
    `UPDATE pm.project_tasks
     SET actual_finish_status = @decision,
         actual_finish_reviewed_by = @reviewer,
         actual_finish_reviewed_at = SYSUTCDATETIME(),
         actual_finish_comment = @comment,
         status = CASE WHEN @decision = 'Rejected' THEN 'In Progress' ELSE status END,
         progress_percent = CASE WHEN @decision = 'Rejected' THEN 0 ELSE progress_percent END,
         actual_finish = CASE WHEN @decision = 'Rejected' THEN NULL ELSE actual_finish END,
         updated_at = SYSUTCDATETIME()
     WHERE task_id = @id AND is_deleted = 0 AND actual_finish_status = 'Pending'`,
    { id, decision, reviewer, comment },
  );
  return getById(exec, id);
}

export interface FinishReviewRow {
  task_id: number;
  name: string;
  pic_nip: string | null;
  pic_name: string | null;
  planned_finish: Date | string | null;
  actual_finish: Date | string | null;
  actual_finish_status: ActualFinishStatus;
  actual_finish_submitted_by: string | null;
  actual_finish_submitted_at: Date | string | null;
  actual_finish_comment: string | null;
}

/** Manager queue for one project: every submitted as-built date that still needs a decision. */
export async function listFinishReviews(
  exec: Exec,
  projectId: number,
  status: ActualFinishStatus | null = null,
): Promise<FinishReviewRow[]> {
  return exec(
    `SELECT task_id, name, pic_nip, pic_name, finish_date AS planned_finish, actual_finish,
            actual_finish_status, actual_finish_submitted_by, actual_finish_submitted_at, actual_finish_comment
     FROM pm.project_tasks
     WHERE project_id = @projectId AND is_deleted = 0 AND actual_finish_status IS NOT NULL
       AND (@status IS NULL OR actual_finish_status = @status)
     ORDER BY CASE actual_finish_status WHEN 'Pending' THEN 0 ELSE 1 END,
              actual_finish_submitted_at DESC, task_id ASC`,
    { projectId, status },
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
    setCompletion: (id, completed, actualFinish, submittedBy) => setCompletion(exec, id, completed, actualFinish, submittedBy),
    reviewActualFinish: (id, decision, reviewer, comment) => reviewActualFinish(exec, id, decision, reviewer, comment),
    listFinishReviews: (projectId, status) => listFinishReviews(exec, projectId, status ?? null),
    exec,
  };
}
