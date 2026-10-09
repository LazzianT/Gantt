import { api } from '../../lib/api';
import type { CreateTaskInput, EmployeeSearchResult, Task, TaskPatch } from './types';

interface TaskNodeDTO {
  id: number;
  projectId: number;
  parentTaskId: number | null;
  calendarId: number | null;
  code: string | null;
  name: string;
  description: string | null;
  taskType: Task['type'];
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progressPercent: number;
  status: Task['status'];
  priority: Task['priority'];
  picNip: string | null;
  picName: string | null;
  isMilestone: boolean;
  isCritical: boolean;
  sortOrder: number;
  wbsCode: string | null;
  children?: TaskNodeDTO[];
}

function toTask(dto: TaskNodeDTO): Task {
  return {
    id: dto.id,
    projectId: dto.projectId,
    parentTaskId: dto.parentTaskId,
    calendarId: dto.calendarId,
    code: dto.code,
    wbs: dto.wbsCode ?? '',
    name: dto.name,
    description: dto.description,
    type: dto.taskType,
    startDate: dto.startDate,
    finishDate: dto.finishDate,
    durationDays: dto.durationDays,
    progress: dto.progressPercent,
    status: dto.status,
    priority: dto.priority,
    picNip: dto.picNip,
    picName: dto.picName,
    isMilestone: dto.isMilestone,
    isCritical: dto.isCritical,
    sortOrder: dto.sortOrder,
    children: (dto.children ?? []).map(toTask),
  };
}

export async function listTasks(projectId: number): Promise<Task[]> {
  const nodes = await api<TaskNodeDTO[]>(`/projects/${projectId}/tasks`);
  return (nodes ?? []).map(toTask);
}

export async function createTask(projectId: number, input: CreateTaskInput): Promise<Task> {
  return toTask(await api<TaskNodeDTO>(`/projects/${projectId}/tasks`, { method: 'POST', body: input }));
}

export async function updateTask(taskId: number, patch: TaskPatch): Promise<Task> {
  return toTask(await api<TaskNodeDTO>(`/tasks/${taskId}`, { method: 'PATCH', body: patch }));
}

export async function deleteTask(taskId: number): Promise<void> {
  await api<null>(`/tasks/${taskId}`, { method: 'DELETE' });
}

export async function moveTask(
  taskId: number,
  input: { parentTaskId: number | null; sortOrder: number },
): Promise<Task> {
  return toTask(
    await api<TaskNodeDTO>(`/tasks/${taskId}/move`, {
      method: 'POST',
      body: { parent_task_id: input.parentTaskId, sort_order: input.sortOrder },
    }),
  );
}

interface EmployeeDTO {
  nip: string;
  name: string;
  departmentName: string;
  position: string | null;
}

export async function searchEmployees(query: string, limit = 20): Promise<EmployeeSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const list = await api<EmployeeDTO[]>(`/employees/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return (list ?? []).map((e) => ({
    nip: e.nip,
    name: e.name,
    position: e.position,
    departmentName: e.departmentName,
  }));
}
