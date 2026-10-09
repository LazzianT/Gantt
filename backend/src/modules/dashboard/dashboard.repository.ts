import type { Health, ProjectStatus } from "../projects/projects.repository.js";

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

/**
 * Visibility scope for the global dashboard. `seeAll` is granted to admin/manager
 * roles; everyone else only sees projects they are a member of.
 */
export interface DashboardScope {
  nip: string;
  seeAll: boolean;
}

/**
 * Builds an `AND EXISTS (...)` fragment restricting a query to the user's projects.
 * `alias` is the `pm.projects` alias in the enclosing query. Unfiltered when `seeAll`.
 */
function memberScope(scope: DashboardScope, alias: string): { clause: string; params: Record<string, unknown> } {
  if (scope.seeAll) return { clause: "", params: {} };
  return {
    clause: `AND EXISTS (SELECT 1 FROM pm.project_members m
                          WHERE m.project_id = ${alias}.project_id AND m.employee_nip = @nip)`,
    params: { nip: scope.nip },
  };
}

export interface PortfolioFilters {
  status?: ProjectStatus;
  health?: Health;
  q?: string;
}

export interface PortfolioRow {
  project_id: number;
  code: string;
  name: string;
  manager_name: string | null;
  status: ProjectStatus;
  health: Health;
  start_date: Date | string | null;
  target_end_date: Date | string | null;
  task_count: number;
  done_count: number;
  overdue_count: number;
  critical_count: number;
  team_size: number;
  total_duration: number;
  done_duration: number;
  current_finish: Date | string | null;
  baseline_finish: Date | string | null;
}

export interface ProjectRow {
  project_id: number;
  code: string;
  name: string;
  manager_name: string | null;
  status: ProjectStatus;
  health: Health;
  start_date: Date | string | null;
  target_end_date: Date | string | null;
  current_finish: Date | string | null;
  baseline_finish: Date | string | null;
}

export interface TaskRollupRow {
  task_id: number;
  name: string;
  duration_days: number | null;
  progress_percent: number;
  status: string;
  finish_date: Date | string | null;
  is_critical: boolean;
}

export interface DashboardTaskRow {
  task_id: number;
  code: string | null;
  name: string;
  finish_date: Date | string | null;
  status: string;
  progress_percent: number;
  is_critical: boolean;
}

export interface DashboardMilestoneRow {
  milestone_id: number;
  task_id: number | null;
  name: string;
  due_date: Date | string | null;
  status: string;
}

export interface WorkloadRow {
  employee_nip: string;
  allocation: number;
}

export interface ActivityRow {
  log_id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  actor_nip: string | null;
  detail: string | null;
  created_at: Date | string;
}

export interface ProjectCountRow {
  status: string;
  health: string;
  count: number;
}

export interface GlobalTaskCountRow {
  tasks_total: number;
  tasks_open: number;
  tasks_overdue: number;
  tasks_due_soon: number;
}

export interface GlobalSummaryRows {
  projects: ProjectCountRow[];
  tasks: GlobalTaskCountRow;
  milestones_upcoming: number;
}

export interface GlobalActivityRow {
  id: number;
  project_id: number;
  project_name: string;
  entity_type: string;
  entity_id: number | null;
  action: string;
  actor_nip: string | null;
  detail: string | null;
  created_at: Date | string;
}

export interface MyTaskRow {
  task_id: number;
  name: string;
  project_id: number;
  project_name: string;
  finish_date: Date | string | null;
  status: string;
  progress_percent: number;
  is_critical: boolean;
}

export interface GlobalMilestoneRow {
  milestone_id: number;
  name: string;
  due_date: Date | string | null;
  status: string;
  project_id: number;
  project_name: string;
}

