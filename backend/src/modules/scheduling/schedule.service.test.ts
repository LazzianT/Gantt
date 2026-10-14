import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../projects/projects.repository.js", () => ({
  getProject: vi.fn(),
  bumpScheduleVersion: vi.fn(),
}));

vi.mock("../tasks/tasks.repository.js", () => ({
  listProject: vi.fn(),
  updateScheduleFields: vi.fn(),
}));

vi.mock("../dependencies/dependencies.repository.js", () => ({
  listByProject: vi.fn(),
}));

vi.mock("./calendar.repository.js", () => ({
  loadCalendar: vi.fn(),
}));

import * as projectsRepo from "../projects/projects.repository.js";
import * as tasksRepo from "../tasks/tasks.repository.js";
import * as depsRepo from "../dependencies/dependencies.repository.js";
import * as calendarRepo from "./calendar.repository.js";
import type { ProjectRow } from "../projects/projects.repository.js";
import type { TaskRow } from "../tasks/tasks.repository.js";
import { recomputeProject, type Exec } from "./schedule.service.js";

const exec: Exec = (async () => []) as Exec;

function projectRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    project_id: 7,
    code: "PRJ-1",
    name: "Migration",
    description: null,
    manager_nip: null,
    manager_name: null,
    start_date: "2026-01-05", // Monday
    target_end_date: null,
    priority: "Medium",
    status: "Active",
    health: "On Track",
    calendar_id: 1,
    schedule_version: 4,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    task_count: 0,
    done_count: 0,
    total_duration: 0,
    done_duration: 0,
    ...overrides,
  };
}

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    task_id: 1,
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectsRepo.getProject).mockResolvedValue(projectRow());
  vi.mocked(projectsRepo.bumpScheduleVersion).mockResolvedValue(5);
  vi.mocked(tasksRepo.listProject).mockResolvedValue([taskRow()]);
  vi.mocked(tasksRepo.updateScheduleFields).mockResolvedValue(undefined);
  vi.mocked(depsRepo.listByProject).mockResolvedValue([]);
  vi.mocked(calendarRepo.loadCalendar).mockResolvedValue({
    id: 1,
    workingWeekdays: [1, 2, 3, 4, 5],
    hoursPerDay: 8,
    exceptions: [],
  });
});

describe("schedule.service.recomputeProject", () => {
  it("maps engine output to updateScheduleFields with is_critical set", async () => {
    const result = await recomputeProject(exec, 7);

    expect(tasksRepo.updateScheduleFields).toHaveBeenCalledTimes(1);
    expect(tasksRepo.updateScheduleFields).toHaveBeenCalledWith(
      exec,
      1,
      expect.objectContaining({
        es_date: "2026-01-05",
        ef_date: "2026-01-07",
        total_float_days: 0,
        free_float_days: 0,
        is_critical: true,
        schedule_version: 5,
      }),
    );
    expect(projectsRepo.bumpScheduleVersion).toHaveBeenCalledWith(exec, 7);
    expect(result.scheduleVersion).toBe(5);
    expect(result.projectFinish).toBe("2026-01-07");
    expect(result.criticalPath).toEqual([1]);
    expect(result.tasks[0]).toMatchObject({ id: 1, esDate: "2026-01-05", isCritical: true });
  });

  it("does not write schedule fields when the graph has a cycle", async () => {
    vi.mocked(tasksRepo.listProject).mockResolvedValue([
      taskRow({ task_id: 1 }),
      taskRow({ task_id: 2 }),
      taskRow({ task_id: 3 }),
    ]);
    vi.mocked(depsRepo.listByProject).mockResolvedValue([
      { dependency_id: 1, project_id: 7, predecessor_task_id: 1, successor_task_id: 2, dependency_type: "FS", lag_days: 0, is_active: true, created_at: "2026-01-01" },
      { dependency_id: 2, project_id: 7, predecessor_task_id: 2, successor_task_id: 3, dependency_type: "FS", lag_days: 0, is_active: true, created_at: "2026-01-01" },
      { dependency_id: 3, project_id: 7, predecessor_task_id: 3, successor_task_id: 1, dependency_type: "FS", lag_days: 0, is_active: true, created_at: "2026-01-01" },
    ]);

    await expect(recomputeProject(exec, 7)).rejects.toMatchObject({ status: 409, code: "CONFLICT_CYCLE" });
    expect(tasksRepo.updateScheduleFields).not.toHaveBeenCalled();
    expect(projectsRepo.bumpScheduleVersion).not.toHaveBeenCalled();
  });

  it("throws 404 when the project is missing", async () => {
    vi.mocked(projectsRepo.getProject).mockResolvedValue(null);
    await expect(recomputeProject(exec, 999)).rejects.toMatchObject({ status: 404 });
  });
});
