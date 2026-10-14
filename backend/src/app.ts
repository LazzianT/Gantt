import cors from "cors";
import express, { type Express } from "express";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { activityRouter } from "./modules/activity/activity.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { baselinesRouter } from "./modules/baselines/baselines.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { dependenciesRouter } from "./modules/dependencies/dependencies.routes.js";
import { createEmployeesRouter } from "./modules/employees/employees.routes.js";
import { evidenceRouter } from "./modules/evidence/evidence.routes.js";
import { milestonesRouter } from "./modules/milestones/milestones.routes.js";
import { progressRouter } from "./modules/progress/progress.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { resourcesRouter } from "./modules/resources/resources.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { scheduleRouter } from "./modules/scheduling/schedule.routes.js";
import { tasksRouter } from "./modules/tasks/tasks.routes.js";

/** `configure` runs before the 404/error handlers so callers can add routes (e.g. /readyz). */
export function createApp(configure?: (app: Express) => void): Express {
  const app = express();
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  configure?.(app);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/projects", projectsRouter);
  app.use("/api/v1", tasksRouter);
  app.use("/api/v1", evidenceRouter);
  app.use("/api/v1", dependenciesRouter);
  app.use("/api/v1", scheduleRouter);
  app.use("/api/v1", resourcesRouter);
  app.use("/api/v1", reportsRouter);
  app.use("/api/v1", activityRouter);
  app.use("/api/v1", milestonesRouter);
  app.use("/api/v1", progressRouter);
  app.use("/api/v1", baselinesRouter);
  app.use("/api/v1", dashboardRouter);
  app.use("/api/v1", createEmployeesRouter());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
