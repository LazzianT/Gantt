import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireProjectDepartment, requireRole } from "../../middleware/auth.js";
import { requireProjectMembership } from "../../middleware/project-membership.js";
import { ValidationError } from "../../middleware/error.js";
import type { Role } from "../auth/auth.service.js";
import {
  PROJECT_HEALTHS,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  type Exec,
} from "./projects.repository.js";
import {
  addMember,
  createProject,
  getMember,
  getProject,
  listMemberProjects,
  listMembers,
  listProjects,
  nextProjectCode,
  removeMember,
  softDeleteProject,
  updateProject,
} from "./projects.service.js";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const createSchema = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().nullish(),
  manager_nip: z.string().trim().max(50).nullish(),
  manager_name: z.string().trim().max(200).nullish(),
  start_date: dateString.nullish(),
  target_end_date: dateString.nullish(),
  priority: z.enum(PROJECT_PRIORITIES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  health: z.enum(PROJECT_HEALTHS).optional(),
  calendar_id: z.number().int().positive().nullish(),
});

const patchSchema = createSchema.partial();

const memberSchema = z.object({
  employee_nip: z.string().trim().min(1).max(50),
  employee_name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(100).nullish(),
  allocation_percent: z.number().min(0).max(100).nullish(),
});

const exec: Exec = (sql, params) => query(sql, params);

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

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new ValidationError(`Invalid ${field}`);
  return value as T;
}

function normalizeRole(role: unknown): Role | undefined {
  return typeof role === "string" ? (role as Role) : undefined;
}

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

/** Lightweight self-check endpoint for IT staff: current role + any projects where the caller is a member. */
projectsRouter.get("/auth-status", async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw new ValidationError("Not authenticated");

    const role = normalizeRole(user.role) ?? "member";
    // Admin/manager see the full portfolio; everyone else sees only their own projects.
    const memberProjects =
      role === "admin" || role === "manager"
        ? await listProjects(exec)
        : await listMemberProjects(exec, user.sub);

    res.json({
      data: {
        nip: user.sub,
        name: user.name ?? null,
        role,
        memberProjectCount: memberProjects.length,
        memberProjects: memberProjects.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          status: p.status,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/next-code", requireProjectDepartment(), async (_req, res, next) => {
  try {
    res.json({ data: { code: await nextProjectCode(exec) } });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/:id/access", requireProjectMembership({ exec }), async (req, res, next) => {
  try {
    const projectId = idParam(req.params.id);
    const project = await getProject(exec, projectId);
    const user = req.user;
    if (!user) throw new ValidationError("Not authenticated");

    const member = await getMember(exec, projectId, user.sub);
    res.json({
      data: {
        projectId: project.id,
        memberId: member?.id ?? null,
        isMember: Boolean(member),
        membership: member
          ? {
              employeeNip: member.employeeNip,
              employeeName: member.employeeName,
              role: member.role,
              allocationPercent: member.allocationPercent,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/", async (req, res, next) => {
  try {
    const status = optionalEnum(req.query.status, PROJECT_STATUSES, "status");
    const health = optionalEnum(req.query.health, PROJECT_HEALTHS, "health");
    const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
    res.json({ data: await listProjects(exec, { status, health, q }) });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post("/", requireProjectDepartment(), async (req, res, next) => {
  try {
    res.status(201).json({ data: await createProject(exec, parse(createSchema, req.body)) });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/:id", async (req, res, next) => {
  try {
    res.json({ data: await getProject(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch("/:id", requireProjectDepartment(), async (req, res, next) => {
  try {
    res.json({ data: await updateProject(exec, idParam(req.params.id), parse(patchSchema, req.body)) });
  } catch (err) {
    next(err);
  }
});

projectsRouter.delete("/:id", requireProjectDepartment(), async (req, res, next) => {
  try {
    await softDeleteProject(exec, idParam(req.params.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/:id/members", async (req, res, next) => {
  try {
    res.json({ data: await listMembers(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post("/:id/members", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const member = await addMember(exec, idParam(req.params.id), parse(memberSchema, req.body));
    res.status(201).json({ data: member });
  } catch (err) {
    next(err);
  }
});

projectsRouter.delete("/:id/members/:memberId", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    await removeMember(exec, idParam(req.params.id), idParam(req.params.memberId, "memberId"));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
