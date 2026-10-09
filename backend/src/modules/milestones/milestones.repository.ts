export const MILESTONE_STATUSES = ["Not Started", "In Progress", "Completed", "Missed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface MilestoneRow {
  milestone_id: number;
  project_id: number;
  task_id: number | null;
  name: string;
  due_date: Date | string | null;
  status: MilestoneStatus;
  created_at: Date | string;
}

export interface AddMilestoneData {
  task_id?: number | null;
  name: string;
  due_date?: string | null;
  status?: MilestoneStatus;
}

const SELECT = `SELECT milestone_id, project_id, task_id, name, due_date, status, created_at
FROM pm.project_milestones`;

export async function listMilestones(exec: Exec, projectId: number): Promise<MilestoneRow[]> {
  return exec(`${SELECT} WHERE project_id = @projectId ORDER BY due_date, milestone_id`, { projectId });
}

export async function addMilestone(
  exec: Exec,
  projectId: number,
  data: AddMilestoneData,
): Promise<MilestoneRow | null> {
  const rows = await exec(
    `INSERT INTO pm.project_milestones (project_id, task_id, name, due_date, status)
     OUTPUT INSERTED.milestone_id
     VALUES (@projectId, @task_id, @name, @due_date, COALESCE(@status, 'Not Started'))`,
    {
      projectId,
      task_id: data.task_id ?? null,
      name: data.name,
      due_date: data.due_date ?? null,
      status: data.status ?? null,
    },
  );
  const id = rows[0]?.milestone_id;
  if (id == null) return null;
  const created = await exec(`${SELECT} WHERE milestone_id = @id`, { id });
  return (created[0] as MilestoneRow | undefined) ?? null;
}

export async function removeMilestone(exec: Exec, id: number): Promise<boolean> {
  const rows = await exec(`DELETE FROM pm.project_milestones OUTPUT DELETED.milestone_id WHERE milestone_id = @id`, {
    id,
  });
  return rows.length > 0;
}
