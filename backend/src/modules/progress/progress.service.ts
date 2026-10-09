import { NotFoundError, ValidationError } from "../../middleware/error.js";
import { writeActivity } from "../activity/activity.repository.js";
import { insertProgress, updateTaskProgressRollup, type Exec, type ProgressRollupTask } from "./progress.repository.js";

export { type Exec } from "./progress.repository.js";

export interface ReportProgressInput {
  report_date: string;
  progress_percent: number;
  actual_start?: string | null;
  actual_finish?: string | null;
  note?: string | null;
  reported_by_nip?: string | null;
}

export async function reportProgress(
  exec: Exec,
  taskId: number,
  input: ReportProgressInput,
): Promise<ProgressRollupTask> {
  if (input.progress_percent < 0 || input.progress_percent > 100) {
    throw new ValidationError("progress_percent must be between 0 and 100");
  }

  await insertProgress(exec, { ...input, task_id: taskId });

  const task = await updateTaskProgressRollup(exec, taskId);
  if (!task) throw new NotFoundError("Task not found");

  await writeActivity(exec, {
    project_id: task.project_id,
    entity_type: "task",
    entity_id: taskId,
    action: "update",
    actor_nip: input.reported_by_nip ?? null,
    detail: {
      progress_percent: input.progress_percent,
      report_date: input.report_date,
      actual_start: input.actual_start ?? null,
      actual_finish: input.actual_finish ?? null,
    },
  });

  return task;
}
