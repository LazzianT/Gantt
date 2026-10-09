import { closePool } from "../config/database.js";
import { getPool, query, sql } from "../db/pool.js";
import { create as createTask, type TaskType } from "../modules/tasks/tasks.repository.js";
import { create as createDependency } from "../modules/dependencies/dependencies.repository.js";
import { addProjectResource, assignTaskResource } from "../modules/resources/resources.repository.js";
import { addMilestone } from "../modules/milestones/milestones.repository.js";
import { addMember, createProject } from "../modules/projects/projects.repository.js";
import { recomputeProject } from "../modules/scheduling/schedule.service.js";

const PROJECT_CODE = "PRJ-HRIS";

type TxExec = (text: string, params?: Record<string, unknown>) => Promise<any[]>;

interface SeedTask {
  key: string;
  name: string;
  type: TaskType;
  durationDays?: number;
  children?: SeedTask[];
}

const WBS: SeedTask[] = [
  {
    key: "planning",
    name: "Planning",
    type: "Summary",
    children: [
      { key: "rg", name: "Requirement Gathering", type: "Normal", durationDays: 3 },
      { key: "ra", name: "Requirement Analysis", type: "Normal", durationDays: 4 },
      { key: "rappr", name: "Requirements Approved", type: "Milestone" },
    ],
  },
  {
    key: "development",
    name: "Development",
    type: "Summary",
    children: [
      {
        key: "backend",
        name: "Backend",
        type: "Summary",
        children: [
          { key: "auth", name: "Authentication", type: "Normal", durationDays: 5 },
          { key: "api", name: "API Development", type: "Normal", durationDays: 8 },
          { key: "db", name: "Database Design", type: "Normal", durationDays: 4 },
        ],
      },
      {
        key: "frontend",
        name: "Frontend",
        type: "Summary",
        children: [
          { key: "dash", name: "Dashboard UI", type: "Normal", durationDays: 6 },
          { key: "pw", name: "Project Workspace UI", type: "Normal", durationDays: 9 },
        ],
      },
    ],
  },
  {
    key: "deployment",
    name: "Deployment",
    type: "Summary",
    children: [
      { key: "uat", name: "UAT", type: "Normal", durationDays: 5 },
      { key: "rel", name: "Production Release", type: "Milestone" },
    ],
  },
];

// FS chain in WBS order; summaries are excluded by the guard below.
const CHAIN = ["rg", "ra", "rappr", "db", "auth", "api", "dash", "pw", "uat", "rel"];

