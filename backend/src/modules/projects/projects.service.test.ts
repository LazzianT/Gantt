import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Exec, ProjectRow } from "./projects.repository.js";
import { addMember, createProject, ensureMember, listProjects, nextProjectCode, weightedProgress } from "./projects.service.js";

vi.mock("./projects.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./projects.repository.js")>();
  return {
    ...actual,
    codeExists: vi.fn(),
    codesWithPrefix: vi.fn(),
    createProject: vi.fn(),
    ensureMember: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    softDeleteProject: vi.fn(),
    listProjects: vi.fn(),
    listMembers: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  };
});

import * as repo from "./projects.repository.js";

const exec: Exec = async () => [];
const codeExists = vi.mocked(repo.codeExists);
const createRepo = vi.mocked(repo.createProject);
const listRepo = vi.mocked(repo.listProjects);
const addRepo = vi.mocked(repo.addMember);
const ensureRepo = vi.mocked(repo.ensureMember);

function projectRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    project_id: 7,
    code: "PRJ-1",
    name: "Migration",
    description: null,
    manager_nip: "1001",
    manager_name: "Jane Doe",
    start_date: "2026-01-01",
    target_end_date: "2026-06-30",
    priority: "High",
    status: "Active",
    health: "On Track",
    calendar_id: 1,
    schedule_version: 3,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    task_count: 4,
    done_count: 1,
    total_duration: 40,
    done_duration: 10,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("projects.service", () => {
  it("create rejects an invalid status enum", async () => {
    await expect(
      createProject(exec, { code: "PRJ-1", name: "Migration", status: "Bogus" as never }),
    ).rejects.toThrow(/Invalid status/);
    expect(codeExists).not.toHaveBeenCalled();
  });

  it("create maps a duplicate code to 409", async () => {
    codeExists.mockResolvedValue(true);
    await expect(createProject(exec, { code: "PRJ-1", name: "Migration" })).rejects.toMatchObject({
      status: 409,
    });
    expect(createRepo).not.toHaveBeenCalled();
  });

  it("create auto-generates a unique code when none is provided", async () => {
    vi.mocked(repo.codesWithPrefix).mockResolvedValue(["PRJ-2026-001", "PRJ-2026-003"]);
    createRepo.mockResolvedValue(projectRow({ code: "PRJ-2026-004" }));
    const dto = await createProject(exec, { name: "Migration" });
    expect(createRepo).toHaveBeenCalledWith(exec, expect.objectContaining({ code: "PRJ-2026-004" }));
    expect(dto.code).toBe("PRJ-2026-004");
  });

  it("nextProjectCode pads the sequence and uses the current year", async () => {
    vi.mocked(repo.codesWithPrefix).mockResolvedValue(["PRJ-2026-009"]);
    const code = await nextProjectCode(exec, new Date("2026-03-01T00:00:00Z"));
    expect(code).toBe("PRJ-2026-010");
  });

  it("list maps manager_name and counts to the DTO", async () => {
    listRepo.mockResolvedValue([projectRow()]);
    const [dto] = await listProjects(exec);
    expect(dto.managerName).toBe("Jane Doe");
    expect(dto.taskCount).toBe(4);
    expect(dto.doneCount).toBe(1);
    expect(dto.startDate).toBe("2026-01-01");
  });

  it("weightedProgress prefers duration weighting when durations exist", () => {
    expect(weightedProgress({ done_count: 1, task_count: 2, total_duration: 10, done_duration: 5 })).toBe(50);
  });

  it("weightedProgress falls back to completed/total count", () => {
    expect(weightedProgress({ done_count: 1, task_count: 4, total_duration: 0, done_duration: 0 })).toBe(25);
  });

  it("addMember rejects a missing employee_nip", async () => {
    await expect(addMember(exec, 7, { employee_nip: "  ", employee_name: "Jane" })).rejects.toThrow(
      /employee_nip is required/,
    );
    expect(addRepo).not.toHaveBeenCalled();
  });

  it("ensureMember skips a blank nip without touching the repo", async () => {
    await expect(ensureMember(exec, 7, "  ", "Jane")).resolves.toBe(false);
    expect(ensureRepo).not.toHaveBeenCalled();
  });

  it("ensureMember trims the nip and falls back to the nip for a missing name", async () => {
    ensureRepo.mockResolvedValue(true);
    await expect(ensureMember(exec, 7, " 1001 ", "  ")).resolves.toBe(true);
    expect(ensureRepo).toHaveBeenCalledWith(exec, 7, { employee_nip: "1001", employee_name: "1001" });
  });
});
