import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Exec,
  GlobalActivityRow,
  GlobalMilestoneRow,
  GlobalProjectRow,
  MyTaskRow,
  PortfolioRow,
  ProjectRow,
} from "./dashboard.repository.js";
import { getGlobalDashboard, getPortfolio, getProjectDashboard, weightedProgress } from "./dashboard.service.js";

vi.mock("./dashboard.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dashboard.repository.js")>();
  return {
    ...actual,
    portfolio: vi.fn(),
    projectRow: vi.fn(),
    taskRollup: vi.fn(),
    milestoneUpcoming: vi.fn(),
    overdueTasks: vi.fn(),
    criticalTasks: vi.fn(),
    workloadSummary: vi.fn(),
    recentActivity: vi.fn(),
    globalSummary: vi.fn(),
    globalRecentActivity: vi.fn(),
    myTasks: vi.fn(),
    globalUpcomingMilestones: vi.fn(),
    globalProjects: vi.fn(),
  };
});

import * as repo from "./dashboard.repository.js";

const exec: Exec = async () => [];

function portfolioRow(overrides: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    project_id: 7,
    code: "PRJ-1",
    name: "Migration",
    manager_name: "Jane Doe",
    status: "Active",
    health: "On Track",
    start_date: "2026-01-01",
    target_end_date: "2026-06-30",
    task_count: 5,
    done_count: 1,
    overdue_count: 3,
    critical_count: 2,
    team_size: 4,
    total_duration: 0,
    done_duration: 0,
    current_finish: "2026-06-30",
    baseline_finish: "2026-06-30",
    ...overrides,
  };
}

function projectRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    project_id: 7,
    code: "PRJ-1",
    name: "Migration",
    manager_name: "Jane Doe",
    status: "Active",
    health: "At Risk",
    start_date: "2026-01-01",
    target_end_date: "2026-06-30",
    current_finish: "2026-06-30",
    baseline_finish: "2026-06-30",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repo.taskRollup).mockResolvedValue([]);
  vi.mocked(repo.milestoneUpcoming).mockResolvedValue([]);
  vi.mocked(repo.overdueTasks).mockResolvedValue([]);
  vi.mocked(repo.criticalTasks).mockResolvedValue([]);
  vi.mocked(repo.workloadSummary).mockResolvedValue([]);
  vi.mocked(repo.recentActivity).mockResolvedValue([]);
  vi.mocked(repo.globalSummary).mockResolvedValue({
    projects: [],
    tasks: { tasks_total: 0, tasks_open: 0, tasks_overdue: 0, tasks_due_soon: 0 },
    milestones_upcoming: 0,
  });
  vi.mocked(repo.globalRecentActivity).mockResolvedValue([]);
  vi.mocked(repo.myTasks).mockResolvedValue([]);
  vi.mocked(repo.globalUpcomingMilestones).mockResolvedValue([]);
  vi.mocked(repo.globalProjects).mockResolvedValue([]);
});

describe("weightedProgress", () => {
  it("ignores zero-duration tasks in the duration-weighted sum", () => {
    expect(
      weightedProgress([
        { duration_days: 10, progress_percent: 50 },
        { duration_days: 0, progress_percent: 100 },
      ]),
    ).toBe(50);
  });

  it("falls back to the mean progress when no task has duration", () => {
    expect(
      weightedProgress([
        { duration_days: 0, progress_percent: 40 },
        { duration_days: null, progress_percent: 60 },
      ]),
    ).toBe(50);
  });

  it("returns 0 with no tasks", () => {
    expect(weightedProgress([])).toBe(0);
  });
});

describe("getPortfolio", () => {
  it("maps overdue and critical counts and derives open tasks", async () => {
    vi.mocked(repo.portfolio).mockResolvedValue([portfolioRow()]);
    const [item] = await getPortfolio(exec, {});
    expect(item.overdue_tasks).toBe(3);
    expect(item.critical_tasks).toBe(2);
    expect(item.open_tasks).toBe(4);
    expect(item.done_tasks).toBe(1);
    expect(item.team_size).toBe(4);
  });

  it("computes slip_days from current vs baseline finish", async () => {
    vi.mocked(repo.portfolio).mockResolvedValue([
      portfolioRow({ baseline_finish: "2026-06-30", current_finish: "2026-07-05" }),
    ]);
    const [item] = await getPortfolio(exec, {});
    expect(item.slip_days).toBe(5);
  });
});

describe("getProjectDashboard", () => {
  it("marks on_track when variance <= 0", async () => {
    vi.mocked(repo.projectRow).mockResolvedValue(projectRow());
    const dashboard = await getProjectDashboard(exec, 7);
    expect(dashboard.schedule.variance_days).toBe(0);
    expect(dashboard.schedule.on_track).toBe(true);
  });

  it("marks slipped when the current finish is later than the baseline", async () => {
    vi.mocked(repo.projectRow).mockResolvedValue(
      projectRow({ baseline_finish: "2026-06-30", current_finish: "2026-07-05" }),
    );
    const dashboard = await getProjectDashboard(exec, 7);
    expect(dashboard.schedule.variance_days).toBe(5);
    expect(dashboard.schedule.on_track).toBe(false);
  });

  it("counts workload classifications per summed allocation", async () => {
    vi.mocked(repo.projectRow).mockResolvedValue(projectRow());
    vi.mocked(repo.workloadSummary).mockResolvedValue([
      { employee_nip: "1", allocation: 50 },
      { employee_nip: "2", allocation: 80 },
      { employee_nip: "3", allocation: 100 },
      { employee_nip: "4", allocation: 150 },
    ]);
    const dashboard = await getProjectDashboard(exec, 7);
    expect(dashboard.workload_summary).toEqual({ under: 1, balanced: 2, over: 1 });
  });

  it("throws NotFoundError when the project does not exist", async () => {
    vi.mocked(repo.projectRow).mockResolvedValue(null);
    await expect(getProjectDashboard(exec, 999)).rejects.toMatchObject({ status: 404 });
  });
});