function iso(value: unknown): string {
  if (value == null) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

async function main(): Promise<void> {
  console.log(`=== Seed demo project ${PROJECT_CODE} ===`);

  const existing = await query<{ project_id: number }>(
    `SELECT project_id FROM pm.projects WHERE code = @code`,
    { code: PROJECT_CODE },
  );
  if (existing.length > 0) {
    console.log(`Project ${PROJECT_CODE} already exists (project_id=${existing[0].project_id}). Nothing to do.`);
    console.log(`URL: /projects/${existing[0].project_id}`);
    return;
  }

  const employees = await query<{ NIP: string; Name: string }>(
    `SELECT TOP 3 NIP, RTRIM(Name) AS Name FROM CORP_DB.dbo.hris_worker WHERE is_Active='1' ORDER BY Name`,
  );
  if (employees.length === 0) {
    console.error("ABORT: no active employees found in CORP_DB.dbo.hris_worker (is_Active='1').");
    process.exitCode = 1;
    return;
  }
  console.log(`[1/9] Employees: ${employees.map((e) => `${e.NIP}=${e.Name}`).join(", ")}`);

  const calendars = await query<{ calendar_id: number }>(
    `SELECT TOP 1 calendar_id FROM pm.work_calendars WHERE is_default = 1`,
  );
  if (calendars.length === 0) {
    console.error("ABORT: no default work calendar (pm.work_calendars.is_default = 1).");
    process.exitCode = 1;
    return;
  }
  const calendarId = calendars[0].calendar_id;
  console.log(`[2/9] Default calendar_id=${calendarId}`);

  const manager = employees[0];
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  // A SQL transaction allows one in-flight request; serialize so the
  // concurrent reads inside recomputeProject's Promise.all stay ordered.
  let queue: Promise<unknown> = Promise.resolve();
  const txExec: TxExec = (text, params = {}) => {
    const run = queue.then(async () => {
      const request = new sql.Request(tx);
      for (const [name, value] of Object.entries(params)) request.input(name, value);
      const result = await request.query(text);
      return result.recordset;
    });
    queue = run.catch(() => undefined);
    return run;
  };

  let begun = false;
  try {
    await tx.begin();
    begun = true;

    const project = await createProject(txExec, {
      code: PROJECT_CODE,
      name: "Aplikasi HRIS",
      description: "Platform HRIS internal: manajemen karyawan, absensi, payroll.",
      manager_nip: manager.NIP,
      manager_name: manager.Name,
      start_date: "2026-01-05",
      target_end_date: "2026-06-30",
      priority: "High",
      status: "Active",
      health: "On Track",
      calendar_id: calendarId,
    });
    if (!project) throw new Error("Failed to insert project row");
    const projectId = project.project_id;
    console.log(`[3/9] Project inserted: project_id=${projectId}`);

    const memberRoles = ["Manager", "Developer", "Analyst"];
    for (let i = 0; i < employees.length; i += 1) {
      await addMember(txExec, projectId, {
        employee_nip: employees[i].NIP,
        employee_name: employees[i].Name,
        role: memberRoles[i] ?? "Developer",
        allocation_percent: 100,
      });
    }
    console.log(`[4/9] Members inserted: ${employees.length}`);

    const ids = new Map<string, number>();
    const typeByKey = new Map<string, TaskType>();
    let order = 0;
    const insertTree = async (tasks: SeedTask[], parentId: number | null): Promise<void> => {
      for (const task of tasks) {
        order += 1;
        const isMilestone = task.type === "Milestone";
        const row = await createTask(txExec, {
          project_id: projectId,
          parent_task_id: parentId,
          name: task.name,
          task_type: task.type,
          start_date: null,
          duration_days: isMilestone ? 0 : task.durationDays ?? 0,
          status: "Not Started",
          priority: "Medium",
          is_milestone: isMilestone,
          sort_order: order,
        });
        if (!row) throw new Error(`Failed to insert task "${task.name}"`);
        ids.set(task.key, row.task_id);
        typeByKey.set(task.key, task.type);
        if (task.children) await insertTree(task.children, row.task_id);
      }
    };
    await insertTree(WBS, null);
    console.log(`[5/9] WBS inserted: ${ids.size} tasks (parents first)`);

    let depCount = 0;
    for (let i = 1; i < CHAIN.length; i += 1) {
      const pred = CHAIN[i - 1];
      const succ = CHAIN[i];
      if (typeByKey.get(pred) === "Summary" || typeByKey.get(succ) === "Summary") continue;
      await createDependency(txExec, {
        project_id: projectId,
        predecessor_task_id: ids.get(pred)!,
        successor_task_id: ids.get(succ)!,
        dependency_type: "FS",
        lag_days: 0,
      });
      depCount += 1;
    }
    console.log(`[6/9] Dependencies inserted: ${depCount} (FS, lag 0)`);

    const resourceIds = new Map<string, number>();
    for (const e of employees) {
      const res = await addProjectResource(txExec, projectId, {
        employee_nip: e.NIP,
        employee_name: e.Name,
        resource_name: e.Name,
        resource_type: "Employee",
        max_units: 1,
      });
      if (!res) throw new Error(`Failed to insert project_resource for ${e.NIP}`);
      resourceIds.set(e.NIP, res.resource_id);
    }
    const assignments: Array<{ taskKey: string; nip: string; allocation: number }> = [
      { taskKey: "auth", nip: employees[0].NIP, allocation: 50 },
      { taskKey: "api", nip: employees[1].NIP, allocation: 100 },
      { taskKey: "dash", nip: employees[2].NIP, allocation: 100 },
    ];
    for (const a of assignments) {
      await assignTaskResource(txExec, ids.get(a.taskKey)!, {
        resource_id: resourceIds.get(a.nip)!,
        allocation_percent: a.allocation,
      });
    }
    console.log(`[7/9] Task resources assigned: ${assignments.length}`);

    await addMilestone(txExec, projectId, {
      task_id: ids.get("rappr")!,
      name: "Requirements Approved",
      due_date: null,
    });
    await addMilestone(txExec, projectId, {
      task_id: ids.get("rel")!,
      name: "Production Release",
      due_date: null,
    });
    console.log(`[8/9] Milestones inserted: 2 (due dates filled after compute)`);

    const schedule = await recomputeProject(txExec, projectId);

    await txExec(
      `UPDATE m SET m.due_date = t.ef_date
       FROM pm.project_milestones m
       JOIN pm.project_tasks t ON t.task_id = m.task_id
       WHERE m.project_id = @projectId AND m.task_id IS NOT NULL`,
      { projectId },
    );

    await tx.commit();
    begun = false;

    console.log(`[9/9] Schedule computed: version=${schedule.scheduleVersion}`);
    console.log(`projectFinish=${schedule.projectFinish} projectDuration=${schedule.projectDuration}`);
    console.log(`criticalPath=[${schedule.criticalPath.join(", ")}]`);

    const computed = await query<Record<string, unknown>>(
      `SELECT name, task_type, duration_days, es_date, ef_date, total_float_days, is_critical
       FROM pm.project_tasks WHERE project_id = @projectId AND is_deleted = 0
       ORDER BY sort_order, task_id`,
      { projectId },
    );
    console.table(
      computed.map((t) => ({
        name: t.name,
        task_type: t.task_type,
        duration_days: t.duration_days,
        es_date: iso(t.es_date),
        ef_date: iso(t.ef_date),
        total_float_days: t.total_float_days,
        is_critical: t.is_critical,
      })),
    );
    console.log(`URL: /projects/${projectId}`);
  } catch (err) {
    if (begun) await tx.rollback().catch(() => undefined);
    console.error("SEED FAILED — transaction rolled back.");
    if (err instanceof Error) console.error(`${err.name}: ${err.message}`);
    else console.error(String(err));
    process.exitCode = 1;
    return;
  }
}

main()
  .then(async () => {
    const [count] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM pm.projects`);
    const top = await query(
      `SELECT TOP 5 code, name, status, health FROM pm.projects ORDER BY project_id`,
    );
    const [deps] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM pm.task_dependencies`);
    console.log(`pm.projects count = ${count.n}`);
    console.table(top);
    console.log(`pm.task_dependencies count = ${deps.n}`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
