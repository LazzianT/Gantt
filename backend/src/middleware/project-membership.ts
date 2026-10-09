import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Exec } from "../modules/projects/projects.repository.js";
import { ForbiddenError, NotFoundError, ValidationError } from "./error.js";

export type Role = "admin" | "manager" | "member" | "viewer";

export interface ProjectAuthOptions {
  /** Exec runner bound to a real DB pool/query helper. */
  exec: Exec;
  /** Roles allowed to bypass the membership check (org-wide access). */
  bypassRoles?: Role[];
}

const DEFAULT_BYPASS: Role[] = ["admin", "manager"];

/**
 * Resolves the owning project id for a request, or `null` when the referenced entity does not exist.
 * Throwing a ValidationError (bad id shape) or returning null (unknown id) both surface as errors.
 */
export type ProjectResolver = (exec: Exec, req: Request) => Promise<number | null>;

function numericParam(req: Request, name: string): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${name}`);
  return n;
}

async function projectOf(exec: Exec, sql: string, params: Record<string, unknown>): Promise<number | null> {
  const rows = await exec(sql, params);
  const id = (rows[0] as { project_id?: number } | undefined)?.project_id;
  return id == null ? null : Number(id);
}

/** Project id read straight from a route param; verifies the project exists and is not soft-deleted. */
export const projectFromParam =
  (name = "id"): ProjectResolver =>
  async (exec, req) => {
    const id = numericParam(req, name);
    const rows = await exec(`SELECT project_id FROM pm.projects WHERE project_id = @id AND is_deleted = 0`, { id });
    return rows.length > 0 ? id : null;
  };

export const projectOfTask: ProjectResolver = (exec, req) =>
  projectOf(exec, `SELECT project_id FROM pm.project_tasks WHERE task_id = @id`, { id: numericParam(req, "id") });

export const projectOfDependency: ProjectResolver = (exec, req) =>
  projectOf(exec, `SELECT project_id FROM pm.task_dependencies WHERE dependency_id = @id`, {
    id: numericParam(req, "id"),
  });

export const projectOfMilestone: ProjectResolver = (exec, req) =>
  projectOf(exec, `SELECT project_id FROM pm.project_milestones WHERE milestone_id = @id`, {
    id: numericParam(req, "id"),
  });

export const projectOfResource: ProjectResolver = (exec, req) =>
  projectOf(exec, `SELECT project_id FROM pm.project_resources WHERE resource_id = @id`, {
    id: numericParam(req, "id"),
  });

export const projectOfTaskResource: ProjectResolver = (exec, req) =>
  projectOf(
    exec,
    `SELECT t.project_id FROM pm.task_resources tr
      JOIN pm.project_tasks t ON t.task_id = tr.task_id
     WHERE tr.task_resource_id = @id`,
    { id: numericParam(req, "id") },
  );

export const projectOfBaseline: ProjectResolver = (exec, req) =>
  projectOf(exec, `SELECT project_id FROM pm.project_baselines WHERE baseline_id = @id`, {
    id: numericParam(req, "id"),
  });

/** True when `nip` has a row in pm.project_members for the project. */
export async function isProjectMember(exec: Exec, projectId: number, nip: string): Promise<boolean> {
  const rows = await exec(`SELECT 1 FROM pm.project_members WHERE project_id = @projectId AND employee_nip = @nip`, {
    projectId,
    nip,
  });
  return rows.length > 0;
}

function requireAccess(options: ProjectAuthOptions, resolve: ProjectResolver) {
  const { exec, bypassRoles = DEFAULT_BYPASS } = options;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user || typeof user.sub !== "string") {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid token" } });
      return;
    }
    // Project-department managers (see requireProjectDepartment) may open any project,
    // matching the create/edit/delete rights granted by HRIS department.
    if (bypassRoles.includes(user.role) || user.canManageProjects === true) {
      next();
      return;
    }
    try {
      const projectId = await resolve(exec, req);
      if (projectId == null) throw new NotFoundError("Project not found");
      if (!(await isProjectMember(exec, projectId, user.sub))) throw new ForbiddenError("Project access denied");
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Guard for routes whose project id lives at `req.params.id` (or another named param).
 * Admin/manager (and project-department managers) bypass; everyone else must be a member.
 */
export function requireProjectMembership(options: ProjectAuthOptions & { param?: string }): RequestHandler {
  return requireAccess(options, projectFromParam(options.param ?? "id"));
}

/** Guard for routes that address a nested entity (task, dependency, milestone, ...). */
export function guardProject(options: ProjectAuthOptions, resolve: ProjectResolver): RequestHandler {
  return requireAccess(options, resolve);
}

/** Allows the caller when their `sub` equals the named route param, or when they hold one of `roles`. */
export function requireSelfOrRole(paramName: string, roles: Role[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid token" } });
      return;
    }
    const target = req.params[paramName];
    if (roles.includes(user.role) || (typeof target === "string" && target === user.sub)) {
      next();
      return;
    }
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient role" } });
  };
}
