import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRepository, TaskRow } from "./tasks.repository.js";
import { buildTree, createTask, move, reviewActualFinish, setMyTaskCompletion, toTaskDTO, updateTask } from "./tasks.service.js";

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
    setCompletion: vi.fn(async () => null),
    reviewActualFinish: vi.fn(async () => null),
    listFinishReviews: vi.fn(async () => []),
    exec: vi.fn(async () => []),
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

  it("expands the parent when a child starts before it", async () => {
    const parent = row({ task_id: 5, start_date: "2026-03-10", finish_date: "2026-03-20" });
    const repo = fakeRepo({
      getById: vi.fn(async (id: number) => (id === 5 ? parent : null)),
      create: vi.fn(async () => row({ task_id: 6, parent_task_id: 5, start_date: "2026-03-01" })),
      update: vi.fn(async () => parent),
    });
    await createTask(repo as unknown as TaskRepository, {
      project_id: 7,
      name: "Child",
      parent_task_id: 5,
      start_date: "2026-03-01",
    });
    expect(repo.update).toHaveBeenCalledWith(5, { start_date: "2026-03-01" });
  });

  it("expands the parent when a child finishes after it", async () => {
    const parent = row({ task_id: 5, start_date: "2026-03-10", finish_date: "2026-03-20" });
    const child = row({ task_id: 6, parent_task_id: 5, start_date: "2026-03-11", finish_date: "2026-03-15" });
    const repo = fakeRepo({
      getById: vi.fn(async (id: number) => (id === 6 ? child : id === 5 ? parent : null)),
      update: vi.fn(async () => child),
    });
    await updateTask(repo as unknown as TaskRepository, 6, { finish_date: "2026-03-25" });
    expect(repo.update).toHaveBeenCalledWith(6, { finish_date: "2026-03-25" });
    expect(repo.update).toHaveBeenCalledWith(5, { finish_date: "2026-03-25" });
  });

  it("expands every ancestor up the chain", async () => {
    const grandparent = row({ task_id: 1, start_date: "2026-03-10", finish_date: "2026-03-20" });
    const parent = row({ task_id: 5, parent_task_id: 1, start_date: "2026-03-12", finish_date: "2026-03-18" });
    const child = row({ task_id: 6, parent_task_id: 5, start_date: "2026-03-13", finish_date: "2026-03-15" });
    const repo = fakeRepo({
      getById: vi.fn(async (id: number) => (id === 1 ? grandparent : id === 5 ? parent : id === 6 ? child : null)),
      update: vi.fn(async () => child),
    });
    await updateTask(repo as unknown as TaskRepository, 6, { finish_date: "2026-03-25" });
    expect(repo.update).toHaveBeenCalledWith(5, { finish_date: "2026-03-25" });
    expect(repo.update).toHaveBeenCalledWith(1, { finish_date: "2026-03-25" });
  });

  it("leaves the parent untouched when the child stays inside its range", async () => {
    const parent = row({ task_id: 5, start_date: "2026-03-10", finish_date: "2026-03-20" });
    const child = row({ task_id: 6, parent_task_id: 5, start_date: "2026-03-11", finish_date: "2026-03-15" });
    const repo = fakeRepo({
      getById: vi.fn(async (id: number) => (id === 5 ? parent : id === 6 ? child : null)),
      update: vi.fn(async () => child),
    });
    await updateTask(repo as unknown as TaskRepository, 6, { start_date: "2026-03-12" });
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledWith(6, { start_date: "2026-03-12" });
  });
});

