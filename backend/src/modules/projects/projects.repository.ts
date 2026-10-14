export const PROJECT_STATUSES = ["Planning", "Active", "On Hold", "Completed", "Cancelled"] as const;
export const PROJECT_HEALTHS = ["On Track", "At Risk", "Delayed", "Critical"] as const;
export const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Health = (typeof PROJECT_HEALTHS)[number];
export type Priority = (typeof PROJECT_PRIORITIES)[number];

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface ProjectRow {
  project_id: number;
  code: string;
  name: string;
  description: string | null;
  manager_nip: string | null;
  manager_name: string | null;
  start_date: Date | string | null;
  target_end_date: Date | string | null;
  priority: Priority;
  status: ProjectStatus;
  health: Health;
  calendar_id: number | null;
  schedule_version: number;
  created_at: Date | string;
  updated_at: Date | string;
  task_count: number;
  done_count: number;
  total_duration: number;
  done_duration: number;
}

export interface MemberRow {
  member_id: number;
  project_id: number;
  employee_nip: string;
  employee_name: string;
  role: string | null;
  allocation_percent: number;
  joined_at: Date | string;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  health?: Health;
  q?: string;
}

export interface CreateProjectData {
  code: string;
  name: string;
  description?: string | null;
  manager_nip?: string | null;
  manager_name?: string | null;
  start_date?: string | null;
  target_end_date?: string | null;
  priority?: Priority;
  status?: ProjectStatus;
  health?: Health;
  calendar_id?: number | null;
}

export type UpdateProjectPatch = Partial<CreateProjectData>;

export interface AddMemberData {
  employee_nip: string;
  employee_name: string;
  role?: string | null;
  allocation_percent?: number | null;
}

const PROJECT_SELECT = `SELECT p.project_id, p.code, p.name, p.description, p.manager_nip, p.manager_name,
       p.start_date, p.target_end_date, p.priority, p.status, p.health, p.calendar_id,
       p.schedule_version, p.created_at, p.updated_at,
       COUNT(t.task_id) AS task_count,
       COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END), 0) AS done_count,
       COALESCE(SUM(t.duration_days), 0) AS total_duration,
       COALESCE(SUM(t.duration_days * t.progress_percent / 100.0), 0) AS done_duration
FROM pm.projects p
LEFT JOIN pm.project_tasks t ON t.project_id = p.project_id AND t.is_deleted = 0`;

const PROJECT_GROUP = `GROUP BY p.project_id, p.code, p.name, p.description, p.manager_nip, p.manager_name,
       p.start_date, p.target_end_date, p.priority, p.status, p.health, p.calendar_id,
       p.schedule_version, p.created_at, p.updated_at`;

const UPDATE_COLUMNS: Record<keyof CreateProjectData, string> = {
  code: "code",
  name: "name",
  description: "description",
  manager_nip: "manager_nip",
  manager_name: "manager_name",
  start_date: "start_date",
  target_end_date: "target_end_date",
  priority: "priority",
  status: "status",
  health: "health",
  calendar_id: "calendar_id",
};

export async function listProjects(exec: Exec, filters: ProjectFilters = {}): Promise<ProjectRow[]> {
  const where = ["p.is_deleted = 0"];
  const params: Record<string, unknown> = {};
  if (filters.status) {
    where.push("p.status = @status");
    params.status = filters.status;
  }
  if (filters.health) {
    where.push("p.health = @health");
    params.health = filters.health;
  }
  if (filters.q) {
    where.push("(p.code LIKE @q OR p.name LIKE @q OR p.manager_name LIKE @q)");
    params.q = `%${filters.q}%`;
  }
  return exec(`${PROJECT_SELECT} WHERE ${where.join(" AND ")} ${PROJECT_GROUP} ORDER BY p.created_at DESC`, params);
}

export async function listMemberProjects(exec: Exec, nip: string): Promise<ProjectRow[]> {
  return exec(
    `${PROJECT_SELECT}
     INNER JOIN pm.project_members m ON m.project_id = p.project_id AND m.employee_nip = @nip
     WHERE p.is_deleted = 0 ${PROJECT_GROUP} ORDER BY p.created_at DESC`,
    { nip },
  );
}

export async function getProject(exec: Exec, projectId: number): Promise<ProjectRow | null> {
  const rows = await exec(
    `${PROJECT_SELECT} WHERE p.project_id = @projectId AND p.is_deleted = 0 ${PROJECT_GROUP}`,
    { projectId },
  );
  return (rows[0] as ProjectRow | undefined) ?? null;
}

export async function codeExists(exec: Exec, code: string): Promise<boolean> {
  const rows = await exec(`SELECT project_id FROM pm.projects WHERE code = @code`, { code });
  return rows.length > 0;
}

/** Existing project codes that start with the given prefix (used to allocate the next code). */
export async function codesWithPrefix(exec: Exec, prefix: string): Promise<string[]> {
  const rows = await exec(`SELECT code FROM pm.projects WHERE code LIKE @prefix`, { prefix: `${prefix}%` });
  return rows.map((row) => String(row.code));
}

