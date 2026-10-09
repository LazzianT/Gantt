import { ConflictError, NotFoundError, ValidationError } from "../../middleware/error.js";
import {
  PROJECT_HEALTHS,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  addMember as repoAddMember,
  codeExists,
  codesWithPrefix as repoCodesWithPrefix,
  createProject as repoCreateProject,
  findMember as repoFindMember,
  getProject as repoGetProject,
  listMemberProjects as repoListMemberProjects,
  listMembers as repoListMembers,
  listProjects as repoListProjects,
  removeMember as repoRemoveMember,
  softDeleteProject as repoSoftDeleteProject,
  updateProject as repoUpdateProject,
  type AddMemberData,
  type CreateProjectData,
  type Exec,
  type Health,
  type MemberRow,
  type Priority,
  type ProjectFilters,
  type ProjectRow,
  type ProjectStatus,
  type UpdateProjectPatch,
} from "./projects.repository.js";

export type { Exec } from "./projects.repository.js";
export { PROJECT_HEALTHS, PROJECT_PRIORITIES, PROJECT_STATUSES } from "./projects.repository.js";

export interface ProjectDTO {
  id: number;
  code: string;
  name: string;
  description: string | null;
  managerNip: string | null;
  managerName: string | null;
  startDate: string | null;
  targetEndDate: string | null;
  priority: Priority;
  status: ProjectStatus;
  health: Health;
  calendarId: number | null;
  scheduleVersion: number;
  taskCount: number;
  doneCount: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemberDTO {
  id: number;
  projectId: number;
  employeeNip: string;
  employeeName: string;
  role: string | null;
  allocationPercent: number;
  joinedAt: string;
}

export type CreateProjectInput = Omit<CreateProjectData, "code"> & { code?: string };
export type UpdateProjectInput = UpdateProjectPatch;
export type AddMemberInput = AddMemberData;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoStamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value == null ? "" : String(value);
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`Invalid ${field}`);
  }
  return value as T;
}

/** Percent of work complete: duration-weighted when task durations exist, else completed/total count. */
export function weightedProgress(p: Pick<ProjectRow, "done_count" | "task_count" | "done_duration" | "total_duration">): number {
  const totalDuration = num(p.total_duration);
  if (totalDuration > 0) return Math.round((num(p.done_duration) / totalDuration) * 10000) / 100;
  const taskCount = num(p.task_count);
  if (taskCount > 0) return Math.round((num(p.done_count) / taskCount) * 10000) / 100;
  return 0;
}

export function toProjectDTO(row: ProjectRow): ProjectDTO {
  return {
    id: row.project_id,
    code: row.code,
    name: row.name,
    description: row.description,
    managerNip: row.manager_nip,
    managerName: row.manager_name,
    startDate: isoDate(row.start_date),
    targetEndDate: isoDate(row.target_end_date),
    priority: row.priority,
    status: row.status,
    health: row.health,
    calendarId: row.calendar_id,
    scheduleVersion: num(row.schedule_version),
    taskCount: num(row.task_count),
    doneCount: num(row.done_count),
    progress: weightedProgress(row),
    createdAt: isoStamp(row.created_at),
    updatedAt: isoStamp(row.updated_at),
  };
}

