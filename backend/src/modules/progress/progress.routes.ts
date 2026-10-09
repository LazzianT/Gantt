import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { guardProject, projectOfTask } from "../../middleware/project-membership.js";
import { ValidationError } from "../../middleware/error.js";
import { listByTask, type Exec } from "./progress.repository.js";
import { reportProgress } from "./progress.service.js";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const reportSchema = z.object({
  report_date: dateString,
  progress_percent: z.number().min(0).max(100),
  actual_start: dateString.nullish(),
  actual_finish: dateString.nullish(),
  note: z.string().max(500).nullish(),
  reported_by_nip: z.string().trim().max(50).nullish(),
});

const exec: Exec = (sql, params) => query(sql, params);

const guardTask = guardProject({ exec }, projectOfTask);

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

export const progressRouter = Router();
progressRouter.use(requireAuth);

progressRouter.post("/tasks/:id/progress", guardTask, async (req, res, next) => {
  try {
    const body = parse(reportSchema, req.body);
    const data = await reportProgress(exec, idParam(req.params.id), {
      ...body,
      reported_by_nip: body.reported_by_nip ?? req.user?.sub ?? null,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

progressRouter.get("/tasks/:id/progress", guardTask, async (req, res, next) => {
  try {
    res.json({ data: await listByTask(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});
