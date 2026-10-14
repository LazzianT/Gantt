import { NotFoundError } from "../../middleware/error.js";
import {
  criticalTasks,
  globalProjects,
  globalRecentActivity,
  globalSummary,
  globalUpcomingMilestones,
  milestoneUpcoming,
  allMyTasks,
  myTasks,
  overdueTasks,
  portfolio,
  projectRow,
  recentActivity,
  taskRollup,
  workloadSummary,
  type ActivityRow,
  type DashboardMilestoneRow,
  type DashboardTaskRow,
  type Exec,
  type GlobalActivityRow,
  type GlobalMilestoneRow,
  type GlobalProjectRow,
  type GlobalSummaryRows,
  type GlobalTaskCountRow,
  type MyTaskRow,
  type PortfolioFilters,
  type PortfolioRow,
  type TaskRollupRow,
} from "./dashboard.repository.js";

export type { Exec, PortfolioFilters } from "./dashboard.repository.js";

export interface GlobalDashboardUser {
  sub: string;
  name?: string;
  role: string;
}

export interface GlobalSummary {
  projects_total: number;
  by_status: { planning: number; active: number; on_hold: number; completed: number; cancelled: number };
  by_health: { on_track: number; at_risk: number; delayed: number; critical: number };
  tasks_total: number;
  tasks_open: number;
  tasks_overdue: number;
  tasks_due_soon: number;
  milestones_upcoming: number;
}

export interface GlobalTaskItem {
  task_id: number;
  name: string;
  project_id: number;
  project_name: string;
  finish_date: string | null;
  status: string;
  progress_percent: number;
  is_critical: boolean;
  actual_finish: string | null;
  actual_finish_status: "Pending" | "Approved" | "Rejected" | null;
}

export interface GlobalMilestoneItem {
  milestone_id: number;
  name: string;
  due_date: string | null;
  status: string;
  project_id: number;
  project_name: string;
}

export interface GlobalProjectItem {
  project_id: number;
  code: string;
  name: string;
  status: string;
  health: string;
  weighted_progress: number;
  target_end_date: string | null;
}

export interface GlobalDashboard {
  user: { name: string; role: string };
  summary: GlobalSummary;
  recent_updates: GlobalActivityRow[];
  my_tasks: GlobalTaskItem[];
  upcoming_milestones: GlobalMilestoneItem[];
  projects: GlobalProjectItem[];
}

export interface MyTasksDashboard {
  tasks: GlobalTaskItem[];
  summary: {
    total: number;
    open: number;
    overdue: number;
    critical: number;
  };
}

export interface PortfolioItem {
  project_id: number;
  code: string;
  name: string;
  manager_name: string | null;
  status: string;
  health: string;
  start_date: string | null;
  target_end_date: string | null;
  current_finish: string | null;
  weighted_progress: number;
  team_size: number;
  open_tasks: number;
  done_tasks: number;
  overdue_tasks: number;
  critical_tasks: number;
  slip_days: number;
}

export interface ScheduleSummary {
  baseline_finish: string | null;
  current_finish: string | null;
  variance_days: number | null;
  on_track: boolean;
}

export interface WorkloadSummary {
  under: number;
  balanced: number;
  over: number;
}

export interface ProjectDashboard {
  health: string;
  weighted_progress: number;
  schedule: ScheduleSummary;
  upcoming_milestones: DashboardMilestoneRow[];
  overdue_tasks: DashboardTaskRow[];
  critical_tasks: DashboardTaskRow[];
  workload_summary: WorkloadSummary;
  recent_activity: ActivityRow[];
}

export type TaskProgressInput = Pick<TaskRollupRow, "duration_days" | "progress_percent">;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function isoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Server-local calendar day. Overdue is a business-day comparison, so UTC would misclassify tasks near midnight. */
function todayIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole-day difference; positive means `current` finishes later than `baseline` (a slip). */
function varianceDays(current: Date | string | null, baseline: Date | string | null): number | null {
  const c = isoDate(current);
  const b = isoDate(baseline);
  if (!c || !b) return null;
  return Math.round((Date.parse(c) - Date.parse(b)) / 86_400_000);
}

