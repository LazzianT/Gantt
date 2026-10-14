import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { ValidationError } from "../../middleware/error.js";
import { guardProject, projectFromParam } from "../../middleware/project-membership.js";
import { projectReports, type Exec } from "./reports.service.js";

const exec: Exec = (sql, params) => query(sql, params);
const guardReports = guardProject({ exec }, projectFromParam("id"));

function idParam(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid id");
  return id;
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth);
reportsRouter.get("/projects/:id/reports", guardReports, async (req, res, next) => {
  try {
    res.json({ data: await projectReports(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});