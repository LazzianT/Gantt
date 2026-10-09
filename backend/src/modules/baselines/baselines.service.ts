import { NotFoundError } from "../../middleware/error.js";
import {
  createBaseline,
  getBaseline,
  getBaselineTasks,
  getCurrentTasks,
  listBaselines,
  type BaselineRow,
  type BaselineWithCount,
  type Exec,
} from "./baselines.repository.js";

export { type Exec } from "./baselines.repository.js";

export interface VarianceRow {
  task_id: number;
  name: string | null;
  baseline_start: string | null;
  current_start: string | null;
  start_variance_days: number | null;
  baseline_finish: string | null;
  current_finish: string | null;
  finish_variance_days: number | null;
  slip: boolean;
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Whole-day difference; positive means `current` is later than `baseline` (a slip). */
function diffDays(current: string | null, baseline: string | null): number | null {
  if (!current || !baseline) return null;
  return Math.round((Date.parse(current) - Date.parse(baseline)) / 86_400_000);
}

export async function capture(
  exec: Exec,
  projectId: number,
  name: string,
  capturedBy: string | null,
): Promise<BaselineWithCount | null> {
  return createBaseline(exec, projectId, name, capturedBy);
}

export async function list(exec: Exec, projectId: number): Promise<BaselineRow[]> {
  return listBaselines(exec, projectId);
}

export async function variance(exec: Exec, baselineId: number): Promise<VarianceRow[]> {
  const baseline = await getBaseline(exec, baselineId);
  if (!baseline) throw new NotFoundError("Baseline not found");

  const [baselineTasks, currentTasks] = await Promise.all([
    getBaselineTasks(exec, baselineId),
    getCurrentTasks(exec, baseline.project_id),
  ]);
  const currentById = new Map(currentTasks.map((t) => [t.task_id, t]));

  return baselineTasks.map((bt): VarianceRow => {
    const current = currentById.get(bt.task_id) ?? null;
    const baselineStart = toIso(bt.start_date);
    const currentStart = toIso(current?.start_date);
    const baselineFinish = toIso(bt.finish_date);
    const currentFinish = toIso(current?.finish_date);
    const finishVariance = diffDays(currentFinish, baselineFinish);
    return {
      task_id: bt.task_id,
      name: bt.task_name,
      baseline_start: baselineStart,
      current_start: currentStart,
      start_variance_days: diffDays(currentStart, baselineStart),
      baseline_finish: baselineFinish,
      current_finish: currentFinish,
      finish_variance_days: finishVariance,
      slip: finishVariance != null && finishVariance > 0,
    };
  });
}
