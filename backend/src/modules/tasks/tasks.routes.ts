import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { guardProject, projectFromParam, projectOfTask, requireTaskPic } from "../../middleware/project-membership.js";
import { ValidationError } from "../../middleware/error.js";
import { getProject } from "../projects/projects.repository.js";
import { ensureMember } from "../projects/projects.service.js";
import { workingDaysBetween } from "../scheduling/calendar.js";
import { loadCalendar } from "../scheduling/calendar.repository.js";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  createTaskRepository,
  type ActualFinishStatus,
  type Exec,
} from "./tasks.repository.js";
import {
  createTask,
  getTask,
  listFinishReviews,
  listTasks,
  move,
  reviewActualFinish,
  setMyTaskCompletion,
  softDeleteTask,
  updateTask,
} from "./tasks.service.js";

const ACTUAL_FINISH_STATUSES = ["Pending", "Approved", "Rejected"] as const;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const createSchema = z.object({
  parent_task_id: z.number().int().positive().nullish(),
  code: z.string().trim().max(50).nullish(),
  name: z.string().trim().min(1).max(200),
  description: z.string().nullish(),
  task_type: z.enum(TASK_TYPES).optional(),
  start_date: dateString.nullish(),
  finish_date: dateString.nullish(),
  duration_days: z.number().min(0).nullish(),
  progress_percent: z.number().min(0).max(100).nullish(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  pic_nip: z.string().trim().max(50).nullish(),
  pic_name: z.string().trim().max(200).nullish(),
  is_milestone: z.boolean().optional(),
  calendar_id: z.number().int().positive().nullish(),
  sort_order: z.number().int().optional(),
});

const patchSchema = createSchema.partial();

const moveSchema = z.object({
  parent_task_id: z.number().int().positive().nullish(),
  sort_order: z.number().int().optional(),
});

const completionSchema = z.object({
  completed: z.boolean(),
  actual_finish: dateString.nullish(),
});

const reviewSchema = z.object({
  decision: z.enum(["Approved", "Rejected"]),
  comment: z.string().max(500).nullish(),
});

const exec: Exec = (sql, params) => query(sql, params);
const repo = createTaskRepository(exec);

const guardProjectTasks = guardProject({ exec }, projectFromParam("projectId"));
const guardTask = guardProject({ exec }, projectOfTask);
/** "My Tasks" writes are PIC-only: membership alone is not enough to close someone else's work. */
const guardTaskPic = requireTaskPic({ exec, bypassRoles: ["admin", "manager"] });

function idParam(value: string, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${name}`);
  return n;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request body");
  return parsed.data;
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Inclusive working-day duration for a start/finish pair, per the project calendar. */
async function durationFromDates(calendarId: number | null, start: string, finish: string): Promise<number> {
  if (finish < start) throw new ValidationError("Finish date cannot be before the start date");
  const calendar = await loadCalendar(exec, calendarId);
  return workingDaysBetween(calendar, toUtcDate(start), toUtcDate(finish));
}

/** Auto-adds a task's PIC to the project Team (pm.project_members). Add-only and idempotent. */
async function syncPicToTeam(task: { projectId: number; picNip: string | null; picName: string | null }): Promise<void> {
  if (task.picNip) await ensureMember(exec, task.projectId, task.picNip, task.picName ?? "");
}

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get("/projects/:projectId/tasks", guardProjectTasks, async (req, res, next) => {
  try {
    res.json({ data: await listTasks(repo, idParam(req.params.projectId, "projectId")) });
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/projects/:projectId/tasks", guardProjectTasks, async (req, res, next) => {
  try {
    const projectId = idParam(req.params.projectId, "projectId");
    const input = { ...parse(createSchema, req.body), project_id: projectId };
    if (input.start_date && input.finish_date) {
      const project = await getProject(exec, projectId);
      input.duration_days = await durationFromDates(project?.calendar_id ?? null, input.start_date, input.finish_date);
    }
    const created = await createTask(repo, input);
    await syncPicToTeam(created);
    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:id", guardTask, async (req, res, next) => {
  try {
    res.json({ data: await getTask(repo, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch("/tasks/:id", guardTask, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const patch = parse(patchSchema, req.body);
    if (patch.start_date !== undefined || patch.finish_date !== undefined) {
      const current = await getTask(repo, id);
      const start = patch.start_date !== undefined ? patch.start_date : current.startDate;
      const finish = patch.finish_date !== undefined ? patch.finish_date : current.finishDate;
      if (start && finish) {
        const project = await getProject(exec, current.projectId);
        patch.duration_days = await durationFromDates(
          current.calendarId ?? project?.calendar_id ?? null,
          start,
          finish,
        );
      }
    }
    const updated = await updateTask(repo, id, patch);
    await syncPicToTeam(updated);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete("/tasks/:id", guardTask, async (req, res, next) => {
  try {
    await softDeleteTask(repo, idParam(req.params.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/tasks/:id/move", guardTask, async (req, res, next) => {
  try {
    const id = idParam(req.params.id);
    const { parent_task_id, sort_order } = parse(moveSchema, req.body);
    await move(repo, id, parent_task_id ?? null, sort_order ?? 0);
    res.json({ data: await getTask(repo, id) });
  } catch (err) {
    next(err);
  }
});

/**
 * "My Tasks" write action: the PIC marks their own task done and reports the date it actually
 * finished, or reopens it. The date is recorded as `Pending` until a manager reviews it.
 */
tasksRouter.patch("/tasks/:id/completion", guardTaskPic, async (req, res, next) => {
  try {
    const nip = req.user?.sub;
    if (typeof nip !== "string") throw new ValidationError("Missing user identity");
    const body = parse(completionSchema, req.body);
    res.json({ data: await setMyTaskCompletion(repo, idParam(req.params.id), body, nip) });
  } catch (err) {
    next(err);
  }
});

/** Manager decision on a submitted as-built finish date. */
tasksRouter.post("/tasks/:id/actual-finish/review", requireRole("admin", "manager"), guardTask, async (req, res, next) => {
  try {
    const nip = req.user?.sub;
    if (typeof nip !== "string") throw new ValidationError("Missing user identity");
    const { decision, comment } = parse(reviewSchema, req.body);
    res.json({ data: await reviewActualFinish(repo, idParam(req.params.id), decision, nip, comment ?? null) });
  } catch (err) {
    next(err);
  }
});

/** Queue of submitted as-built finish dates for the project's manager queue. */
tasksRouter.get(
  "/projects/:projectId/actual-finish-reviews",
  guardProjectTasks,
  requireRole("admin", "manager"),
  async (req, res, next) => {
    try {
      const raw = req.query.status;
      const status = typeof raw === "string" && (ACTUAL_FINISH_STATUSES as readonly string[]).includes(raw)
        ? (raw as ActualFinishStatus)
        : null;
      res.json({ data: await listFinishReviews(repo, Number(req.params.projectId), status) });
    } catch (err) {
      next(err);
    }
  },
);
