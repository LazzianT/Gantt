import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { guardProject, projectFromParam } from "../../middleware/project-membership.js";
import { ValidationError } from "../../middleware/error.js";
import { recomputeProject, type Exec } from "./schedule.service.js";

const exec: Exec = (sql, params) => query(sql, params);

const guardProjectSchedule = guardProject({ exec }, projectFromParam("id"));

function idParam(value: string, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${name}`);
  return n;
}

export const scheduleRouter = Router();
scheduleRouter.use(requireAuth);

scheduleRouter.get("/projects/:id/schedule", guardProjectSchedule, async (req, res, next) => {
  try {
    res.json({ data: await recomputeProject(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});