export interface GlobalProjectRow {
  project_id: number;
  code: string;
  name: string;
  status: string;
  health: string;
  weighted_progress: number;
  target_end_date: Date | string | null;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function clampLimit(limit: number): number {
  const n = Math.trunc(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

const CURRENT_FINISH = `(SELECT MAX(t.finish_date) FROM pm.project_tasks t
       WHERE t.project_id = p.project_id AND t.is_deleted = 0)`;

const BASELINE_FINISH = `(SELECT MAX(bt.finish_date) FROM pm.project_baseline_tasks bt
       WHERE bt.baseline_id = (SELECT TOP 1 b.baseline_id FROM pm.project_baselines b
                               WHERE b.project_id = p.project_id
                               ORDER BY b.captured_at DESC, b.baseline_id DESC))`;

export async function portfolio(exec: Exec, filters: PortfolioFilters = {}): Promise<PortfolioRow[]> {
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
  return exec(
    `SELECT p.project_id, p.code, p.name, p.manager_name, p.status, p.health,
            p.start_date, p.target_end_date,
            COUNT(t.task_id) AS task_count,
            COALESCE(SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END), 0) AS done_count,
            COALESCE(SUM(CASE WHEN t.status <> 'Completed' AND t.finish_date < CAST(GETUTCDATE() AS DATE) THEN 1 ELSE 0 END), 0) AS overdue_count,
            COALESCE(SUM(CASE WHEN t.is_critical = 1 THEN 1 ELSE 0 END), 0) AS critical_count,
            COALESCE(SUM(t.duration_days), 0) AS total_duration,
            COALESCE(SUM(t.duration_days * t.progress_percent / 100.0), 0) AS done_duration,
            MAX(t.finish_date) AS current_finish,
            ts.team_size,
            ${BASELINE_FINISH} AS baseline_finish
     FROM pm.projects p
     LEFT JOIN pm.project_tasks t ON t.project_id = p.project_id AND t.is_deleted = 0
     OUTER APPLY (SELECT COUNT(*) AS team_size FROM pm.project_members m WHERE m.project_id = p.project_id) ts
     WHERE ${where.join(" AND ")}
     GROUP BY p.project_id, p.code, p.name, p.manager_name, p.status, p.health,
              p.start_date, p.target_end_date, p.created_at, ts.team_size
     ORDER BY p.created_at DESC`,
    params,
  );
}

export async function projectRow(exec: Exec, projectId: number): Promise<ProjectRow | null> {
  const rows = await exec(
    `SELECT p.project_id, p.code, p.name, p.manager_name, p.status, p.health,
            p.start_date, p.target_end_date,
            ${CURRENT_FINISH} AS current_finish,
            ${BASELINE_FINISH} AS baseline_finish
     FROM pm.projects p
     WHERE p.project_id = @projectId AND p.is_deleted = 0`,
    { projectId },
  );
  return (rows[0] as ProjectRow | undefined) ?? null;
}

export async function taskRollup(exec: Exec, projectId: number): Promise<TaskRollupRow[]> {
  return exec(
    `SELECT task_id, name, duration_days, progress_percent, status, finish_date, is_critical
     FROM pm.project_tasks
     WHERE project_id = @projectId AND is_deleted = 0
     ORDER BY sort_order, task_id`,
    { projectId },
  );
}

export async function milestoneUpcoming(
  exec: Exec,
  projectId: number,
  limit = DEFAULT_LIMIT,
): Promise<DashboardMilestoneRow[]> {
  return exec(
    `SELECT TOP (@limit) milestone_id, task_id, name, due_date, status
     FROM pm.project_milestones
     WHERE project_id = @projectId AND status <> 'Completed' AND due_date >= CAST(GETUTCDATE() AS DATE)
     ORDER BY due_date ASC, milestone_id ASC`,
    { projectId, limit: clampLimit(limit) },
  );
}

export async function overdueTasks(
  exec: Exec,
  projectId: number,
  limit = DEFAULT_LIMIT,
): Promise<DashboardTaskRow[]> {
  return exec(
    `SELECT TOP (@limit) task_id, code, name, finish_date, status, progress_percent, is_critical
     FROM pm.project_tasks
     WHERE project_id = @projectId AND is_deleted = 0
       AND status <> 'Completed' AND finish_date < CAST(GETUTCDATE() AS DATE)
     ORDER BY finish_date ASC, task_id ASC`,
    { projectId, limit: clampLimit(limit) },
  );
}

export async function criticalTasks(
  exec: Exec,
  projectId: number,
  limit = DEFAULT_LIMIT,
): Promise<DashboardTaskRow[]> {
  return exec(
    `SELECT TOP (@limit) task_id, code, name, finish_date, status, progress_percent, is_critical
     FROM pm.project_tasks
     WHERE project_id = @projectId AND is_deleted = 0 AND is_critical = 1
     ORDER BY finish_date ASC, task_id ASC`,
    { projectId, limit: clampLimit(limit) },
  );
}

export async function workloadSummary(exec: Exec, projectId: number): Promise<WorkloadRow[]> {
  return exec(
    `SELECT pr.employee_nip, SUM(tr.allocation_percent) AS allocation
     FROM pm.task_resources tr
     JOIN pm.project_tasks t ON t.task_id = tr.task_id
     JOIN pm.project_resources pr ON pr.resource_id = tr.resource_id
     WHERE t.project_id = @projectId AND t.is_deleted = 0 AND pr.is_deleted = 0
       AND pr.employee_nip IS NOT NULL
     GROUP BY pr.employee_nip
     ORDER BY pr.employee_nip`,
    { projectId },
  );
}

export async function recentActivity(exec: Exec, projectId: number, limit = DEFAULT_LIMIT): Promise<ActivityRow[]> {
  return exec(
    `SELECT TOP (@limit) log_id, entity_type, entity_id, action, actor_nip, detail, created_at
     FROM pm.project_activity_logs
     WHERE project_id = @projectId
     ORDER BY created_at DESC, log_id DESC`,
    { projectId, limit: clampLimit(limit) },
  );
}

export async function globalSummary(exec: Exec, scope: DashboardScope): Promise<GlobalSummaryRows> {
  const s = memberScope(scope, "p");
  const [projects, taskRows, milestoneRows] = await Promise.all([
    exec(
      `SELECT status, health, COUNT(*) AS count
       FROM pm.projects p
       WHERE p.is_deleted = 0 ${s.clause}
       GROUP BY status, health`,
      s.params,
    ),
    exec(
      `SELECT COUNT(*) AS tasks_total,
              COALESCE(SUM(CASE WHEN t.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END), 0) AS tasks_open,
              COALESCE(SUM(CASE WHEN t.status <> 'Completed' AND t.finish_date < CAST(GETUTCDATE() AS DATE) THEN 1 ELSE 0 END), 0) AS tasks_overdue,
              COALESCE(SUM(CASE WHEN t.status <> 'Completed' AND t.finish_date >= CAST(GETUTCDATE() AS DATE)
                                 AND t.finish_date < DATEADD(DAY, 7, CAST(GETUTCDATE() AS DATE)) THEN 1 ELSE 0 END), 0) AS tasks_due_soon
       FROM pm.project_tasks t
       JOIN pm.projects p ON p.project_id = t.project_id AND p.is_deleted = 0
       WHERE t.is_deleted = 0 ${s.clause}`,
      s.params,
    ),
    exec(
      `SELECT COUNT(*) AS milestones_upcoming
       FROM pm.project_milestones ms
       JOIN pm.projects p ON p.project_id = ms.project_id AND p.is_deleted = 0
       WHERE ms.status <> 'Completed' AND ms.due_date >= CAST(GETUTCDATE() AS DATE) ${s.clause}`,
      s.params,
    ),
  ]);

  const tasks = (taskRows[0] as GlobalTaskCountRow | undefined) ?? {
    tasks_total: 0,
    tasks_open: 0,
    tasks_overdue: 0,
    tasks_due_soon: 0,
  };
  return {
    projects: projects as ProjectCountRow[],
    tasks,
    milestones_upcoming: Number((milestoneRows[0] as { milestones_upcoming?: number } | undefined)?.milestones_upcoming ?? 0),
  };
}

export async function globalRecentActivity(
  exec: Exec,
  scope: DashboardScope,
  limit = DEFAULT_LIMIT,
): Promise<GlobalActivityRow[]> {
  const s = memberScope(scope, "p");
  return exec(
    `SELECT TOP (@limit) l.log_id AS id, l.project_id, p.name AS project_name,
            l.entity_type, l.entity_id, l.action, l.actor_nip, l.detail, l.created_at
     FROM pm.project_activity_logs l
     JOIN pm.projects p ON p.project_id = l.project_id
     WHERE p.is_deleted = 0 ${s.clause}
     ORDER BY l.created_at DESC, l.log_id DESC`,
    { ...s.params, limit: clampLimit(limit) },
  );
}

export async function myTasks(exec: Exec, employeeNip: string, limit = DEFAULT_LIMIT): Promise<MyTaskRow[]> {
  return exec(
    `SELECT TOP (@limit) t.task_id, t.name, t.project_id, p.name AS project_name,
            t.finish_date, t.status, t.progress_percent, t.is_critical
     FROM pm.project_tasks t
     JOIN pm.projects p ON p.project_id = t.project_id
     WHERE t.is_deleted = 0 AND p.is_deleted = 0
       AND EXISTS (
         SELECT 1
         FROM pm.task_resources tr
         JOIN pm.project_resources pr ON pr.resource_id = tr.resource_id
         WHERE tr.task_id = t.task_id AND pr.employee_nip = @employeeNip AND pr.is_deleted = 0
       )
     ORDER BY CASE WHEN t.finish_date IS NULL THEN 1 ELSE 0 END, t.finish_date ASC, t.task_id ASC`,
    { employeeNip, limit: clampLimit(limit) },
  );
}

export async function globalUpcomingMilestones(
  exec: Exec,
  scope: DashboardScope,
  limit = 5,
): Promise<GlobalMilestoneRow[]> {
  const s = memberScope(scope, "p");
  return exec(
    `SELECT TOP (@limit) ms.milestone_id, ms.name, ms.due_date, ms.status, ms.project_id, p.name AS project_name
     FROM pm.project_milestones ms
     JOIN pm.projects p ON p.project_id = ms.project_id
     WHERE ms.status <> 'Completed' AND ms.due_date >= CAST(GETUTCDATE() AS DATE) AND p.is_deleted = 0 ${s.clause}
     ORDER BY ms.due_date ASC, ms.milestone_id ASC`,
    { ...s.params, limit: clampLimit(limit) },
  );
}

export async function globalProjects(exec: Exec, scope: DashboardScope, limit = 6): Promise<GlobalProjectRow[]> {
  const s = memberScope(scope, "p");
  return exec(
    `SELECT TOP (@limit) p.project_id, p.code, p.name, p.status, p.health, p.target_end_date,
            CASE
              WHEN COALESCE(SUM(t.duration_days), 0) > 0
                THEN COALESCE(SUM(t.duration_days * t.progress_percent / 100.0), 0) / SUM(t.duration_days) * 100
              WHEN COUNT(t.task_id) > 0 THEN SUM(t.progress_percent) / COUNT(t.task_id)
              ELSE 0
            END AS weighted_progress
     FROM pm.projects p
     LEFT JOIN pm.project_tasks t ON t.project_id = p.project_id AND t.is_deleted = 0
     WHERE p.is_deleted = 0 ${s.clause}
     GROUP BY p.project_id, p.code, p.name, p.status, p.health, p.target_end_date, p.updated_at
     ORDER BY p.updated_at DESC`,
    { ...s.params, limit: clampLimit(limit) },
  );
}