export function toMemberDTO(row: MemberRow): MemberDTO {
  return {
    id: row.member_id,
    projectId: row.project_id,
    employeeNip: row.employee_nip,
    employeeName: row.employee_name,
    role: row.role,
    allocationPercent: num(row.allocation_percent),
    joinedAt: isoStamp(row.joined_at),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const number = (err as { number?: number } | undefined)?.number;
  return number === 2601 || number === 2627;
}

export async function listProjects(exec: Exec, filters: ProjectFilters = {}): Promise<ProjectDTO[]> {
  const rows = await repoListProjects(exec, filters);
  return rows.map(toProjectDTO);
}

export async function getProject(exec: Exec, projectId: number): Promise<ProjectDTO> {
  const row = await repoGetProject(exec, projectId);
  if (!row) throw new NotFoundError("Project not found");
  return toProjectDTO(row);
}

/** Projects where the caller is an explicit member (see pm.project_members). */
export async function listMemberProjects(exec: Exec, nip: string): Promise<ProjectDTO[]> {
  const rows = await repoListMemberProjects(exec, nip);
  return rows.map(toProjectDTO);
}

/** The caller's membership row for a project, or null when not a member. */
export async function getMember(exec: Exec, projectId: number, nip: string): Promise<MemberDTO | null> {
  const row = await repoFindMember(exec, projectId, nip);
  return row ? toMemberDTO(row) : null;
}

function validateEnums(input: CreateProjectInput | UpdateProjectInput): void {
  if (input.priority !== undefined) assertEnum(input.priority, PROJECT_PRIORITIES, "priority");
  if (input.status !== undefined) assertEnum(input.status, PROJECT_STATUSES, "status");
  if (input.health !== undefined) assertEnum(input.health, PROJECT_HEALTHS, "health");
}

const CODE_PREFIX = "PRJ";

/** Next auto-generated project code, e.g. PRJ-2026-001. */
export async function nextProjectCode(exec: Exec, now: Date = new Date()): Promise<string> {
  const prefix = `${CODE_PREFIX}-${now.getFullYear()}-`;
  const codes = await repoCodesWithPrefix(exec, prefix);
  let max = 0;
  for (const code of codes) {
    const match = /(\d+)$/.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export async function createProject(exec: Exec, input: CreateProjectInput): Promise<ProjectDTO> {
  const name = input.name?.trim();
  if (!name) throw new ValidationError("name is required");
  validateEnums(input);

  const providedCode = input.code?.trim();
  if (providedCode && (await codeExists(exec, providedCode))) {
    throw new ConflictError("Project code already exists");
  }

  const attempts = providedCode ? 1 : 5;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const code = providedCode ?? (await nextProjectCode(exec));
    const data: CreateProjectData = { ...input, code, name };
    try {
      const row = await repoCreateProject(exec, data);
      if (!row) throw new NotFoundError("Project not found after create");
      return toProjectDTO(row);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (providedCode) throw new ConflictError("Project code already exists");
      // Auto-generated code collided with a concurrent insert; regenerate and retry.
    }
  }
  throw new ConflictError("Could not allocate a unique project code");
}

export async function updateProject(exec: Exec, projectId: number, patch: UpdateProjectInput): Promise<ProjectDTO> {
  const current = await repoGetProject(exec, projectId);
  if (!current) throw new NotFoundError("Project not found");
  validateEnums(patch);

  const data: UpdateProjectPatch = { ...patch };
  if (data.code !== undefined) {
    const code = data.code.trim();
    if (!code) throw new ValidationError("code is required");
    data.code = code;
    if (code !== current.code && (await codeExists(exec, code))) {
      throw new ConflictError("Project code already exists");
    }
  }
  try {
    const row = await repoUpdateProject(exec, projectId, data);
    if (!row) throw new NotFoundError("Project not found");
    return toProjectDTO(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Project code already exists");
    throw err;
  }
}

export async function softDeleteProject(exec: Exec, projectId: number): Promise<void> {
  if (!(await repoSoftDeleteProject(exec, projectId))) throw new NotFoundError("Project not found");
}

export async function listMembers(exec: Exec, projectId: number): Promise<MemberDTO[]> {
  const rows = await repoListMembers(exec, projectId);
  return rows.map(toMemberDTO);
}

export async function addMember(exec: Exec, projectId: number, input: AddMemberInput): Promise<MemberDTO> {
  const employeeNip = input.employee_nip?.trim();
  const employeeName = input.employee_name?.trim();
  if (!employeeNip) throw new ValidationError("employee_nip is required");
  if (!employeeName) throw new ValidationError("employee_name is required");
  if (input.allocation_percent != null && (input.allocation_percent < 0 || input.allocation_percent > 100)) {
    throw new ValidationError("allocation_percent must be between 0 and 100");
  }
  const row = await repoAddMember(exec, projectId, {
    ...input,
    employee_nip: employeeNip,
    employee_name: employeeName,
  });
  return toMemberDTO(row);
}

export async function removeMember(exec: Exec, projectId: number, memberId: number): Promise<void> {
  if (!(await repoRemoveMember(exec, projectId, memberId))) throw new NotFoundError("Member not found");
}
