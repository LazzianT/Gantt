import type { TaskRow } from "../tasks/tasks.repository.js";

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

/** Rollup returns the task plus the actual dates the base TaskRow does not select. */
export type ProgressRollupTask = TaskRow & {
  actual_start: Date | string | null;
  actual_finish: Date | string | null;
};

export interface ProgressRow {
  progress_id: number;
  task_id: number;
  report_date: Date | string;
  progress_percent: number;
  actual_start: Date | string | null;
  actual_finish: Date | string | null;
  note: string | null;
  reported_by_nip: string | null;
  created_at: Date | string;
}

export interface InsertProgressData {
  task_id: number;
  report_date: string;
  progress_percent: number;
  actual_start?: string | null;
  actual_finish?: string | null;
  note?: string | null;
  reported_by_nip?: string | null;
}

const SELECT = `SELECT progress_id, task_id, report_date, progress_percent, actual_start, actual_finish,
       note, reported_by_nip, created_at
FROM pm.task_progress`;

export async function insertProgress(exec: Exec, data: InsertProgressData): Promise<ProgressRow | null> {
  const rows = await exec(
    `INSERT INTO pm.task_progress
       (task_id, report_date, progress_percent, actual_start, actual_finish, note, reported_by_nip)
     OUTPUT INSERTED.progress_id, INSERTED.task_id, INSERTED.report_date, INSERTED.progress_percent,
            INSERTED.actual_start, INSERTED.actual_finish, INSERTED.note, INSERTED.reported_by_nip,
            INSERTED.created_at
     VALUES (@task_id, @report_date, @progress_percent, @actual_start, @actual_finish, @note, @reported_by_nip)`,
    {
      task_id: data.task_id,
      report_date: data.report_date,
      progress_percent: data.progress_percent,
      actual_start: data.actual_start ?? null,
      actual_finish: data.actual_finish ?? null,
      note: data.note ?? null,
      reported_by_nip: data.reported_by_nip ?? null,
    },
  );
  return (rows[0] as ProgressRow | undefined) ?? null;
}

export async function listByTask(exec: Exec, taskId: number): Promise<ProgressRow[]> {
  return exec(`${SELECT} WHERE task_id = @taskId ORDER BY report_date DESC, progress_id DESC`, { taskId });
}

/**
 * Rolls the latest report up onto the task. At 100% the task is Completed and
 * actual_finish falls back to reported finish, then task finish_date, then report date.
 */
export async function updateTaskProgressRollup(exec: Exec, taskId: number): Promise<ProgressRollupTask | null> {
  const rows = await exec(
    `UPDATE t
     SET progress_percent = latest.pct,
         actual_finish = CASE WHEN latest.pct >= 100
                              THEN COALESCE(latest.latest_finish, t.finish_date, latest.latest_report)
                              ELSE t.actual_finish END,
         status = CASE WHEN latest.pct >= 100 THEN 'Completed' ELSE t.status END,
         updated_at = SYSUTCDATETIME()
     OUTPUT INSERTED.task_id, INSERTED.project_id, INSERTED.parent_task_id, INSERTED.calendar_id,
            INSERTED.code, INSERTED.name, INSERTED.description, INSERTED.task_type, INSERTED.start_date,
            INSERTED.finish_date, INSERTED.duration_days, INSERTED.progress_percent, INSERTED.status,
            INSERTED.priority, INSERTED.is_milestone, INSERTED.es_date, INSERTED.ef_date, INSERTED.ls_date,
            INSERTED.lf_date, INSERTED.total_float_days, INSERTED.free_float_days, INSERTED.is_critical,
            INSERTED.schedule_version, INSERTED.sort_order, INSERTED.created_at, INSERTED.updated_at,
            INSERTED.actual_start, INSERTED.actual_finish
     FROM pm.project_tasks t
     CROSS APPLY (
       SELECT TOP 1 progress_percent AS pct, actual_finish AS latest_finish, report_date AS latest_report
       FROM pm.task_progress WHERE task_id = @taskId
       ORDER BY report_date DESC, progress_id DESC
     ) latest
     WHERE t.task_id = @taskId AND t.is_deleted = 0`,
    { taskId },
  );
  return (rows[0] as ProgressRollupTask | undefined) ?? null;
}