/** Duration-weighted percent complete; zero-duration tasks are ignored. Falls back to the mean progress. */
export function weightedProgress(tasks: TaskProgressInput[]): number {
  const withDuration = tasks.filter((t) => num(t.duration_days) > 0);
  const totalDuration = withDuration.reduce((sum, t) => sum + num(t.duration_days), 0);
  if (totalDuration > 0) {
    const earned = withDuration.reduce((sum, t) => sum + num(t.duration_days) * (num(t.progress_percent) / 100), 0);
    return round((earned / totalDuration) * 100);
  }
  if (tasks.length > 0) return round(tasks.reduce((sum, t) => sum + num(t.progress_percent), 0) / tasks.length);
  return 0;
}

function aggregateProgress(row: PortfolioRow): number {
  const totalDuration = num(row.total_duration);
  if (totalDuration > 0) return round((num(row.done_duration) / totalDuration) * 100);
  const taskCount = num(row.task_count);
  if (taskCount > 0) return round((num(row.done_count) / taskCount) * 100);
  return 0;
}

function toPortfolioItem(row: PortfolioRow): PortfolioItem {
  const taskCount = num(row.task_count);
  const doneCount = num(row.done_count);
  return {
    project_id: row.project_id,
    code: row.code,
    name: row.name,
    manager_name: row.manager_name,
    status: row.status,
    health: row.health,
    start_date: isoDate(row.start_date),
    target_end_date: isoDate(row.target_end_date),
    current_finish: isoDate(row.current_finish),
    weighted_progress: aggregateProgress(row),
    team_size: num(row.team_size),
    open_tasks: taskCount - doneCount,
    done_tasks: doneCount,
    overdue_tasks: num(row.overdue_count),
    critical_tasks: num(row.critical_count),
    slip_days: varianceDays(row.current_finish, row.baseline_finish) ?? 0,
  };
}

export async function getPortfolio(exec: Exec, filters: PortfolioFilters = {}): Promise<PortfolioItem[]> {
  const rows = await portfolio(exec, filters);
  return rows.map(toPortfolioItem);
}

function summarizeWorkload(rows: { allocation: number }[]): WorkloadSummary {
  const summary: WorkloadSummary = { under: 0, balanced: 0, over: 0 };
  for (const row of rows) {
    const total = num(row.allocation);
    if (total < 80) summary.under++;
    else if (total > 100) summary.over++;
    else summary.balanced++;
  }
  return summary;
}

export async function getProjectDashboard(exec: Exec, projectId: number): Promise<ProjectDashboard> {
  const project = await projectRow(exec, projectId);
  if (!project) throw new NotFoundError("Project not found");

  const [tasks, milestones, overdue, critical, workload, activity] = await Promise.all([
    taskRollup(exec, projectId),
    milestoneUpcoming(exec, projectId),
    overdueTasks(exec, projectId),
    criticalTasks(exec, projectId),
    workloadSummary(exec, projectId),
    recentActivity(exec, projectId),
  ]);

  const variance = varianceDays(project.current_finish, project.baseline_finish);
  const schedule: ScheduleSummary = {
    baseline_finish: isoDate(project.baseline_finish),
    current_finish: isoDate(project.current_finish),
    variance_days: variance,
    on_track: variance === null || variance <= 0,
  };

  return {
    health: project.health,
    weighted_progress: weightedProgress(tasks),
    schedule,
    upcoming_milestones: milestones,
    overdue_tasks: overdue,
    critical_tasks: critical,
    workload_summary: summarizeWorkload(workload),
    recent_activity: activity,
  };
}

const STATUS_KEYS: Record<string, keyof GlobalSummary["by_status"]> = {
  Planning: "planning",
  Active: "active",
  "On Hold": "on_hold",
  Completed: "completed",
  Cancelled: "cancelled",
};

