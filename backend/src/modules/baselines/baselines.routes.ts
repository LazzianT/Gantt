import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { guardProject, projectFromParam, projectOfBaseline } from "../../middleware/project-membership.js";
import { ValidationError } from "../../middleware/error.js";
import { capture, list, variance, type Exec } from "./baselines.service.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

const exec: Exec = (sql, params) => query(sql, params);

const guardProjectBaselines = guardProject({ exec }, projectFromParam("id"));
const guardBaseline = guardProject({ exec }, projectOfBaseline);

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

export const baselinesRouter = Router();
baselinesRouter.use(requireAuth);

baselinesRouter.post("/projects/:id/baselines", guardProjectBaselines, async (req, res, next) => {
  try {
    const { name } = parse(createSchema, req.body);
    const data = await capture(exec, idParam(req.params.id), name, req.user?.sub ?? null);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

baselinesRouter.get("/projects/:id/baselines", guardProjectBaselines, async (req, res, next) => {
  try {
    res.json({ data: await list(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});

baselinesRouter.get("/baselines/:id/variance", guardBaseline, async (req, res, next) => {
  try {
    res.json({ data: await variance(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});
