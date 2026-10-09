import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  guardProject,
  projectFromParam,
  projectOfResource,
  projectOfTask,
  projectOfTaskResource,
  requireSelfOrRole,
} from "../../middleware/project-membership.js";
import { ConflictError, NotFoundError, ValidationError } from "../../middleware/error.js";
import { getProject } from "../projects/projects.service.js";
import { loadCalendar } from "../scheduling/calendar.repository.js";
import {
  RESOURCE_TYPES,
  addProjectResource,
  assignTaskResource,
  listAssignmentsForEmployee,
  listAssignmentsForProject,
  listProjectResources,
  listTaskResources,
  removeProjectResource,
  unassignTaskResource,
  type AssignmentRow,
  type Exec,
  type ProjectResourceRow,
  type TaskResourceRow,
} from "./resources.repository.js";
import { computeWorkload } from "./workload.service.js";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const createResourceSchema = z.object({
  employee_nip: z.string().trim().max(50).nullish(),
  employee_name: z.string().trim().max(200).nullish(),
  department_name: z.string().trim().max(200).nullish(),
  position_name: z.string().trim().max(200).nullish(),
  email: z.string().trim().email().max(200).nullish(),
  resource_name: z.string().trim().min(1).max(200),
  resource_type: z.enum(RESOURCE_TYPES),
  unit: z.string().trim().max(50).nullish(),
  max_units: z.number().min(0).nullish(),
});

const assignSchema = z.object({
  resource_id: z.number().int().positive(),
  allocation_percent: z.number().min(0).max(100).optional(),
  planned_hours: z.number().min(0).nullish(),
});

const workloadQuery = z.object({ from: dateString, to: dateString });

const exec: Exec = (sql, params) => query(sql, params);

const guardProjectResources = guardProject({ exec }, projectFromParam("id"));
const guardTask = guardProject({ exec }, projectOfTask);
const guardResource = guardProject({ exec }, projectOfResource);
const guardTaskResource = guardProject({ exec }, projectOfTaskResource);
const guardEmployeeWorkload = requireSelfOrRole("employee_nip", ["admin", "manager"]);

function idParam(value: string, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${name}`);
  return n;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request");
  return parsed.data;
}

function isUniqueViolation(err: unknown): boolean {
  const number = (err as { number?: number } | undefined)?.number;
  return number === 2601 || number === 2627;
}

function isForeignKeyViolation(err: unknown): boolean {
  return (err as { number?: number } | undefined)?.number === 547;
}

function resourceDTO(r: ProjectResourceRow) {
  return {
    id: r.resource_id,
    projectId: r.project_id,
    employeeNip: r.employee_nip,
    employeeName: r.employee_name,
    departmentName: r.department_name,
    positionName: r.position_name,
    email: r.email,
    name: r.resource_name,
    type: r.resource_type,
    unit: r.unit,
    maxUnits: Number(r.max_units),
  };
}

function assignmentDTO(r: TaskResourceRow) {
  return {
    id: r.task_resource_id,
    taskId: r.task_id,
    resourceId: r.resource_id,
    resourceName: r.resource_name,
    resourceType: r.resource_type,
    employeeNip: r.employee_nip,
    employeeName: r.employee_name,
    allocationPercent: Number(r.allocation_percent),
    plannedHours: r.planned_hours == null ? null : Number(r.planned_hours),
    maxUnits: Number(r.max_units),
  };
}

function capacityBy(assignments: AssignmentRow[]): Record<string, number> {
  const capacity: Record<string, number> = {};
  for (const a of assignments) {
    if (!a.employee_nip) continue;
    capacity[a.employee_nip] = Math.max(capacity[a.employee_nip] ?? 1, Number(a.max_units) || 1);
  }
  return capacity;
}

export const resourcesRouter = Router();
resourcesRouter.use(requireAuth);

resourcesRouter.get("/projects/:id/resources", guardProjectResources, async (req, res, next) => {
  try {
    const rows = await listProjectResources(exec, idParam(req.params.id));
    res.json({ data: rows.map(resourceDTO) });
  } catch (err) {
    next(err);
  }
});

resourcesRouter.post("/projects/:id/resources", guardProjectResources, async (req, res, next) => {
  try {
    const projectId = idParam(req.params.id);
    await getProject(exec, projectId);
    const row = await addProjectResource(exec, projectId, parse(createResourceSchema, req.body));
    if (!row) throw new NotFoundError("Resource not found after create");
    res.status(201).json({ data: resourceDTO(row) });
  } catch (err) {
    next(err);
  }
});

resourcesRouter.delete("/resources/:id", guardResource, async (req, res, next) => {
  try {
    if (!(await removeProjectResource(exec, idParam(req.params.id)))) throw new NotFoundError("Resource not found");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

resourcesRouter.get("/tasks/:id/resources", guardTask, async (req, res, next) => {
  try {
    const rows = await listTaskResources(exec, idParam(req.params.id));
    res.json({ data: rows.map(assignmentDTO) });
  } catch (err) {
    next(err);
  }
});

resourcesRouter.post("/tasks/:id/resources", guardTask, async (req, res, next) => {
  try {
    const taskId = idParam(req.params.id);
    const data = parse(assignSchema, req.body);
    try {
      const row = await assignTaskResource(exec, taskId, data);
      if (!row) throw new NotFoundError("Assignment not found after create");
      res.status(201).json({ data: assignmentDTO(row) });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("Resource already assigned to this task");
      if (isForeignKeyViolation(err)) throw new NotFoundError("Task or resource not found");
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

resourcesRouter.delete("/task-resources/:id", guardTaskResource, async (req, res, next) => {
  try {
    if (!(await unassignTaskResource(exec, idParam(req.params.id)))) throw new NotFoundError("Assignment not found");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

resourcesRouter.get("/projects/:id/workload", guardProjectResources, async (req, res, next) => {
  try {
    const project = await getProject(exec, idParam(req.params.id));
    const { from, to } = parse(workloadQuery, req.query);
    const [calendar, assignments] = await Promise.all([
      loadCalendar(exec, project.calendarId),
      listAssignmentsForProject(exec, project.id),
    ]);
    res.json({ data: computeWorkload({ assignments, calendar, from, to, capacityByResource: capacityBy(assignments) }) });
  } catch (err) {
    next(err);
  }
});

resourcesRouter.get("/resources/:employee_nip/workload", guardEmployeeWorkload, async (req, res, next) => {
  try {
    const employeeNip = parse(z.string().trim().min(1).max(50), req.params.employee_nip);
    const { from, to } = parse(workloadQuery, req.query);
    const [calendar, assignments] = await Promise.all([
      loadCalendar(exec, null),
      listAssignmentsForEmployee(exec, employeeNip),
    ]);
    res.json({ data: computeWorkload({ assignments, calendar, from, to, capacityByResource: capacityBy(assignments) }) });
  } catch (err) {
    next(err);
  }
});
