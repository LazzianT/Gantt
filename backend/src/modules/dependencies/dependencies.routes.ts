import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { guardProject, projectFromParam, projectOfDependency, projectOfTask } from "../../middleware/project-membership.js";
import { ValidationError } from "../../middleware/error.js";
import {
  DEPENDENCY_TYPES,
  createDependency,
  deleteDependency,
  listDependencies,
  type Exec,
} from "./dependencies.service.js";

const createSchema = z.object({
  predecessor_task_id: z.number().int().positive(),
  dependency_type: z.enum(DEPENDENCY_TYPES).optional(),
  lag_days: z.number().int().optional(),
});

const exec: Exec = (sql, params) => query(sql, params);

const guardProjectDeps = guardProject({ exec }, projectFromParam("projectId"));
const guardSuccessorTask = guardProject({ exec }, projectOfTask);
const guardDependency = guardProject({ exec }, projectOfDependency);

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

export const dependenciesRouter = Router();
dependenciesRouter.use(requireAuth);

dependenciesRouter.get("/projects/:projectId/dependencies", guardProjectDeps, async (req, res, next) => {
  try {
    res.json({ data: await listDependencies(exec, idParam(req.params.projectId, "projectId")) });
  } catch (err) {
    next(err);
  }
});

// The task in the path is the successor; the body names its predecessor.
dependenciesRouter.post("/tasks/:id/dependencies", guardSuccessorTask, async (req, res, next) => {
  try {
    const body = parse(createSchema, req.body);
    const data = await createDependency(exec, {
      predecessor_task_id: body.predecessor_task_id,
      successor_task_id: idParam(req.params.id),
      dependency_type: body.dependency_type ?? "FS",
      lag_days: body.lag_days ?? 0,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

dependenciesRouter.delete("/dependencies/:id", guardDependency, async (req, res, next) => {
  try {
    await deleteDependency(exec, idParam(req.params.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
