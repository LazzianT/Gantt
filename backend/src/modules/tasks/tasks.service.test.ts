import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRepository, TaskRow } from "./tasks.repository.js";
import { buildTree, createTask, move, toTaskDTO, updateTask } from "./tasks.service.js";

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
    duration_days: 5,
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

type FakeRepo = { [K in keyof TaskRepository]: ReturnType<typeof vi.fn> };

function fakeRepo(overrides: Partial<FakeRepo> = {}): FakeRepo {
  return {
    listByProject: vi.fn(async () => []),
    listProject: vi.fn(async () => []),
    getById: vi.fn(async () => null),
    create: vi.fn(async () => null),
    update: vi.fn(async () => null),
    softDelete: vi.fn(async () => false),
    setParent: vi.fn(async () => undefined),
    updateScheduleFields: vi.fn(async () => undefined),
    ...overrides,
  } as FakeRepo;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("tasks.service", () => {
  it("builds nested WBS with codes 1, 1.1, 1.1.1", () => {
    const tree = buildTree([
      row({ task_id: 1, name: "Root", sort_order: 0 }),
      row({ task_id: 2, name: "Child", parent_task_id: 1, sort_order: 0 }),
      row({ task_id: 3, name: "Grandchild", parent_task_id: 2, sort_order: 0 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].wbsCode).toBe("1");
    expect(tree[0].children[0].wbsCode).toBe("1.1");
    expect(tree[0].children[0].children[0].wbsCode).toBe("1.1.1");
  });

  it("orders siblings by sort_order then id", () => {
    const tree = buildTree([
      row({ task_id: 1, sort_order: 0 }),
      row({ task_id: 2, sort_order: 2 }),
      row({ task_id: 3, sort_order: 1 }),
    ]);
    expect(tree.map((n) => n.id)).toEqual([1, 3, 2]);
    expect(tree.map((n) => n.wbsCode)).toEqual(["1", "2", "3"]);
  });

  it("a Milestone forces is_milestone true and duration_days 0", async () => {
    const repo = fakeRepo({
      create: vi.fn(async (data: { duration_days?: number | null; is_milestone?: boolean }) =>
        row({ task_type: "Milestone", is_milestone: data.is_milestone, duration_days: data.duration_days }),
      ),
    });
    const dto = await createTask(repo as unknown as TaskRepository, {
      project_id: 7,
      name: "Kickoff",
      task_type: "Milestone",
      duration_days: 5,
    });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ is_milestone: true, duration_days: 0 }));
    expect(dto.durationDays).toBe(0);
    expect(dto.isMilestone).toBe(true);
  });

  it("rejects an invalid task_type", async () => {
    const repo = fakeRepo();
    await expect(
      createTask(repo as unknown as TaskRepository, { project_id: 7, name: "X", task_type: "Bogus" as never }),
    ).rejects.toThrow(/Invalid task_type/);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejects moving a task under its own descendant", async () => {
    const byId: Record<number, TaskRow> = {
      1: row({ task_id: 1, parent_task_id: null }),
      2: row({ task_id: 2, parent_task_id: 1 }),
      3: row({ task_id: 3, parent_task_id: 2 }),
    };
    const repo = fakeRepo({
      getById: vi.fn(async (id: number) => byId[id] ?? null),
      listByProject: vi.fn(async () => Object.values(byId)),
    });
    await expect(move(repo as unknown as TaskRepository, 1, 3, 0)).rejects.toMatchObject({ status: 409 });
    expect(repo.setParent).not.toHaveBeenCalled();
  });

  it("update maps repository fields to the DTO", async () => {
    const repo = fakeRepo({
      getById: vi.fn(async () => row({ task_id: 1, name: "Old", start_date: null })),
      update: vi.fn(async () => row({ task_id: 1, name: "New", start_date: "2026-03-01", duration_days: 3 })),
    });
    const dto = await updateTask(repo as unknown as TaskRepository, 1, { name: "New", start_date: "2026-03-01" });
    expect(repo.update).toHaveBeenCalledWith(1, { name: "New", start_date: "2026-03-01" });
    expect(dto.name).toBe("New");
    expect(dto.startDate).toBe("2026-03-01");
    expect(dto.durationDays).toBe(3);
  });

  it("maps PIC fields to the DTO", () => {
    const dto = toTaskDTO(row({ pic_nip: "0377", pic_name: "Lazzian Al Falah" }));
    expect(dto.picNip).toBe("0377");
    expect(dto.picName).toBe("Lazzian Al Falah");
  });

  it("rejects a child task that starts before its parent", async () => {
    const parent = row({ task_id: 5, start_date: "2026-03-10", finish_date: "2026-03-20" });
    const repo = fakeRepo({ getById: vi.fn(async (id: number) => (id === 5 ? parent : null)) });
    await expect(
      createTask(repo as unknown as TaskRepository, {
        project_id: 7,
        name: "Child",
        parent_task_id: 5,
        start_date: "2026-03-01",
      }),
    ).rejects.toThrow(/before its parent/);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejects a child task whose finish is after its parent", async () => {
    const parent = row({ task_id: 5, start_date: "2026-03-10", finish_date: "2026-03-20" });
    const child = row({ task_id: 6, parent_task_id: 5, start_date: "2026-03-11", finish_date: "2026-03-15" });
    const repo = fakeRepo({
      getById: vi.fn(async (id: number) => (id === 6 ? child : id === 5 ? parent : null)),
    });
    await expect(
      updateTask(repo as unknown as TaskRepository, 6, { finish_date: "2026-03-25" }),
    ).rejects.toThrow(/after its parent/);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