const HEALTH_KEYS: Record<string, keyof GlobalSummary["by_health"]> = {
  "On Track": "on_track",
  "At Risk": "at_risk",
  Delayed: "delayed",
  Critical: "critical",
};

function toGlobalSummary(source: GlobalSummaryRows): GlobalSummary {
  const by_status = { planning: 0, active: 0, on_hold: 0, completed: 0, cancelled: 0 };
  const by_health = { on_track: 0, at_risk: 0, delayed: 0, critical: 0 };
  let projects_total = 0;
  for (const row of source.projects) {
    const count = num(row.count);
    projects_total += count;
    const statusKey = STATUS_KEYS[row.status];
    if (statusKey) by_status[statusKey] += count;
    const healthKey = HEALTH_KEYS[row.health];
    if (healthKey) by_health[healthKey] += count;
  }
  const tasks: GlobalTaskCountRow = source.tasks;
  return {
    projects_total,
    by_status,
    by_health,
    tasks_total: num(tasks.tasks_total),
    tasks_open: num(tasks.tasks_open),
    tasks_overdue: num(tasks.tasks_overdue),
    tasks_due_soon: num(tasks.tasks_due_soon),
    milestones_upcoming: num(source.milestones_upcoming),
  };
}

function toGlobalTask(row: MyTaskRow): GlobalTaskItem {
  return {
    task_id: row.task_id,
    name: row.name,
    project_id: row.project_id,
    project_name: row.project_name,
    finish_date: isoDate(row.finish_date),
    status: row.status,
    progress_percent: num(row.progress_percent),
    is_critical: Boolean(row.is_critical),
    actual_finish: isoDate(row.actual_finish),
    actual_finish_status: row.actual_finish_status ?? null,
  };
}

function toGlobalMilestone(row: GlobalMilestoneRow): GlobalMilestoneItem {
  return {
    milestone_id: row.milestone_id,
    name: row.name,
    due_date: isoDate(row.due_date),
    status: row.status,
    project_id: row.project_id,
    project_name: row.project_name,
  };
}

function toGlobalProject(row: GlobalProjectRow): GlobalProjectItem {
  return {
    project_id: row.project_id,
    code: row.code,
    name: row.name,
    status: row.status,
    health: row.health,
    weighted_progress: round(num(row.weighted_progress)),
    target_end_date: isoDate(row.target_end_date),
  };
}

const GLOBAL_SEE_ALL_ROLES = new Set(["admin", "manager"]);

export async function getMyTasksDashboard(exec: Exec, user: GlobalDashboardUser): Promise<MyTasksDashboard> {
  const rows = await allMyTasks(exec, user.sub);
  const today = todayIso();
  const tasks = rows.map(toGlobalTask);
  return {
    tasks,
    summary: {
      total: tasks.length,
      open: tasks.filter((task) => task.status !== "Completed").length,
      overdue: tasks.filter(
        (task) => task.status !== "Completed" && task.finish_date != null && task.finish_date < today,
      ).length,
      critical: tasks.filter((task) => task.is_critical).length,
    },
  };
}

export async function getGlobalDashboard(exec: Exec, user: GlobalDashboardUser): Promise<GlobalDashboard> {
  const scope = { nip: user.sub, seeAll: GLOBAL_SEE_ALL_ROLES.has(user.role.toLowerCase()) };
  const [summary, activity, tasks, milestones, projects] = await Promise.all([
    globalSummary(exec, scope),
    globalRecentActivity(exec, scope),
    myTasks(exec, user.sub),
    globalUpcomingMilestones(exec, scope),
    globalProjects(exec, scope),
  ]);

  return {
    user: { name: user.name ?? "", role: user.role },
    summary: toGlobalSummary(summary),
    recent_updates: activity,
    my_tasks: tasks.map(toGlobalTask),
    upcoming_milestones: milestones.map(toGlobalMilestone),
    projects: projects.map(toGlobalProject),
  };
}
