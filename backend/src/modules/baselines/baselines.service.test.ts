import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./baselines.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./baselines.repository.js")>();
  return {
    ...actual,
    getBaseline: vi.fn(),
    getBaselineTasks: vi.fn(),
    getCurrentTasks: vi.fn(),
    listBaselines: vi.fn(),
  };
});

import * as repo from "./baselines.repository.js";
import { createBaseline, type BaselineTaskRow, type Exec } from "./baselines.repository.js";
import { variance } from "./baselines.service.js";

const noop: Exec = (async () => []) as Exec;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("baselines.service", () => {
  it("capture snapshots every active task into baseline rows", async () => {
    const exec = vi.fn(async (sql: string) => {
      if (/INSERT INTO pm\.project_baselines\b/.test(sql)) {
        return [
          {
            baseline_id: 5,
            project_id: 7,
            name: "v1",
            captured_at: "2026-02-01T00:00:00.000Z",
            captured_by_nip: "1001",
          },
        ];
      }
      if (/INSERT INTO pm\.project_baseline_tasks/.test(sql)) {
        return [{ baseline_task_id: 1 }, { baseline_task_id: 2 }, { baseline_task_id: 3 }];
      }
      return [];
    });

    const baseline = await createBaseline(exec as unknown as Exec, 7, "v1", "1001");

    expect(baseline?.task_count).toBe(3);
    expect(baseline?.baseline_id).toBe(5);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("variance flags a positive finish slip", async () => {
    vi.mocked(repo.getBaseline).mockResolvedValue({
      baseline_id: 5,
      project_id: 7,
      name: "v1",
      captured_at: "2026-02-01T00:00:00.000Z",
      captured_by_nip: null,
    });
    vi.mocked(repo.getBaselineTasks).mockResolvedValue([
      {
        baseline_task_id: 1,
        baseline_id: 5,
        task_id: 1,
        task_name: "Design",
        start_date: "2026-01-01",
        finish_date: "2026-01-10",
        duration_days: 8,
      } satisfies BaselineTaskRow,
    ]);
    vi.mocked(repo.getCurrentTasks).mockResolvedValue([
      { task_id: 1, name: "Design", start_date: "2026-01-03", finish_date: "2026-01-15", duration_days: 8 },
    ]);

    const [row] = await variance(noop, 5);

    expect(row.start_variance_days).toBe(2);
    expect(row.finish_variance_days).toBe(5);
    expect(row.slip).toBe(true);
    expect(row.baseline_finish).toBe("2026-01-10");
    expect(row.current_finish).toBe("2026-01-15");
  });

  it("variance does not flag an on-or-ahead finish", async () => {
    vi.mocked(repo.getBaseline).mockResolvedValue({
      baseline_id: 5,
      project_id: 7,
      name: "v1",
      captured_at: "2026-02-01T00:00:00.000Z",
      captured_by_nip: null,
    });
    vi.mocked(repo.getBaselineTasks).mockResolvedValue([
      {
        baseline_task_id: 1,
        baseline_id: 5,
        task_id: 1,
        task_name: "Design",
        start_date: "2026-01-01",
        finish_date: "2026-01-10",
        duration_days: 8,
      },
    ]);
    vi.mocked(repo.getCurrentTasks).mockResolvedValue([
      { task_id: 1, name: "Design", start_date: "2026-01-01", finish_date: "2026-01-08", duration_days: 8 },
    ]);

    const [row] = await variance(noop, 5);

    expect(row.finish_variance_days).toBe(-2);
    expect(row.slip).toBe(false);
  });

  it("variance 404s for an unknown baseline", async () => {
    vi.mocked(repo.getBaseline).mockResolvedValue(null);
    await expect(variance(noop, 99)).rejects.toMatchObject({ status: 404 });
  });
});