const globalUser = { sub: "NIP-42", name: "Ada Lovelace", role: "member" };

describe("getGlobalDashboard", () => {
  it("maps grouped project counts into by_status and by_health keys", async () => {
    vi.mocked(repo.globalSummary).mockResolvedValue({
      projects: [
        { status: "Active", health: "On Track", count: 2 },
        { status: "On Hold", health: "At Risk", count: 1 },
        { status: "Completed", health: "Delayed", count: 3 },
      ],
      tasks: { tasks_total: 10, tasks_open: 4, tasks_overdue: 2, tasks_due_soon: 1 },
      milestones_upcoming: 5,
    });

    const dashboard = await getGlobalDashboard(exec, globalUser);

    expect(dashboard.summary.projects_total).toBe(6);
    expect(dashboard.summary.by_status).toEqual({ planning: 0, active: 2, on_hold: 1, completed: 3, cancelled: 0 });
    expect(dashboard.summary.by_health).toEqual({ on_track: 2, at_risk: 1, delayed: 3, critical: 0 });
    expect(dashboard.summary.tasks_overdue).toBe(2);
    expect(dashboard.summary.milestones_upcoming).toBe(5);
    expect(dashboard.user).toEqual({ name: "Ada Lovelace", role: "member" });
  });

  it("preserves the recent_updates order returned by the repository", async () => {
    const rows: GlobalActivityRow[] = [
      { id: 3, project_id: 1, project_name: "A", entity_type: "task", entity_id: 9, action: "Updated", actor_nip: "1", detail: null, created_at: "2026-02-03T00:00:00Z" },
      { id: 2, project_id: 1, project_name: "A", entity_type: "task", entity_id: 8, action: "Created", actor_nip: "1", detail: null, created_at: "2026-02-02T00:00:00Z" },
    ];
    vi.mocked(repo.globalRecentActivity).mockResolvedValue(rows);

    const dashboard = await getGlobalDashboard(exec, globalUser);

    expect(dashboard.recent_updates.map((row) => row.id)).toEqual([3, 2]);
  });

  it("scopes my_tasks to the logged-in user's sub", async () => {
    const task: MyTaskRow = {
      task_id: 11,
      name: "Ship API",
      project_id: 1,
      project_name: "A",
      finish_date: null,
      status: "In Progress",
      progress_percent: 40,
      is_critical: true,
      actual_finish: null,
      actual_finish_status: null,
    };
    vi.mocked(repo.myTasks).mockResolvedValue([task]);

    const dashboard = await getGlobalDashboard(exec, globalUser);

    expect(repo.myTasks).toHaveBeenCalledWith(exec, "NIP-42");
    expect(dashboard.my_tasks[0]).toMatchObject({ task_id: 11, finish_date: null, is_critical: true });
  });

  it("maps upcoming milestones and projects, formatting dates and rounding progress", async () => {
    const milestone: GlobalMilestoneRow = {
      milestone_id: 5,
      name: "Go Live",
      due_date: "2026-03-01T00:00:00.000Z",
      status: "In Progress",
      project_id: 1,
      project_name: "A",
    };
    const project: GlobalProjectRow = {
      project_id: 1,
      code: "P1",
      name: "A",
      status: "Active",
      health: "On Track",
      weighted_progress: 42.129,
      target_end_date: "2026-06-30T00:00:00.000Z",
    };
    vi.mocked(repo.globalUpcomingMilestones).mockResolvedValue([milestone]);
    vi.mocked(repo.globalProjects).mockResolvedValue([project]);

    const dashboard = await getGlobalDashboard(exec, globalUser);

    expect(repo.globalUpcomingMilestones).toHaveBeenCalledWith(exec, { nip: "NIP-42", seeAll: false });
    expect(dashboard.upcoming_milestones[0].due_date).toBe("2026-03-01");
    expect(dashboard.projects[0]).toMatchObject({ weighted_progress: 42.13, target_end_date: "2026-06-30" });
  });

  it("scopes project-derived data to the user's membership for non-privileged roles", async () => {
    await getGlobalDashboard(exec, globalUser);

    expect(repo.globalSummary).toHaveBeenCalledWith(exec, { nip: "NIP-42", seeAll: false });
    expect(repo.globalProjects).toHaveBeenCalledWith(exec, { nip: "NIP-42", seeAll: false });
    expect(repo.globalRecentActivity).toHaveBeenCalledWith(exec, { nip: "NIP-42", seeAll: false });
    expect(repo.globalUpcomingMilestones).toHaveBeenCalledWith(exec, { nip: "NIP-42", seeAll: false });
  });

  it("grants admin and manager roles visibility across all projects", async () => {
    await getGlobalDashboard(exec, { sub: "NIP-1", name: "Root", role: "Admin" });
    expect(repo.globalProjects).toHaveBeenCalledWith(exec, { nip: "NIP-1", seeAll: true });

    vi.clearAllMocks();
    await getGlobalDashboard(exec, { sub: "NIP-2", name: "Boss", role: "manager" });
    expect(repo.globalProjects).toHaveBeenCalledWith(exec, { nip: "NIP-2", seeAll: true });
  });
});
