import type { Role } from '../lib/auth';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type HealthStatus = 'on_track' | 'at_risk' | 'delayed' | 'critical';
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
export type TaskType = 'task' | 'summary' | 'milestone';

export interface PortfolioProject {
  id: number;
  code: string;
  name: string;
  managerName: string | null;
  status: ProjectStatus;
  health: HealthStatus;
  progress: number;
  teamSize: number;
  openTasks: number;
  doneTasks: number;
  overdueTasks: number;
  criticalTasks: number;
  slipDays: number;
  startDate: string | null;
  finishDate: string | null;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  description: string | null;
  ownerNip: string | null;
  status: ProjectStatus;
  startDate: string | null;
  finishDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  nip: string;
  name: string;
  position: string | null;
  department: string | null;
  email: string | null;
  active: boolean;
}

export interface Task {
  id: number;
  projectId: number;
  parentId: number | null;
  wbs: string;
  name: string;
  type: TaskType;
  startDate: string | null;
  finishDate: string | null;
  durationDays: number;
  progress: number;
  status: TaskStatus;
  assigneeNip: string | null;
  isCritical: boolean;
  sortOrder: number;
}

export interface Dependency {
  id: number;
  projectId: number;
  predecessorId: number;
  successorId: number;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export interface Milestone {
  id: number;
  projectId: number;
  name: string;
  dueDate: string;
  completed: boolean;
  taskId: number | null;
}

export interface AuthUser {
  nip: string;
  name: string;
  role: Role;
  departCode?: string | null;
  canManageProjects?: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}
