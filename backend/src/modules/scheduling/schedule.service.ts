import { ConflictCycleError, NotFoundError } from "../../middleware/error.js";
import { listByProject as listDependencies } from "../dependencies/dependencies.repository.js";
import { bumpScheduleVersion, getProject } from "../projects/projects.repository.js";
import {
  listProject,
  updateScheduleFields,
  type Exec,
  type TaskRow,
} from "../tasks/tasks.repository.js";
import { loadCalendar } from "./calendar.repository.js";
import { compute } from "./engine.js";
import { CycleError } from "./graph.js";
import type {
  ComputedTask,
  Dependency as EngineDependency,
  ScheduleInput,
  ScheduleResult,
  Task as EngineTask,
} from "./types.js";

export type { Exec } from "../tasks/tasks.repository.js";

export interface ScheduledTaskDTO {
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

export interface ScheduleDTO {
  scheduleVersion: number;
  projectFinish: string;
  projectDuration: number;
  criticalPath: number[];
  tasks: ScheduledTaskDTO[];
}

function parseDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toEngineTask(row: TaskRow): EngineTask {
  const milestone = row.task_type === "Milestone" || Boolean(row.is_milestone);
  const start = parseDate(row.start_date);
  return {
    id: String(row.task_id),
    projectId: String(row.project_id),
    parentId: row.parent_task_id == null ? null : String(row.parent_task_id),
    type: milestone ? "Milestone" : row.task_type,
    name: row.name,
    durationDays: milestone ? 0 : Number(row.duration_days ?? 0),
    calendarId: row.calendar_id,
    isManual: false,
    manualStart: null,
    manualFinish: null,
    // A stored start_date is a start-no-earlier-than anchor, not a hard pin.
    constraint: start ? { type: "SNET", date: start } : { type: "ASAP", date: null },
    order: Number(row.sort_order ?? 0),
    percentComplete: Number(row.progress_percent ?? 0),
  };
}

function toDTO(task: ComputedTask): ScheduledTaskDTO {
  return {
    id: Number(task.id),
    esDate: iso(task.es),
    efDate: iso(task.ef),
    lsDate: iso(task.ls),
    lfDate: iso(task.lf),
    duration: task.duration,
    percentComplete: task.percentComplete,
    totalFloat: task.totalFloat,
    freeFloat: task.freeFloat,
    isCritical: task.isCritical,
    isViolatingConstraint: task.isViolatingConstraint,
  };
}

/** Loads the project graph, runs the pure CPM engine, persists dates, bumps schedule_version. */
export async function recomputeProject(exec: Exec, projectId: number): Promise<ScheduleDTO> {
  const project = await getProject(exec, projectId);
  if (!project) throw new NotFoundError("Project not found");

  const [rows, depRows, calendar] = await Promise.all([
    listProject(exec, projectId),
    listDependencies(exec, projectId),
    loadCalendar(exec, project.calendar_id),
  ]);

  const input: ScheduleInput = {
    projectStart: parseDate(project.start_date) ?? today(),
    tasks: rows.map(toEngineTask),
    dependencies: depRows.map(
      (d): EngineDependency => ({
        id: String(d.dependency_id),
        predecessorId: String(d.predecessor_task_id),
        successorId: String(d.successor_task_id),
        type: d.dependency_type,
        lagDays: Number(d.lag_days ?? 0),
      }),
    ),
  };

  let result: ScheduleResult;
  try {
    result = compute(input, calendar);
  } catch (err) {
    if (err instanceof CycleError) throw new ConflictCycleError(err.cyclePath.map(Number));
    throw err;
  }

  const scheduleVersion = await bumpScheduleVersion(exec, projectId);
  for (const [id, task] of result.tasks) {
    await updateScheduleFields(exec, Number(id), {
      es_date: iso(task.es),
      ef_date: iso(task.ef),
      ls_date: iso(task.ls),
      lf_date: iso(task.lf),
      total_float_days: task.totalFloat,
      free_float_days: task.freeFloat,
      is_critical: task.isCritical,
      schedule_version: scheduleVersion,
    });
  }

  return {
    scheduleVersion,
    projectFinish: iso(result.projectFinish),
    projectDuration: result.projectDuration,
    criticalPath: result.criticalPath.map(Number),
    tasks: [...result.tasks.values()].map(toDTO),
  };
}