export async function createProject(exec: Exec, data: CreateProjectData): Promise<ProjectRow | null> {
  const rows = await exec(
    `INSERT INTO pm.projects
       (code, name, description, manager_nip, manager_name, start_date, target_end_date, priority, status, health, calendar_id)
     OUTPUT INSERTED.project_id
     VALUES (@code, @name, @description, @manager_nip, @manager_name, @start_date, @target_end_date,
             COALESCE(@priority, 'Medium'), COALESCE(@status, 'Planning'), COALESCE(@health, 'On Track'), @calendar_id)`,
    {
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      manager_nip: data.manager_nip ?? null,
      manager_name: data.manager_name ?? null,
      start_date: data.start_date ?? null,
      target_end_date: data.target_end_date ?? null,
      priority: data.priority ?? null,
      status: data.status ?? null,
      health: data.health ?? null,
      calendar_id: data.calendar_id ?? null,
    },
  );
  const id = rows[0]?.project_id;
  return id == null ? null : getProject(exec, id);
}

export async function updateProject(
  exec: Exec,
  projectId: number,
  patch: UpdateProjectPatch,
): Promise<ProjectRow | null> {
  const params: Record<string, unknown> = { projectId };
  const sets: string[] = [];
  for (const key of Object.keys(patch) as (keyof CreateProjectData)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`${UPDATE_COLUMNS[key]} = @${key}`);
    params[key] = value;
  }
  if (sets.length > 0) {
    sets.push("updated_at = SYSUTCDATETIME()");
    await exec(`UPDATE pm.projects SET ${sets.join(", ")} WHERE project_id = @projectId AND is_deleted = 0`, params);
  }
  return getProject(exec, projectId);
}

export async function softDeleteProject(exec: Exec, projectId: number): Promise<boolean> {
  const rows = await exec(
    `UPDATE pm.projects SET is_deleted = 1, updated_at = SYSUTCDATETIME()
     OUTPUT INSERTED.project_id
     WHERE project_id = @projectId AND is_deleted = 0`,
    { projectId },
  );
  return rows.length > 0;
}

/** Increments and returns the project schedule version after a successful recalc. */
export async function bumpScheduleVersion(exec: Exec, projectId: number): Promise<number> {
  const rows = await exec(
    `UPDATE pm.projects SET schedule_version = schedule_version + 1, updated_at = SYSUTCDATETIME()
     OUTPUT INSERTED.schedule_version
     WHERE project_id = @projectId AND is_deleted = 0`,
    { projectId },
  );
  return Number(rows[0]?.schedule_version ?? 0);
}

export async function listMembers(exec: Exec, projectId: number): Promise<MemberRow[]> {
  return exec(
    `SELECT member_id, project_id, employee_nip, employee_name, role, allocation_percent, joined_at
     FROM pm.project_members
     WHERE project_id = @projectId
     ORDER BY member_id`,
    { projectId },
  );
}

export async function findMember(exec: Exec, projectId: number, nip: string): Promise<MemberRow | null> {
  const rows = await exec(
    `SELECT member_id, project_id, employee_nip, employee_name, role, allocation_percent, joined_at
     FROM pm.project_members
     WHERE project_id = @projectId AND employee_nip = @nip`,
    { projectId, nip },
  );
  return (rows[0] as MemberRow | undefined) ?? null;
}

export async function addMember(exec: Exec, projectId: number, data: AddMemberData): Promise<MemberRow> {
  const rows = await exec(
    `INSERT INTO pm.project_members (project_id, employee_nip, employee_name, role, allocation_percent)
     OUTPUT INSERTED.member_id, INSERTED.project_id, INSERTED.employee_nip, INSERTED.employee_name,
            INSERTED.role, INSERTED.allocation_percent, INSERTED.joined_at
     VALUES (@projectId, @employee_nip, @employee_name, @role, COALESCE(@allocation_percent, 100))`,
    {
      projectId,
      employee_nip: data.employee_nip,
      employee_name: data.employee_name,
      role: data.role ?? null,
      allocation_percent: data.allocation_percent ?? null,
    },
  );
  return rows[0] as MemberRow;
}

/** Idempotent add-only insert. Existing rows keep their role and allocation; a duplicate
 *  (project_id, employee_nip) is a no-op thanks to UQ_pm_project_members. */
export async function ensureMember(
  exec: Exec,
  projectId: number,
  data: { employee_nip: string; employee_name: string },
): Promise<boolean> {
  const rows = await exec(
    `INSERT INTO pm.project_members (project_id, employee_nip, employee_name, role, allocation_percent)
     OUTPUT INSERTED.member_id
     SELECT @projectId, @employee_nip, @employee_name, NULL, 100
     WHERE NOT EXISTS (
       SELECT 1 FROM pm.project_members WHERE project_id = @projectId AND employee_nip = @employee_nip
     )`,
    { projectId, employee_nip: data.employee_nip, employee_name: data.employee_name },
  );
  return rows.length > 0;
}

export async function removeMember(exec: Exec, projectId: number, memberId: number): Promise<boolean> {
  const rows = await exec(
    `DELETE FROM pm.project_members
     OUTPUT DELETED.member_id
     WHERE member_id = @memberId AND project_id = @projectId`,
    { memberId, projectId },
  );
  return rows.length > 0;
}
