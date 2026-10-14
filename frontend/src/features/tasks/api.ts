import { ApiError, api, apiBlob } from '../../lib/api';
import { getToken } from '../../lib/auth';
import type { CreateTaskInput, EmployeeSearchResult, FinishReview, Task, TaskEvidence, TaskPatch } from './types';

interface TaskEvidenceDTO {
  evidence_id: number;
  task_id: number;
  note: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  has_file: boolean;
  uploaded_by_nip: string | null;
  created_at: string;
}

interface FinishReviewDTO {
  task_id: number;
  name: string;
  pic_nip: string | null;
  pic_name: string | null;
  planned_finish: string | null;
  actual_finish: string | null;
  actual_finish_status: 'Pending' | 'Approved' | 'Rejected';
  actual_finish_submitted_by: string | null;
  actual_finish_submitted_at: string | null;
  actual_finish_comment: string | null;
}

function toFinishReview(dto: FinishReviewDTO): FinishReview {
  return {
    taskId: dto.task_id,
    name: dto.name,
    picNip: dto.pic_nip,
    picName: dto.pic_name,
    plannedFinish: dto.planned_finish,
    actualFinish: dto.actual_finish,
    status: dto.actual_finish_status,
    submittedBy: dto.actual_finish_submitted_by,
    submittedAt: dto.actual_finish_submitted_at,
    comment: dto.actual_finish_comment,
  };
}

function toEvidence(dto: TaskEvidenceDTO): TaskEvidence {
  return {
    id: dto.evidence_id,
    taskId: dto.task_id,
    note: dto.note,
    fileName: dto.file_name,
    mimeType: dto.mime_type,
    sizeBytes: dto.size_bytes,
    hasFile: dto.has_file,
    uploadedByNip: dto.uploaded_by_nip,
    createdAt: dto.created_at,
  };
}

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
  actualStart: string | null;
  actualFinish: string | null;
  actualFinishStatus: Task['actualFinishStatus'];
  actualFinishComment: string | null;
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
  actualStart: dto.actualStart,
  actualFinish: dto.actualFinish,
  actualFinishStatus: dto.actualFinishStatus,
  actualFinishComment: dto.actualFinishComment,
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

/**
 * Marks the caller's own task done with the date it actually finished, or reopens it
 * (In Progress, 0%). The date is recorded as `Pending` until a manager reviews it.
 */
export async function setTaskCompletion(
  taskId: number,
  completed: boolean,
  actualFinish?: string | null,
): Promise<Task> {
  return toTask(
    await api<TaskNodeDTO>(`/tasks/${taskId}/completion`, {
      method: 'PATCH',
      body: { completed, actual_finish: actualFinish ?? null },
    }),
  );
}

/** Manager queue of submitted as-built finish dates for a project. */
export async function listFinishReviews(projectId: number): Promise<FinishReview[]> {
  return ((await api<FinishReviewDTO[]>(`/projects/${projectId}/actual-finish-reviews`)) ?? []).map(
    toFinishReview,
  );
}

export async function reviewActualFinish(
  taskId: number,
  decision: 'Approved' | 'Rejected',
  comment?: string | null,
): Promise<Task> {
  return toTask(
    await api<TaskNodeDTO>(`/tasks/${taskId}/actual-finish/review`, {
      method: 'POST',
      body: { decision, comment: comment ?? null },
    }),
  );
}

export async function listTaskEvidence(taskId: number): Promise<TaskEvidence[]> {
  return ((await api<TaskEvidenceDTO[]>(`/tasks/${taskId}/evidence`)) ?? []).map(toEvidence);
}

/** Multipart because the note and the attachment are optional independently. */
export async function addTaskEvidence(
  taskId: number,
  input: { note?: string | null; file?: File | null },
): Promise<TaskEvidence> {
  const form = new FormData();
  if (input.note?.trim()) form.append('note', input.note.trim());
  if (input.file) form.append('file', input.file);
  const token = getToken();
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/tasks/${taskId}/evidence`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const payload = (await res.json().catch(() => null)) as
    | { data?: TaskEvidenceDTO; error?: { message?: string } }
    | null;
  if (!res.ok) throw new ApiError(res.status, payload?.error?.message ?? res.statusText);
  return toEvidence(payload!.data!);
}

export async function deleteTaskEvidence(evidenceId: number): Promise<void> {
  await api<null>(`/evidence/${evidenceId}`, { method: 'DELETE' });
}

export async function downloadEvidenceFile(evidenceId: number, fileName: string): Promise<void> {
  const blob = await apiBlob(`/evidence/${evidenceId}/file`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
