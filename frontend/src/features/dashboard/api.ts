import { api } from '../../lib/api';

export interface DashboardUser {
  name: string;
  role: string;
}

export interface DashboardSummary {
  projects_total: number;
  by_status: Record<string, number>;
  by_health: Record<string, number>;
  tasks_total: number;
  tasks_open: number;
  tasks_overdue: number;
  tasks_due_soon: number;
  milestones_upcoming: number;
}

export interface RecentUpdate {
  id: number;
  project_id: number;
  project_name: string;
  entity_type: string;
  entity_id: number;
  action: string;
  actor_nip: string;
  detail: string | null;
  created_at: string;
}

export type ActualFinishStatus = 'Pending' | 'Approved' | 'Rejected';

export interface MyTask {
  task_id: number;
  name: string;
  project_id: number;
  project_name: string;
  finish_date: string | null;
  status: string;
  progress_percent: number;
  is_critical: boolean;
  actual_finish: string | null;
  actual_finish_status: ActualFinishStatus | null;
}

export interface UpcomingMilestone {
  milestone_id: number;
  name: string;
  due_date: string;
  status: string;
  project_id: number;
  project_name: string;
}

export interface DashboardProject {
  project_id: number;
  code: string;
  name: string;
  status: string;
  health: string;
  weighted_progress: number;
  target_end_date: string | null;
}

export interface DashboardData {
  user: DashboardUser;
  summary: DashboardSummary;
  recent_updates: RecentUpdate[];
  my_tasks: MyTask[];
  upcoming_milestones: UpcomingMilestone[];
  projects: DashboardProject[];
}

export interface MyTasksData {
  tasks: MyTask[];
  summary: {
    total: number;
    open: number;
    overdue: number;
    critical: number;
  };
}

export function getDashboard(): Promise<DashboardData> {
  return api<DashboardData>('/dashboard');
}

export function getMyTasks(): Promise<MyTasksData> {
  return api<MyTasksData>('/dashboard/my-tasks');
}
