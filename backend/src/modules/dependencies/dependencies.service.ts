import { ConflictCycleError, ConflictError, NotFoundError, ValidationError } from "../../middleware/error.js";
import { recomputeProject } from "../scheduling/schedule.service.js";
import { CycleError, topoSort } from "../scheduling/graph.js";
import type { Dependency as EngineDependency, ScheduleInput, Task as EngineTask } from "../scheduling/types.js";
import { getById, listProject, type TaskRow } from "../tasks/tasks.repository.js";
import {
  DEPENDENCY_TYPES,
  create as repoCreate,
  listByProject as repoListByProject,
  remove as repoRemove,
  type CreateDependencyData,
  type DependencyRow,
  type DependencyType,
  type Exec,
} from "./dependencies.repository.js";

export type { Exec } from "./dependencies.repository.js";
export { DEPENDENCY_TYPES } from "./dependencies.repository.js";

export interface DependencyDTO {
  id: number;
  projectId: number;
  predecessorTaskId: number;
  successorTaskId: number;
  dependencyType: DependencyType;
  lagDays: number;
  createdAt: string;
}

export interface CreateDependencyInput {
  predecessor_task_id: number;
  successor_task_id: number;
  dependency_type: DependencyType;
  lag_days: number;
}

type EdgeLike = Pick<DependencyRow, "predecessor_task_id" | "successor_task_id" | "dependency_type" | "lag_days">;

function toDTO(row: DependencyRow): DependencyDTO {
  return {
    id: row.dependency_id,
    projectId: row.project_id,
    predecessorTaskId: row.predecessor_task_id,
    successorTaskId: row.successor_task_id,
    dependencyType: row.dependency_type,
    lagDays: row.lag_days,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const number = (err as { number?: number } | undefined)?.number;
  return number === 2601 || number === 2627;
}

function assertNotSummary(task: TaskRow): void {
  if (task.task_type === "Summary") throw new ValidationError("SUMMARY_DEPENDENCY");
}

// Minimal graph (ids + order) for the pure cycle guard; the engine needs nothing else here.
function assertNoCycle(rows: TaskRow[], edges: EdgeLike[]): void {
  const tasks: EngineTask[] = rows.map((r) => ({
    id: String(r.task_id),
    projectId: String(r.project_id),
    parentId: null,
    type: r.task_type,
    name: r.name,
    durationDays: 0,
    isManual: false,
    constraint: { type: "ASAP" },
    order: Number(r.sort_order ?? 0),
    percentComplete: 0,
  }));
  const dependencies: EngineDependency[] = edges.map((e) => ({
    id: `${e.predecessor_task_id}->${e.successor_task_id}`,
    predecessorId: String(e.predecessor_task_id),
    successorId: String(e.successor_task_id),
    type: e.dependency_type,
    lagDays: Number(e.lag_days ?? 0),
  }));
  const input: ScheduleInput = { projectStart: new Date(0), tasks, dependencies };
  try {
    topoSort(input);
  } catch (err) {
    if (err instanceof CycleError) throw new ConflictCycleError(err.cyclePath.map(Number));
    throw err;
  }
}

export async function listDependencies(exec: Exec, projectId: number): Promise<DependencyDTO[]> {
  return (await repoListByProject(exec, projectId)).map(toDTO);
}

export async function createDependency(exec: Exec, input: CreateDependencyInput): Promise<DependencyDTO> {
  if (!DEPENDENCY_TYPES.includes(input.dependency_type)) throw new ValidationError("Invalid dependency_type");
  if (input.predecessor_task_id === input.successor_task_id) {
    throw new ValidationError("A task cannot depend on itself");
  }

  const [pred, succ] = await Promise.all([
    getById(exec, input.predecessor_task_id),
    getById(exec, input.successor_task_id),
  ]);
  if (!pred) throw new NotFoundError("Predecessor task not found");
  if (!succ) throw new NotFoundError("Successor task not found");
  assertNotSummary(pred);
  assertNotSummary(succ);
  if (pred.project_id !== succ.project_id) throw new ValidationError("Tasks belong to different projects");

  const [rows, deps] = await Promise.all([
    listProject(exec, succ.project_id),
    repoListByProject(exec, succ.project_id),
  ]);
  assertNoCycle(rows, [...deps, input]);

  const data: CreateDependencyData = { project_id: succ.project_id, ...input };
  let row: DependencyRow | null;
  try {
    row = await repoCreate(exec, data);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Dependency already exists");
    throw err;
  }
  if (!row) throw new NotFoundError("Dependency not found after create");

  await recomputeProject(exec, succ.project_id);
  return toDTO(row);
}

export async function deleteDependency(exec: Exec, id: number): Promise<void> {
  const projectId = await repoRemove(exec, id);
  if (projectId == null) throw new NotFoundError("Dependency not found");
  await recomputeProject(exec, projectId);
}
