import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scheduling/schedule.service.js", () => ({
  recomputeProject: vi.fn(async () => ({})),
}));

vi.mock("../tasks/tasks.repository.js", () => ({
  getById: vi.fn(),
  listProject: vi.fn(),
}));

vi.mock("./dependencies.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dependencies.repository.js")>();
  return {
    ...actual,
    create: vi.fn(),
    listByProject: vi.fn(),
    remove: vi.fn(),
  };
});

import * as schedule from "../scheduling/schedule.service.js";
import * as tasksRepo from "../tasks/tasks.repository.js";
import type { TaskRow } from "../tasks/tasks.repository.js";
import * as depsRepo from "./dependencies.repository.js";
import { createDependency, deleteDependency, type Exec } from "./dependencies.service.js";

const exec: Exec = (async () => []) as Exec;

function row(overrides: Partial<TaskRow> = {}): TaskRow {
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
    schedule_version: 0,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function dep(overrides: Partial<depsRepo.DependencyRow> = {}): depsRepo.DependencyRow {
  return {
    dependency_id: 1,
    project_id: 7,
    predecessor_task_id: 1,
    successor_task_id: 2,
    dependency_type: "FS",
    lag_days: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dependencies.service", () => {
  it("rejects a self-dependency with 400 before touching the DB", async () => {
    await expect(
      createDependency(exec, {
        predecessor_task_id: 1,
        successor_task_id: 1,
        dependency_type: "FS",
        lag_days: 0,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(tasksRepo.getById).not.toHaveBeenCalled();
    expect(depsRepo.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid dependency_type", async () => {
    await expect(
      createDependency(exec, {
        predecessor_task_id: 1,
        successor_task_id: 2,
        dependency_type: "XX" as never,
        lag_days: 0,
      }),
    ).rejects.toThrow(/Invalid dependency_type/);
  });

  it("rejects a Summary endpoint with SUMMARY_DEPENDENCY", async () => {
    vi.mocked(tasksRepo.getById).mockImplementation(async (_exec: Exec, id: number) =>
      id === 1 ? row({ task_id: 1, task_type: "Summary" }) : row({ task_id: 2 }),
    );
    await expect(
      createDependency(exec, {
        predecessor_task_id: 1,
        successor_task_id: 2,
        dependency_type: "FS",
        lag_days: 0,
      }),
    ).rejects.toMatchObject({ status: 400, message: "SUMMARY_DEPENDENCY" });
    expect(depsRepo.create).not.toHaveBeenCalled();
  });

  it("rejects a cycle with 409 and the cycle path, no writes", async () => {
    vi.mocked(tasksRepo.getById).mockImplementation(async (_exec: Exec, id: number) => row({ task_id: id }));
    vi.mocked(tasksRepo.listProject).mockResolvedValue([
      row({ task_id: 1 }),
      row({ task_id: 2 }),
      row({ task_id: 3 }),
    ]);
    // existing: 3 -> 2 -> 1, candidate 1 -> 3 closes the loop
    vi.mocked(depsRepo.listByProject).mockResolvedValue([
      dep({ dependency_id: 1, predecessor_task_id: 3, successor_task_id: 2 }),
      dep({ dependency_id: 2, predecessor_task_id: 2, successor_task_id: 1 }),
    ]);

    await expect(
      createDependency(exec, {
        predecessor_task_id: 1,
        successor_task_id: 3,
        dependency_type: "FS",
        lag_days: 0,
      }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT_CYCLE", details: { path: [1, 3, 2] } });

    expect(depsRepo.create).not.toHaveBeenCalled();
    expect(schedule.recomputeProject).not.toHaveBeenCalled();
  });

  it("creates a valid FS dependency and reschedules the project", async () => {
    vi.mocked(tasksRepo.getById).mockImplementation(async (_exec: Exec, id: number) =>
      row({ task_id: id, project_id: 7 }),
    );
    vi.mocked(tasksRepo.listProject).mockResolvedValue([row({ task_id: 1 }), row({ task_id: 2 })]);
    vi.mocked(depsRepo.listByProject).mockResolvedValue([]);
    vi.mocked(depsRepo.create).mockResolvedValue(
      dep({ dependency_id: 10, predecessor_task_id: 1, successor_task_id: 2 }),
    );

    const dto = await createDependency(exec, {
      predecessor_task_id: 1,
      successor_task_id: 2,
      dependency_type: "FS",
      lag_days: 0,
    });

    expect(dto).toMatchObject({ id: 10, predecessorTaskId: 1, successorTaskId: 2, dependencyType: "FS" });
    expect(depsRepo.create).toHaveBeenCalledWith(exec, {
      project_id: 7,
      predecessor_task_id: 1,
      successor_task_id: 2,
      dependency_type: "FS",
      lag_days: 0,
    });
    expect(schedule.recomputeProject).toHaveBeenCalledWith(exec, 7);
  });

  it("deletes a dependency and reschedules its project", async () => {
    vi.mocked(depsRepo.remove).mockResolvedValue(7);
    await deleteDependency(exec, 5);
    expect(depsRepo.remove).toHaveBeenCalledWith(exec, 5);
    expect(schedule.recomputeProject).toHaveBeenCalledWith(exec, 7);
  });
});
