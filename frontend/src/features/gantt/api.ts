import { api } from '../../lib/api';

export interface ScheduleTask {
  id: number;
  esDate: string;
  efDate: string;
  lsDate: string;
  lfDate: string;
  duration: number;
  percentComplete: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
  isViolatingConstraint: boolean;
}

export interface Schedule {
  scheduleVersion: number;
  projectFinish: string;
  projectDuration: number;
  criticalPath: number[];
  tasks: ScheduleTask[];
}

/** Node from GET /projects/:id/tasks — nested, camelCase, carries its own scheduled dates. */
export interface TaskNode {
  id: number;
  parentTaskId: number | null;
  name: string;
  taskType: 'Summary' | 'Normal' | 'Milestone';
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progressPercent: number;
  isMilestone: boolean;
  isCritical: boolean;
  esDate: string | null;
  efDate: string | null;
  totalFloatDays: number | null;
  sortOrder: number;
  wbsCode: string | null;
  children: TaskNode[];
}

export interface Dependency {
  id: number;
  projectId: number;
  predecessorTaskId: number;
  successorTaskId: number;
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export interface BaselineRow {
  baseline_id: number;
  project_id: number;
  name: string;
  captured_at: string;
}

export interface BaselineVarianceRow {
  task_id: number;
  baseline_start: string | null;
  baseline_finish: string | null;
}

export function getSchedule(projectId: number): Promise<Schedule> {
  return api<Schedule>(`/projects/${projectId}/schedule`);
}

export function getTaskTree(projectId: number): Promise<TaskNode[]> {
  return api<TaskNode[]>(`/projects/${projectId}/tasks`);
}

export function getDependencies(projectId: number): Promise<Dependency[]> {
  return api<Dependency[]>(`/projects/${projectId}/dependencies`);
}

export function patchTask(
  id: number,
  patch: { start_date?: string; finish_date?: string; duration_days?: number },
): Promise<unknown> {
  return api(`/tasks/${id}`, { method: 'PATCH', body: patch });
}

export interface CreateDependencyInput {
  predecessor_task_id: number;
  dependency_type: Dependency['dependencyType'];
  lag_days: number;
}

export function createDependency(successorId: number, body: CreateDependencyInput): Promise<Dependency> {
  return api<Dependency>(`/tasks/${successorId}/dependencies`, { method: 'POST', body });
}

export function getBaselines(projectId: number): Promise<BaselineRow[]> {
  return api<BaselineRow[]>(`/projects/${projectId}/baselines`);
}

export function getBaselineVariance(baselineId: number): Promise<BaselineVarianceRow[]> {
  return api<BaselineVarianceRow[]>(`/baselines/${baselineId}/variance`);
}
