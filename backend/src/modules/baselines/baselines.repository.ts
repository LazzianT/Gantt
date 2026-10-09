/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface BaselineRow {
  baseline_id: number;
  project_id: number;
  name: string;
  captured_at: Date | string;
  captured_by_nip: string | null;
}

export interface BaselineWithCount extends BaselineRow {
  task_count: number;
}

export interface BaselineTaskRow {
  baseline_task_id: number;
  baseline_id: number;
  task_id: number;
  task_name: string | null;
  start_date: Date | string | null;
  finish_date: Date | string | null;
  duration_days: number | null;
}

export interface CurrentTaskRow {
  task_id: number;
  name: string;
  start_date: Date | string | null;
  finish_date: Date | string | null;
  duration_days: number | null;
}

const BASELINE_SELECT = `SELECT baseline_id, project_id, name, captured_at, captured_by_nip
FROM pm.project_baselines`;

export async function createBaseline(
  exec: Exec,
  projectId: number,
  name: string,
  capturedBy: string | null,
): Promise<BaselineWithCount | null> {
  const created = await exec(
    `INSERT INTO pm.project_baselines (project_id, name, captured_by_nip)
     OUTPUT INSERTED.baseline_id, INSERTED.project_id, INSERTED.name, INSERTED.captured_at, INSERTED.captured_by_nip
     VALUES (@projectId, @name, @capturedBy)`,
    { projectId, name, capturedBy },
  );
  const baseline = created[0] as BaselineRow | undefined;
  if (!baseline) return null;

  const snapshot = await exec(
    `INSERT INTO pm.project_baseline_tasks (baseline_id, task_id, start_date, finish_date, duration_days)
     OUTPUT INSERTED.baseline_task_id
     SELECT @baselineId, task_id, start_date, finish_date, duration_days
     FROM pm.project_tasks WHERE project_id = @projectId AND is_deleted = 0`,
    { baselineId: baseline.baseline_id, projectId },
  );
  return { ...baseline, task_count: snapshot.length };
}

export async function listBaselines(exec: Exec, projectId: number): Promise<BaselineRow[]> {
  return exec(`${BASELINE_SELECT} WHERE project_id = @projectId ORDER BY captured_at DESC, baseline_id DESC`, {
    projectId,
  });
}

export async function getBaseline(exec: Exec, baselineId: number): Promise<BaselineRow | null> {
  const rows = await exec(`${BASELINE_SELECT} WHERE baseline_id = @baselineId`, { baselineId });
  return (rows[0] as BaselineRow | undefined) ?? null;
}

export async function getBaselineTasks(exec: Exec, baselineId: number): Promise<BaselineTaskRow[]> {
  return exec(
    `SELECT bt.baseline_task_id, bt.baseline_id, bt.task_id, t.name AS task_name,
            bt.start_date, bt.finish_date, bt.duration_days
     FROM pm.project_baseline_tasks bt
     LEFT JOIN pm.project_tasks t ON t.task_id = bt.task_id
     WHERE bt.baseline_id = @baselineId
     ORDER BY bt.baseline_task_id`,
    { baselineId },
  );
}

export async function getCurrentTasks(exec: Exec, projectId: number): Promise<CurrentTaskRow[]> {
  return exec(
    `SELECT task_id, name, start_date, finish_date, duration_days
     FROM pm.project_tasks WHERE project_id = @projectId AND is_deleted = 0`,
    { projectId },
  );
}
