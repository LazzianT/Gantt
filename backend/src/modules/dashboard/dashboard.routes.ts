import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { guardProject, projectFromParam } from "../../middleware/project-membership.js";
import { ValidationError } from "../../middleware/error.js";
import { PROJECT_HEALTHS, PROJECT_STATUSES } from "../projects/projects.repository.js";
import type { Exec } from "./dashboard.repository.js";
import { getGlobalDashboard, getMyTasksDashboard, getPortfolio, getProjectDashboard } from "./dashboard.service.js";

const portfolioQuery = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  health: z.enum(PROJECT_HEALTHS).optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

const exec: Exec = (sql, params) => query(sql, params);

const guardProjectDashboard = guardProject({ exec }, projectFromParam("id"));

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request");
  return parsed.data;
}

function idParam(value: string, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${name}`);
  return n;
}

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/dashboard", async (req, res, next) => {
  try {
    res.json({ data: await getGlobalDashboard(exec, req.user!) });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/dashboard/my-tasks", async (req, res, next) => {
  try {
    res.json({ data: await getMyTasksDashboard(exec, req.user!) });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/portfolio", async (req, res, next) => {
  try {
    res.json({ data: await getPortfolio(exec, parse(portfolioQuery, req.query)) });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/projects/:id/dashboard", guardProjectDashboard, async (req, res, next) => {
  try {
    res.json({ data: await getProjectDashboard(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});
