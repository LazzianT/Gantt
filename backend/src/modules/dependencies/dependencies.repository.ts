export const DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface DependencyRow {
  dependency_id: number;
  project_id: number;
  predecessor_task_id: number;
  successor_task_id: number;
  dependency_type: DependencyType;
  lag_days: number;
  is_active: boolean;
  created_at: Date | string;
}

export interface CreateDependencyData {
  project_id: number;
  predecessor_task_id: number;
  successor_task_id: number;
  dependency_type: DependencyType;
  lag_days: number;
}

const DEP_SELECT = `SELECT dependency_id, project_id, predecessor_task_id, successor_task_id,
       dependency_type, lag_days, is_active, created_at
FROM pm.task_dependencies`;

export async function listByProject(exec: Exec, projectId: number): Promise<DependencyRow[]> {
  return exec(`${DEP_SELECT} WHERE project_id = @projectId AND is_active = 1 ORDER BY dependency_id`, {
    projectId,
  });
}

export async function listByTask(exec: Exec, taskId: number): Promise<DependencyRow[]> {
  return exec(
    `${DEP_SELECT} WHERE (predecessor_task_id = @taskId OR successor_task_id = @taskId) AND is_active = 1
     ORDER BY dependency_id`,
    { taskId },
  );
}

export async function create(exec: Exec, data: CreateDependencyData): Promise<DependencyRow | null> {
  const rows = await exec(
    `INSERT INTO pm.task_dependencies
       (project_id, predecessor_task_id, successor_task_id, dependency_type, lag_days)
     OUTPUT INSERTED.dependency_id
     VALUES (@project_id, @predecessor_task_id, @successor_task_id, @dependency_type, @lag_days)`,
    { ...data },
  );
  const id = rows[0]?.dependency_id;
  if (id == null) return null;
  const created = await exec(`${DEP_SELECT} WHERE dependency_id = @id AND is_active = 1`, { id });
  return (created[0] as DependencyRow | undefined) ?? null;
}

/** Hard-deletes an active edge; returns its project_id so the caller can reschedule. */
export async function remove(exec: Exec, id: number): Promise<number | null> {
  const rows = await exec(
    `DELETE FROM pm.task_dependencies
     OUTPUT DELETED.project_id
     WHERE dependency_id = @id AND is_active = 1`,
    { id },
  );
  return rows.length > 0 ? Number(rows[0].project_id) : null;
}
