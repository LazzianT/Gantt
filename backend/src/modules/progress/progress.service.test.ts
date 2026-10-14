import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./progress.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./progress.repository.js")>();
  return {
    ...actual,
    insertProgress: vi.fn(),
    listByTask: vi.fn(),
    updateTaskProgressRollup: vi.fn(),
  };
});

vi.mock("../activity/activity.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../activity/activity.repository.js")>();
  return { ...actual, writeActivity: vi.fn() };
});

import * as activity from "../activity/activity.repository.js";
import type { ProgressRow, ProgressRollupTask } from "./progress.repository.js";
import * as repo from "./progress.repository.js";
import { reportProgress, type Exec } from "./progress.service.js";

const exec: Exec = (async () => []) as Exec;

function taskRow(overrides: Partial<ProgressRollupTask> = {}): ProgressRollupTask {
  return {
    task_id: 9,
    project_id: 7,
    parent_task_id: null,
    calendar_id: null,
    code: null,
    name: "Task",
    description: null,
    task_type: "Normal",
    start_date: null,
    finish_date: null,
    duration_days: 3,
    progress_percent: 0,
    status: "Not Started",
    priority: "Medium",
    pic_nip: null,
    pic_name: null,
    is_milestone: false,
    es_date: null,
    ef_date: null,
    ls_date: null,
    lf_date: null,
    total_float_days: null,
    free_float_days: null,
    is_critical: false,
    actual_start: null,
    actual_finish: null,
    actual_finish_status: null,
    actual_finish_submitted_by: null,
    actual_finish_submitted_at: null,
    actual_finish_reviewed_by: null,
    actual_finish_reviewed_at: null,
    actual_finish_comment: null,
    schedule_version: 0,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function progressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    progress_id: 1,
    task_id: 9,
    report_date: "2026-02-01",
    progress_percent: 100,
    actual_start: null,
    actual_finish: "2026-02-01",
    note: null,
    reported_by_nip: "1001",
    created_at: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("progress.service", () => {
  it("rejects out-of-range progress with 400 before any write", async () => {
    await expect(
      reportProgress(exec, 9, { report_date: "2026-02-01", progress_percent: 150 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      reportProgress(exec, 9, { report_date: "2026-02-01", progress_percent: -1 }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.insertProgress).not.toHaveBeenCalled();
  });

  it("reports 100 as Completed with an actual_finish", async () => {
    vi.mocked(repo.insertProgress).mockResolvedValue(progressRow());
    vi.mocked(repo.updateTaskProgressRollup).mockResolvedValue(
      taskRow({ progress_percent: 100, status: "Completed", actual_finish: "2026-02-01" }),
    );

    const result = await reportProgress(exec, 9, { report_date: "2026-02-01", progress_percent: 100 });

    expect(repo.insertProgress).toHaveBeenCalledWith(
      exec,
      expect.objectContaining({ task_id: 9, progress_percent: 100, report_date: "2026-02-01" }),
    );
    expect(repo.updateTaskProgressRollup).toHaveBeenCalledWith(exec, 9);
    expect(result.status).toBe("Completed");
    expect(result.actual_finish).toBe("2026-02-01");
  });

  it("writes an activity log for the reported progress", async () => {
    vi.mocked(repo.updateTaskProgressRollup).mockResolvedValue(taskRow({ progress_percent: 40 }));
    await reportProgress(exec, 9, { report_date: "2026-02-01", progress_percent: 40, reported_by_nip: "1001" });

    expect(activity.writeActivity).toHaveBeenCalledWith(
      exec,
      expect.objectContaining({
        project_id: 7,
        entity_type: "task",
        entity_id: 9,
        action: "update",
        actor_nip: "1001",
      }),
    );
  });

  it("404s without a log when the task does not exist", async () => {
    vi.mocked(repo.updateTaskProgressRollup).mockResolvedValue(null);
    await expect(
      reportProgress(exec, 9, { report_date: "2026-02-01", progress_percent: 50 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(activity.writeActivity).not.toHaveBeenCalled();
  });
});
