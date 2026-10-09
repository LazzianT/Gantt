export const RESOURCE_TYPES = ["Employee", "Equipment"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface ProjectResourceRow {
  resource_id: number;
  project_id: number;
  employee_nip: string | null;
  employee_name: string | null;
  department_name: string | null;
  position_name: string | null;
  email: string | null;
  resource_name: string;
  resource_type: ResourceType;
  unit: string | null;
  max_units: number;
}

export interface AddProjectResourceData {
  employee_nip?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  position_name?: string | null;
  email?: string | null;
  resource_name: string;
  resource_type: ResourceType;
  unit?: string | null;
  max_units?: number | null;
}

export interface TaskResourceRow {
  task_resource_id: number;
  task_id: number;
  resource_id: number;
  allocation_percent: number;
  planned_hours: number | null;
  resource_name: string;
  resource_type: ResourceType;
  employee_nip: string | null;
  employee_name: string | null;
  max_units: number;
}

export interface AssignTaskResourceData {
  resource_id: number;
  allocation_percent?: number | null;
  planned_hours?: number | null;
}

/** task_resources joined to project_tasks + project_resources for the workload read-model. */
export interface AssignmentRow {
  task_resource_id: number;
  task_id: number;
  resource_id: number;
  project_id: number;
  allocation_percent: number;
  planned_hours: number | null;
  employee_nip: string | null;
  employee_name: string | null;
  resource_name: string;
  max_units: number;
  calendar_id: number | null;
  start_date: Date | string | null;
  finish_date: Date | string | null;
}

const RESOURCE_SELECT = `SELECT resource_id, project_id, employee_nip, employee_name, department_name,
       position_name, email, resource_name, resource_type, unit, max_units
FROM pm.project_resources`;

const ASSIGNMENT_SELECT = `SELECT tr.task_resource_id, tr.task_id, tr.resource_id, tr.allocation_percent, tr.planned_hours,
       pr.employee_nip, pr.employee_name, pr.resource_name, pr.max_units,
       t.project_id, t.calendar_id, t.start_date, t.finish_date
FROM pm.task_resources tr
JOIN pm.project_tasks t ON t.task_id = tr.task_id
JOIN pm.project_resources pr ON pr.resource_id = tr.resource_id`;

export async function listProjectResources(exec: Exec, projectId: number): Promise<ProjectResourceRow[]> {
  return exec(`${RESOURCE_SELECT} WHERE project_id = @projectId AND is_deleted = 0 ORDER BY resource_id`, {
    projectId,
  });
}

async function getProjectResource(exec: Exec, id: number): Promise<ProjectResourceRow | null> {
  const rows = await exec(`${RESOURCE_SELECT} WHERE resource_id = @id AND is_deleted = 0`, { id });
  return (rows[0] as ProjectResourceRow | undefined) ?? null;
}

export async function addProjectResource(
  exec: Exec,
  projectId: number,
  data: AddProjectResourceData,
): Promise<ProjectResourceRow | null> {
  const rows = await exec(
    `INSERT INTO pm.project_resources
       (project_id, employee_nip, employee_name, department_name, position_name, email, snapshot_at,
        resource_name, resource_type, unit, max_units)
     OUTPUT INSERTED.resource_id
     VALUES (@projectId, @employee_nip, @employee_name, @department_name, @position_name, @email,
             CASE WHEN @employee_nip IS NULL THEN NULL ELSE SYSUTCDATETIME() END,
             @resource_name, @resource_type, @unit, COALESCE(@max_units, 1))`,
    {
      projectId,
      employee_nip: data.employee_nip ?? null,
      employee_name: data.employee_name ?? null,
      department_name: data.department_name ?? null,
      position_name: data.position_name ?? null,
      email: data.email ?? null,
      resource_name: data.resource_name,
      resource_type: data.resource_type,
      unit: data.unit ?? null,
      max_units: data.max_units ?? null,
    },
  );
  const id = rows[0]?.resource_id;
  return id == null ? null : getProjectResource(exec, id);
}

export async function removeProjectResource(exec: Exec, id: number): Promise<boolean> {
  const rows = await exec(
    `UPDATE pm.project_resources SET is_deleted = 1
     OUTPUT INSERTED.resource_id
     WHERE resource_id = @id AND is_deleted = 0`,
    { id },
  );
  return rows.length > 0;
}

export async function listTaskResources(exec: Exec, taskId: number): Promise<TaskResourceRow[]> {
  return exec(
    `SELECT tr.task_resource_id, tr.task_id, tr.resource_id, tr.allocation_percent, tr.planned_hours,
            pr.resource_name, pr.resource_type, pr.employee_nip, pr.employee_name, pr.max_units
     FROM pm.task_resources tr
     JOIN pm.project_resources pr ON pr.resource_id = tr.resource_id
     WHERE tr.task_id = @taskId
     ORDER BY tr.task_resource_id`,
    { taskId },
  );
}

export async function assignTaskResource(
  exec: Exec,
  taskId: number,
  data: AssignTaskResourceData,
): Promise<TaskResourceRow | null> {
  const rows = await exec(
    `INSERT INTO pm.task_resources (task_id, resource_id, allocation_percent, planned_hours)
     OUTPUT INSERTED.task_resource_id
     VALUES (@taskId, @resource_id, COALESCE(@allocation_percent, 100), @planned_hours)`,
    {
      taskId,
      resource_id: data.resource_id,
      allocation_percent: data.allocation_percent ?? null,
      planned_hours: data.planned_hours ?? null,
    },
  );
  const id = rows[0]?.task_resource_id;
  if (id == null) return null;
  const list = await listTaskResources(exec, taskId);
  return list.find((r) => Number(r.task_resource_id) === Number(id)) ?? null;
}

export async function unassignTaskResource(exec: Exec, id: number): Promise<boolean> {
  const rows = await exec(
    `DELETE FROM pm.task_resources
     OUTPUT DELETED.task_resource_id
     WHERE task_resource_id = @id`,
    { id },
  );
  return rows.length > 0;
}

export async function listAssignmentsForProject(exec: Exec, projectId: number): Promise<AssignmentRow[]> {
  return exec(
    `${ASSIGNMENT_SELECT}
     WHERE t.project_id = @projectId AND t.is_deleted = 0 AND pr.is_deleted = 0
     ORDER BY pr.employee_nip, t.start_date, tr.task_resource_id`,
    { projectId },
  );
}

/** Cross-project workload needs the employee's assignments without a project scope. */
export async function listAssignmentsForEmployee(exec: Exec, employeeNip: string): Promise<AssignmentRow[]> {
  return exec(
    `${ASSIGNMENT_SELECT}
     WHERE pr.employee_nip = @employeeNip AND t.is_deleted = 0 AND pr.is_deleted = 0
     ORDER BY t.project_id, t.start_date, tr.task_resource_id`,
    { employeeNip },
  );
}
