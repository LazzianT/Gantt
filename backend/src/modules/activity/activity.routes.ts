import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { guardProject, projectFromParam } from "../../middleware/project-membership.js";
import { ValidationError } from "../../middleware/error.js";
import { listActivity, type Exec } from "./activity.repository.js";

const exec: Exec = (sql, params) => query(sql, params);

const guardProjectActivity = guardProject({ exec }, projectFromParam("id"));

function idParam(value: string, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${name}`);
  return n;
}

export const activityRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get("/projects/:id/activity", guardProjectActivity, async (req, res, next) => {
  try {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isFinite(limit)) throw new ValidationError("Invalid limit");
    res.json({ data: await listActivity(exec, idParam(req.params.id), limit) });
  } catch (err) {
    next(err);
  }
});