describe("setMyTaskCompletion", () => {
  it("marks the task done with the reported date and parks it as Pending", async () => {
    const done = row({
      task_id: 4,
      status: "Completed",
      progress_percent: 100,
      actual_finish: "2026-04-02",
      actual_finish_status: "Pending",
    });
    const repo = fakeRepo({
      getById: vi.fn(async () => row({ task_id: 4 })),
      setCompletion: vi.fn(async () => done),
    });
    const dto = await setMyTaskCompletion(
      repo as unknown as TaskRepository,
      4,
      { completed: true, actual_finish: "2026-04-02" },
      "NIP-42",
    );
    expect(repo.setCompletion).toHaveBeenCalledWith(4, true, "2026-04-02", "NIP-42");
    expect(dto.status).toBe("Completed");
    expect(dto.actualFinish).toBe("2026-04-02");
    expect(dto.actualFinishStatus).toBe("Pending");
    expect(repo.exec).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO pm.project_activity_logs"),
      expect.objectContaining({ action: "complete", actor_nip: "NIP-42" }),
    );
  });

  it("requires the actual finish date when completing", async () => {
    const repo = fakeRepo({ getById: vi.fn(async () => row({ task_id: 4 })) });
    await expect(
      setMyTaskCompletion(repo as unknown as TaskRepository, 4, { completed: true }, "NIP-42"),
    ).rejects.toThrow("actual_finish is required");
    expect(repo.setCompletion).not.toHaveBeenCalled();
  });

  it("rejects a malformed actual finish date", async () => {
    const repo = fakeRepo({ getById: vi.fn(async () => row({ task_id: 4 })) });
    await expect(
      setMyTaskCompletion(
        repo as unknown as TaskRepository,
        4,
        { completed: true, actual_finish: "02/04/2026" },
        "NIP-42",
      ),
    ).rejects.toThrow("actual_finish must be an ISO date");
  });

  it("reopens to In Progress with zero progress and no date", async () => {
    const reopened = row({ task_id: 4, status: "In Progress", progress_percent: 0, actual_finish: null });
    const repo = fakeRepo({
      getById: vi.fn(async () => row({ task_id: 4, status: "Completed" })),
      setCompletion: vi.fn(async () => reopened),
    });
    const dto = await setMyTaskCompletion(repo as unknown as TaskRepository, 4, { completed: false }, "NIP-42");
    expect(repo.setCompletion).toHaveBeenCalledWith(4, false, null, "NIP-42");
    expect(dto.status).toBe("In Progress");
    expect(dto.actualFinish).toBeNull();
    expect(repo.exec).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO pm.project_activity_logs"),
      expect.objectContaining({ action: "reopen" }),
    );
  });

  it("throws when the task no longer exists", async () => {
    const repo = fakeRepo({ getById: vi.fn(async () => null) });
    await expect(
      setMyTaskCompletion(repo as unknown as TaskRepository, 9, { completed: true }, "NIP-42"),
    ).rejects.toThrow("Task not found");
    expect(repo.exec).not.toHaveBeenCalled();
  });
});

describe("reviewActualFinish", () => {
  const pending = row({
    task_id: 4,
    status: "Completed",
    actual_finish: "2026-04-02",
    actual_finish_status: "Pending",
  });

  it("approves a pending date", async () => {
    const approved = row({ ...pending, actual_finish_status: "Approved" });
    const repo = fakeRepo({
      getById: vi.fn(async () => pending),
      reviewActualFinish: vi.fn(async () => approved),
    });
    const dto = await reviewActualFinish(repo as unknown as TaskRepository, 4, "Approved", "NIP-77", null);
    expect(repo.reviewActualFinish).toHaveBeenCalledWith(4, "Approved", "NIP-77", null);
    expect(dto.actualFinishStatus).toBe("Approved");
    expect(repo.exec).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO pm.project_activity_logs"),
      expect.objectContaining({ action: "approve_actual_finish", actor_nip: "NIP-77" }),
    );
  });

  it("rejects the completion and sends the task back to In Progress", async () => {
    const rejected = row({
      task_id: 4,
      status: "In Progress",
      progress_percent: 0,
      actual_finish: null,
      actual_finish_status: "Rejected",
      actual_finish_comment: "Tanggal masih salah",
    });
    const repo = fakeRepo({
      getById: vi.fn(async () => pending),
      reviewActualFinish: vi.fn(async () => rejected),
    });
    const dto = await reviewActualFinish(
      repo as unknown as TaskRepository,
      4,
      "Rejected",
      "NIP-77",
      "Tanggal masih salah",
    );
    expect(repo.reviewActualFinish).toHaveBeenCalledWith(4, "Rejected", "NIP-77", "Tanggal masih salah");
    expect(dto.status).toBe("In Progress");
    expect(dto.actualFinishStatus).toBe("Rejected");
  });

  it("refuses a second decision on the same submission", async () => {
    const reviewed = row({ ...pending, actual_finish_status: "Approved" });
    const repo = fakeRepo({ getById: vi.fn(async () => reviewed) });
    await expect(reviewActualFinish(repo as unknown as TaskRepository, 4, "Approved", "NIP-77", null)).rejects.toThrow(
      "already been reviewed",
    );
    expect(repo.reviewActualFinish).not.toHaveBeenCalled();
  });

  it("requires a reason when rejecting", async () => {
    const repo = fakeRepo({ getById: vi.fn(async () => pending) });
    await expect(reviewActualFinish(repo as unknown as TaskRepository, 4, "Rejected", "NIP-77", "  ")).rejects.toThrow(
      "A rejection needs a reason",
    );
  });
});
