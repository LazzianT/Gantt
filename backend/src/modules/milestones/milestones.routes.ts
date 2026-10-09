import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { guardProject, projectFromParam, projectOfMilestone } from "../../middleware/project-membership.js";
import { NotFoundError, ValidationError } from "../../middleware/error.js";
import {
  MILESTONE_STATUSES,
  addMilestone,
  listMilestones,
  removeMilestone,
  type Exec,
} from "./milestones.repository.js";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const createSchema = z.object({
  task_id: z.number().int().positive().nullish(),
  name: z.string().trim().min(1).max(200),
  due_date: dateString.nullish(),
  status: z.enum(MILESTONE_STATUSES).optional(),
});

const exec: Exec = (sql, params) => query(sql, params);

const guardProjectMilestones = guardProject({ exec }, projectFromParam("id"));
const guardMilestone = guardProject({ exec }, projectOfMilestone);

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

export const milestonesRouter = Router();
milestonesRouter.use(requireAuth);

milestonesRouter.get("/projects/:id/milestones", guardProjectMilestones, async (req, res, next) => {
  try {
    res.json({ data: await listMilestones(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});

milestonesRouter.post("/projects/:id/milestones", guardProjectMilestones, async (req, res, next) => {
  try {
    const body = parse(createSchema, req.body);
    res.status(201).json({ data: await addMilestone(exec, idParam(req.params.id), body) });
  } catch (err) {
    next(err);
  }
});

milestonesRouter.delete("/milestones/:id", guardMilestone, async (req, res, next) => {
  try {
    if (!(await removeMilestone(exec, idParam(req.params.id)))) throw new NotFoundError("Milestone not found");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
