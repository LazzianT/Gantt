import { describe, expect, it } from "vitest";
import { CycleError, buildAdjacency, topoSort } from "./graph.js";
import type { Dependency, ScheduleInput, Task } from "./types.js";

function task(id: string, order: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    projectId: "p1",
    parentId: null,
    type: "Normal",
    name: id,
    durationDays: 1,
    isManual: false,
    constraint: { type: "ASAP" },
    order,
    percentComplete: 0,
    ...extra,
  };
}

function dep(pred: string, succ: string): Dependency {
  return {
    id: `${pred}->${succ}`,
    predecessorId: pred,
    successorId: succ,
    type: "FS",
    lagDays: 0,
  };
}

function input(tasks: Task[], dependencies: Dependency[]): ScheduleInput {
  return { projectStart: new Date("2024-01-01T00:00:00.000Z"), tasks, dependencies };
}

describe("graph", () => {
  it("sorts a linear chain", () => {
    const g = input([task("A", 0), task("B", 1), task("C", 2)], [dep("A", "B"), dep("B", "C")]);
    expect(topoSort(g)).toEqual(["A", "B", "C"]);
  });

  it("sorts a diamond", () => {
    const g = input(
      [task("A", 0), task("B", 1), task("C", 2), task("D", 3)],
      [dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "D")],
    );
    expect(topoSort(g)).toEqual(["A", "B", "C", "D"]);
  });

  it("orders multiple roots deterministically by (order, id)", () => {
    const tasks = [task("root2", 0), task("root1", 0), task("b", 2), task("a", 1)];
    const g = input(tasks, [dep("root1", "a"), dep("root2", "b")]);
    expect(topoSort(g)).toEqual(["root1", "root2", "a", "b"]);
    // same graph, shuffled input -> identical result
    const shuffled = input([...tasks].reverse(), [dep("root1", "a"), dep("root2", "b")]);
    expect(topoSort(shuffled)).toEqual(["root1", "root2", "a", "b"]);
  });

  it("detects a 2-cycle and returns the path", () => {
    const g = input([task("A", 0), task("B", 1)], [dep("A", "B"), dep("B", "A")]);
    let err: unknown;
    try {
      topoSort(g);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CycleError);
    const path = (err as CycleError).cyclePath;
    expect([...path].sort()).toEqual(["A", "B"]);
    expect(path).toHaveLength(2);
  });

  it("detects a self-loop", () => {
    const g = input([task("A", 0)], [dep("A", "A")]);
    expect(() => topoSort(g)).toThrow(CycleError);
    try {
      topoSort(g);
    } catch (e) {
      expect((e as CycleError).cyclePath).toEqual(["A"]);
    }
  });

  it("handles a large acyclic graph without stack overflow", () => {
    const n = 500;
    const tasks: Task[] = [];
    const deps: Dependency[] = [];
    for (let i = 0; i < n; i++) {
      tasks.push(task(`t${i}`, i));
      if (i > 0) deps.push(dep(`t${i - 1}`, `t${i}`));
    }
    const order = topoSort(input(tasks, deps));
    expect(order).toHaveLength(n);
    expect(order[0]).toBe("t0");
    expect(order[n - 1]).toBe(`t${n - 1}`);
  });

  it("reports a large cycle without stack overflow", () => {
    const n = 500;
    const tasks: Task[] = [];
    const deps: Dependency[] = [];
    for (let i = 0; i < n; i++) {
      tasks.push(task(`t${i}`, i));
      deps.push(dep(`t${i}`, `t${(i + 1) % n}`));
    }
    try {
      topoSort(input(tasks, deps));
      throw new Error("expected CycleError");
    } catch (e) {
      expect(e).toBeInstanceOf(CycleError);
      expect((e as CycleError).cyclePath.length).toBe(n);
    }
  });

  it("builds sorted adjacency", () => {
    const g = input([task("A", 0), task("B", 1)], [dep("A", "B")]);
    const { successors, predecessors } = buildAdjacency(g);
    expect(successors.get("A")).toEqual(["B"]);
    expect(predecessors.get("B")).toEqual(["A"]);
    expect(successors.get("B")).toEqual([]);
  });
});
