export type TaskType = 'Summary' | 'Normal' | 'Milestone';
export type TaskStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked' | 'Cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';
/** Manager review state of the as-built finish date a PIC submitted. */
export type ActualFinishStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Task {
  id: number;
  projectId: number;
  parentTaskId: number | null;
  calendarId: number | null;
  code: string | null;
  wbs: string;
  name: string;
  description: string | null;
  type: TaskType;
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progress: number;
  status: TaskStatus;
  priority: TaskPriority;
  picNip: string | null;
  picName: string | null;
  isMilestone: boolean;
  isCritical: boolean;
  actualStart: string | null;
  actualFinish: string | null;
  actualFinishStatus: ActualFinishStatus | null;
  actualFinishComment: string | null;
  sortOrder: number;
  children: Task[];
}

/** Patch body keys match the backend schema (snake_case). */
export interface TaskPatch {
  name?: string;
  start_date?: string | null;
  finish_date?: string | null;
  duration_days?: number | null;
  progress_percent?: number;
  parent_task_id?: number | null;
  sort_order?: number;
  task_type?: TaskType;
  status?: TaskStatus;
  pic_nip?: string | null;
  pic_name?: string | null;
}

export interface CreateTaskInput {
  name: string;
  parent_task_id?: number | null;
  task_type?: TaskType;
  start_date?: string | null;
  finish_date?: string | null;
  duration_days?: number | null;
  progress_percent?: number;
  pic_nip?: string | null;
  pic_name?: string | null;
}

export interface EmployeeSearchResult {
  nip: string;
  name: string;
  position: string | null;
  departmentName: string;
}

/** Evidence attached to a task: a note, a file, or both. */
export interface TaskEvidence {
  id: number;
  taskId: number;
  note: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  hasFile: boolean;
  uploadedByNip: string | null;
  createdAt: string;
}

/** One row of the manager's as-built finish date queue. */
export interface FinishReview {
  taskId: number;
  name: string;
  picNip: string | null;
  picName: string | null;
  plannedFinish: string | null;
  actualFinish: string | null;
  status: ActualFinishStatus;
  submittedBy: string | null;
  submittedAt: string | null;
  comment: string | null;
}
