import { describe, expect, it } from "vitest";
import { compute } from "./engine.js";
import { workingDayIndex, type CalendarException, type WorkingCalendar } from "./calendar.js";
import type { Dependency, DependencyType, ScheduleInput, ScheduleResult, Task } from "./types.js";

function d(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cal(exceptions: CalendarException[] = []): WorkingCalendar {
  return { id: 1, workingWeekdays: [1, 2, 3, 4, 5], hoursPerDay: 8, exceptions };
}

let seq = 0;
function task(id: string, durationDays: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    projectId: "p1",
    parentId: null,
    type: "Normal",
    name: id,
    durationDays,
    isManual: false,
    constraint: { type: "ASAP" },
    order: seq++,
    percentComplete: 0,
    ...extra,
  };
}

function dep(
  predecessorId: string,
  successorId: string,
  type: DependencyType = "FS",
  lagDays = 0,
): Dependency {
  return { id: `${predecessorId}->${successorId}`, predecessorId, successorId, type, lagDays };
}

function input(tasks: Task[], dependencies: Dependency[]): ScheduleInput {
  return { projectStart: d("2024-01-01"), tasks, dependencies };
}

function snap(r: ScheduleResult) {
  return {
    tasks: [...r.tasks.values()]
      .map((t) => ({
        id: t.id,
        es: fmt(t.es),
        ef: fmt(t.ef),
        ls: fmt(t.ls),
        lf: fmt(t.lf),
        duration: t.duration,
        percentComplete: t.percentComplete,
        totalFloat: t.totalFloat,
        freeFloat: t.freeFloat,
        isCritical: t.isCritical,
        isViolatingConstraint: t.isViolatingConstraint,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    projectFinish: fmt(r.projectFinish),
    projectDuration: r.projectDuration,
    criticalPath: r.criticalPath,
  };
}

// 2024-01-01 is a Monday.
describe("engine", () => {
  it("schedules a single task end to end", () => {
    const r = compute(input([task("A", 3)], []), cal());
    const a = r.tasks.get("A")!;
    expect(fmt(a.es)).toBe("2024-01-01");
    expect(fmt(a.ef)).toBe("2024-01-03");
    expect(fmt(a.ls)).toBe("2024-01-01");
    expect(fmt(a.lf)).toBe("2024-01-03");
    expect(a.totalFloat).toBe(0);
    expect(a.freeFloat).toBe(0);
    expect(a.isCritical).toBe(true);
    expect(fmt(r.projectFinish)).toBe("2024-01-03");
    expect(r.projectDuration).toBe(3);
    expect(r.criticalPath).toEqual(["A"]);
  });

  it("applies FS lag 0", () => {
    const r = compute(input([task("A", 3), task("B", 2)], [dep("A", "B")]), cal());
    expect(fmt(r.tasks.get("B")!.es)).toBe("2024-01-04");
    expect(fmt(r.tasks.get("B")!.ef)).toBe("2024-01-05");
  });

  it("applies FS positive lag +2", () => {
    const r = compute(input([task("A", 3), task("B", 2)], [dep("A", "B", "FS", 2)]), cal());
    expect(fmt(r.tasks.get("B")!.es)).toBe("2024-01-08");
  });

  it("applies FS negative lag -1 (lead)", () => {
    const r = compute(input([task("A", 3), task("B", 2)], [dep("A", "B", "FS", -1)]), cal());
    expect(fmt(r.tasks.get("A")!.ef)).toBe("2024-01-03");
    expect(fmt(r.tasks.get("B")!.es)).toBe("2024-01-03");
    expect(fmt(r.tasks.get("B")!.ef)).toBe("2024-01-04");
  });

  it("applies SS lag 1", () => {
    const r = compute(input([task("A", 3), task("B", 2)], [dep("A", "B", "SS", 1)]), cal());
    expect(fmt(r.tasks.get("B")!.es)).toBe("2024-01-02");
    expect(fmt(r.tasks.get("B")!.ef)).toBe("2024-01-03");
  });

  it("applies FF lag 0 (finish together)", () => {
    const r = compute(input([task("A", 3), task("B", 2)], [dep("A", "B", "FF", 0)]), cal());
    expect(fmt(r.tasks.get("B")!.ef)).toBe(fmt(r.tasks.get("A")!.ef));
  });

  it("applies SF lag 0 (finish when predecessor starts)", () => {
    const tasks = [task("R", 2), task("A", 1), task("B", 2)];
    const deps = [dep("R", "A"), dep("A", "B", "SF", 0)];
    const r = compute(input(tasks, deps), cal());
    expect(fmt(r.tasks.get("B")!.ef)).toBe(fmt(r.tasks.get("A")!.es));
  });

  it("collapses a milestone to EF == ES and LS == LF", () => {
    const r = compute(input([task("M", 0, { type: "Milestone" })], []), cal());
    const m = r.tasks.get("M")!;
    expect(fmt(m.ef)).toBe(fmt(m.es));
    expect(fmt(m.ls)).toBe(fmt(m.lf));
    expect(m.totalFloat).toBe(0);
    expect(m.isCritical).toBe(true);
  });

  it("spans the weekend from Friday to Monday", () => {
    const start = { ...input([task("A", 1), task("B", 1)], [dep("A", "B")]), projectStart: d("2024-01-05") };
    const r = compute(start, cal());
    expect(fmt(r.tasks.get("A")!.es)).toBe("2024-01-05");
    expect(fmt(r.tasks.get("B")!.es)).toBe("2024-01-08");
  });

  it("expands duration across a holiday", () => {
    const c = cal([{ date: d("2024-01-03"), working: false }]);
    const r = compute(input([task("A", 3)], []), c);
    expect(fmt(r.tasks.get("A")!.ef)).toBe("2024-01-04");
    expect(r.projectDuration).toBe(3);
  });

  it("shrinks duration when a Saturday is an extra working day", () => {
    const c = cal([{ date: d("2024-01-06"), working: true }]);
    const start = { ...input([task("A", 5)], []), projectStart: d("2024-01-05") };
    const r = compute(start, c);
    expect(fmt(r.tasks.get("A")!.ef)).toBe("2024-01-10");
  });

  it("rolls up a summary as min ES / max EF", () => {
    const tasks = [
      task("S", 0, { type: "Summary" }),
      task("A", 3, { parentId: "S" }),
      task("B", 5, { parentId: "S" }),
    ];
    const r = compute(input(tasks, []), cal());
    const s = r.tasks.get("S")!;
    expect(fmt(s.es)).toBe("2024-01-01");
    expect(fmt(s.ef)).toBe("2024-01-05");
    expect(fmt(s.ls)).toBe("2024-01-01");
    expect(fmt(s.lf)).toBe("2024-01-05");
    expect(s.isCritical).toBe(true);
  });

  it("computes correct float on the worked diamond", () => {
    const tasks = [task("A", 3), task("B", 2), task("C", 4), task("D", 3), task("E", 0, { type: "Milestone" })];
    const deps = [
      dep("A", "B"),
      dep("A", "C"),
      dep("B", "D"),
      dep("C", "E"),
      dep("D", "E"),
    ];
    const r = compute(input(tasks, deps), cal());
    expect(fmt(r.projectFinish)).toBe("2024-01-11");
    expect(r.projectDuration).toBe(9);
    expect(r.tasks.get("A")!.totalFloat).toBe(0);
    expect(r.tasks.get("B")!.totalFloat).toBe(0);
    expect(r.tasks.get("C")!.totalFloat).toBe(1);
    expect(r.tasks.get("D")!.totalFloat).toBe(0);
    expect(r.tasks.get("E")!.totalFloat).toBe(0);
    expect(r.tasks.get("C")!.freeFloat).toBe(1);
    expect(r.tasks.get("A")!.freeFloat).toBe(0);
    expect(r.criticalPath).toEqual(["A", "B", "D", "E"]);
  });

  it("flags the TF = 0 set as critical", () => {
    const tasks = [task("A", 3), task("B", 2), task("C", 4), task("D", 3), task("E", 0, { type: "Milestone" })];
    const deps = [dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "E"), dep("D", "E")];
    const r = compute(input(tasks, deps), cal());
    const critical = [...r.tasks.values()].filter((t) => t.isCritical).map((t) => t.id).sort();
    expect(critical).toEqual(["A", "B", "D", "E"]);
  });

  it("surfaces negative float from an FNLT constraint without clamping", () => {
    const tasks = [task("A", 3, { constraint: { type: "FNLT", date: d("2024-01-02") } })];
    const r = compute(input(tasks, []), cal());
    const a = r.tasks.get("A")!;
    expect(a.totalFloat).toBe(-1);
    expect(a.isCritical).toBe(true);
    expect(a.isViolatingConstraint).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const tasks = [task("A", 3), task("B", 2), task("C", 4), task("D", 3), task("E", 0, { type: "Milestone" })];
    const deps = [dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "E"), dep("D", "E")];
    const g = input(tasks, deps);
    expect(snap(compute(g, cal()))).toEqual(snap(compute(g, cal())));
  });

  it("applies SS lag 0 (start together)", () => {
    const r = compute(input([task("A", 3), task("B", 2)], [dep("A", "B", "SS", 0)]), cal());
    expect(fmt(r.tasks.get("B")!.es)).toBe(fmt(r.tasks.get("A")!.es));
  });

  it("rolls up duration-weighted percent complete on a summary", () => {
    const tasks = [
      task("S", 0, { type: "Summary" }),
      task("A", 3, { parentId: "S", percentComplete: 100 }),
      task("B", 5, { parentId: "S", percentComplete: 0 }),
    ];
    const r = compute(input(tasks, []), cal());
    const s = r.tasks.get("S")!;
    expect(s.duration).toBe(5);
    expect(s.percentComplete).toBeCloseTo((3 * 100 + 5 * 0) / 8, 5);
  });

  it("falls back to an equal-weight mean when total duration is zero", () => {
    const tasks = [
      task("S", 0, { type: "Summary" }),
      task("M1", 0, { type: "Milestone", parentId: "S", percentComplete: 100 }),
      task("M2", 0, { type: "Milestone", parentId: "S", percentComplete: 0 }),
    ];
    const r = compute(input(tasks, []), cal());
    expect(r.tasks.get("S")!.percentComplete).toBe(50);
  });

  it("schedules multiple roots independently", () => {
    const r = compute(input([task("A", 3), task("B", 5)], []), cal());
    expect(fmt(r.tasks.get("A")!.es)).toBe("2024-01-01");
    expect(fmt(r.tasks.get("B")!.es)).toBe("2024-01-01");
    expect(fmt(r.projectFinish)).toBe("2024-01-05");
    expect(r.tasks.get("A")!.totalFloat).toBe(2);
    expect(r.tasks.get("B")!.totalFloat).toBe(0);
  });

  it("handles multiple terminal tasks", () => {
    const tasks = [task("A", 3), task("B", 2), task("C", 1)];
    const deps = [dep("A", "B"), dep("A", "C")];
    const r = compute(input(tasks, deps), cal());
    expect(fmt(r.projectFinish)).toBe("2024-01-05");
    expect(r.tasks.get("C")!.totalFloat).toBe(1);
  });

  it("keeps totalFloat consistent with idx(LS) - idx(ES)", () => {
    const tasks = [task("A", 3), task("B", 2), task("C", 4), task("D", 3), task("E", 0, { type: "Milestone" })];
    const deps = [dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "E"), dep("D", "E")];
    const r = compute(input(tasks, deps), cal());
    const ps = d("2024-01-01");
    const idx = (dt: Date) => workingDayIndex(cal(), ps, dt);
    for (const t of r.tasks.values()) {
      expect(t.totalFloat).toBe(idx(t.ls) - idx(t.es));
    }
  });

  it("returns an empty schedule for an empty project", () => {
    const r = compute(input([], []), cal());
    expect(r.tasks.size).toBe(0);
    expect(fmt(r.projectFinish)).toBe("2024-01-01");
    expect(r.projectDuration).toBe(0);
    expect(r.criticalPath).toEqual([]);
  });

  it("accepts a milestone as a predecessor", () => {
    const tasks = [task("M", 0, { type: "Milestone" }), task("A", 2)];
    const r = compute(input(tasks, [dep("M", "A")]), cal());
    expect(fmt(r.tasks.get("M")!.ef)).toBe("2024-01-01");
    expect(fmt(r.tasks.get("A")!.es)).toBe("2024-01-02");
  });

  it("keeps a negative summary float when children have mixed criticality", () => {
    const tasks = [
      task("S", 0, { type: "Summary" }),
      task("A", 3, { parentId: "S", constraint: { type: "FNLT", date: d("2024-01-02") } }),
      task("B", 5, { parentId: "S" }),
    ];
    const r = compute(input(tasks, []), cal());
    const s = r.tasks.get("S")!;
    expect(r.tasks.get("A")!.totalFloat).toBe(-1);
    expect(s.totalFloat).toBe(-1);
    expect(s.isCritical).toBe(true);
  });

  it("pulls a successor before the project start with a negative FS lag", () => {
    const r = compute(input([task("A", 1), task("B", 2)], [dep("A", "B", "FS", -2)]), cal());
    expect(fmt(r.tasks.get("A")!.ef)).toBe("2024-01-01");
    expect(fmt(r.tasks.get("B")!.es)).toBe("2023-12-29");
  });

  it("rejects a summary task as a dependency endpoint", () => {
    const tasks = [task("S", 0, { type: "Summary" }), task("A", 1)];
    expect(() => compute(input(tasks, [dep("S", "A")]), cal())).toThrow("SUMMARY_DEPENDENCY: S");
  });
});
