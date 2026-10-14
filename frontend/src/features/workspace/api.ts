import { api } from '../../lib/api';

export { searchEmployees } from '../tasks/api';
export type { EmployeeSearchResult } from '../tasks/types';

export type ResourceType = 'Employee' | 'Equipment';

export interface ProjectResource {
  id: number;
  projectId: number;
  employeeNip: string | null;
  employeeName: string | null;
  departmentName: string | null;
  positionName: string | null;
  email: string | null;
  name: string;
  type: ResourceType;
  unit: string | null;
  maxUnits: number;
}

export interface AddResourceInput {
  employee_nip?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  position_name?: string | null;
  resource_name: string;
  resource_type: ResourceType;
  unit?: string | null;
  max_units?: number | null;
}

export function listResources(projectId: number): Promise<ProjectResource[]> {
  return api<ProjectResource[]>(`/projects/${projectId}/resources`);
}

export function addResource(projectId: number, input: AddResourceInput): Promise<ProjectResource> {
  return api<ProjectResource>(`/projects/${projectId}/resources`, { method: 'POST', body: input });
}

export function removeResource(id: number): Promise<null> {
  return api<null>(`/resources/${id}`, { method: 'DELETE' });
}

export type Classification = 'Underallocated' | 'Balanced' | 'Overallocated';

export interface WorkloadDayRow {
  employee_nip: string;
  date: string;
  hours: number;
  capacity: number;
  utilization: number;
  classification: Classification;
}

export interface WorkloadSummaryRow {
  employee_nip: string;
  days: number;
  hours: number;
  capacity: number;
  utilization: number;
  classification: Classification;
  underallocatedDays: number;
  balancedDays: number;
  overallocatedDays: number;
}

export interface WorkloadResult {
  from: string;
  to: string;
  rows: WorkloadDayRow[];
  summary: WorkloadSummaryRow[];
}

export function getWorkload(projectId: number, from: string, to: string): Promise<WorkloadResult> {
  const query = new URLSearchParams({ from, to }).toString();
  return api<WorkloadResult>(`/projects/${projectId}/workload?${query}`);
}

export interface ProjectMember {
  id: number;
  projectId: number;
  employeeNip: string;
  employeeName: string;
  role: string | null;
  allocationPercent: number;
  joinedAt: string;
}

export interface AddMemberInput {
  employee_nip: string;
  employee_name: string;
  role?: string | null;
  allocation_percent?: number | null;
}

export function listMembers(projectId: number): Promise<ProjectMember[]> {
  return api<ProjectMember[]>(`/projects/${projectId}/members`);
}

export function addMember(projectId: number, input: AddMemberInput): Promise<ProjectMember> {
  return api<ProjectMember>(`/projects/${projectId}/members`, { method: 'POST', body: input });
}

export function removeMember(projectId: number, memberId: number): Promise<null> {
  return api<null>(`/projects/${projectId}/members/${memberId}`, { method: 'DELETE' });
}

export type MilestoneStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Missed';

export interface Milestone {
  milestone_id: number;
  project_id: number;
  task_id: number | null;
  name: string;
  due_date: string | null;
  status: MilestoneStatus;
  created_at: string;
}

export interface CreateMilestoneInput {
  name: string;
  due_date?: string | null;
  status?: MilestoneStatus;
  task_id?: number | null;
}

export function listMilestones(projectId: number): Promise<Milestone[]> {
  return api<Milestone[]>(`/projects/${projectId}/milestones`);
}

export function createMilestone(projectId: number, input: CreateMilestoneInput): Promise<Milestone> {
  return api<Milestone>(`/projects/${projectId}/milestones`, { method: 'POST', body: input });
}

export function deleteMilestone(id: number): Promise<null> {
  return api<null>(`/milestones/${id}`, { method: 'DELETE' });
}

export interface Baseline {
  baseline_id: number;
  project_id: number;
  name: string;
  captured_at: string;
  captured_by_nip: string | null;
  task_count?: number;
}

export interface VarianceRow {
  task_id: number;
  name: string | null;
  baseline_start: string | null;
  current_start: string | null;
  start_variance_days: number | null;
  baseline_finish: string | null;
  current_finish: string | null;
  finish_variance_days: number | null;
  slip: boolean;
}

export function listBaselines(projectId: number): Promise<Baseline[]> {
  return api<Baseline[]>(`/projects/${projectId}/baselines`);
}

export function createBaseline(projectId: number, name: string): Promise<Baseline> {
  return api<Baseline>(`/projects/${projectId}/baselines`, { method: 'POST', body: { name } });
}

export function getVariance(baselineId: number): Promise<VarianceRow[]> {
  return api<VarianceRow[]>(`/baselines/${baselineId}/variance`);
}

export interface ProjectReports {
  project: { project_id: number; code: string; name: string; status: string; health: string };
  summary: { tasks: number; completed: number; open: number; overdue: number; critical: number; variance_days: number | null };
  variance: Array<{ task_id: number; name: string; baseline_finish: string | null; current_finish: string | null; variance_days: number | null; slip: boolean }>;
  delays: Array<{ task_id: number; name: string; pic_nip: string | null; finish_date: string | null; actual_finish: string | null; status: string; progress_percent: number; is_critical: boolean; days_overdue: number }>;
  audit: Array<{ kind: 'activity' | 'evidence' | 'approval'; id: number; task_id: number | null; task_name: string | null; actor_nip: string | null; action: string; detail: string | null; created_at: string }>;
}

export function getProjectReports(projectId: number): Promise<ProjectReports> {
  return api<ProjectReports>(`/projects/${projectId}/reports`);
}
