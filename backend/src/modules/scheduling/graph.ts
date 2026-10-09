import type { ScheduleInput } from "./types.js";

export class CycleError extends Error {
  readonly cyclePath: string[];

  constructor(cyclePath: string[]) {
    super(`Cycle detected: ${cyclePath.join(" -> ")}`);
    this.name = "CycleError";
    this.cyclePath = cyclePath;
  }
}

export interface Adjacency {
  predecessors: Map<string, string[]>;
  successors: Map<string, string[]>;
}

// Task order key per project; ties broken by id for determinism.
function orderIndex(input: ScheduleInput): Map<string, number> {
  const order = new Map<string, number>();
  for (const t of input.tasks) order.set(t.id, t.order);
  return order;
}

function compare(order: Map<string, number>, a: string, b: string): number {
  const oa = order.get(a) ?? 0;
  const ob = order.get(b) ?? 0;
  if (oa !== ob) return oa - ob;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildAdjacency(input: ScheduleInput): Adjacency {
  const order = orderIndex(input);
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const t of input.tasks) {
    predecessors.set(t.id, []);
    successors.set(t.id, []);
  }
  for (const d of input.dependencies) {
    successors.get(d.predecessorId)?.push(d.successorId);
    predecessors.get(d.successorId)?.push(d.predecessorId);
  }
  const cmp = (a: string, b: string) => compare(order, a, b);
  for (const list of successors.values()) list.sort(cmp);
  for (const list of predecessors.values()) list.sort(cmp);
  return { predecessors, successors };
}

// Iterative 3-color DFS. Explicit stack so deep graphs cannot overflow the call stack.
function findCycle(
  tasks: ScheduleInput["tasks"],
  successors: Map<string, string[]>,
  order: Map<string, number>,
): string[] {
  const GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const path: string[] = [];
  const roots = tasks.map((t) => t.id).sort((a, b) => compare(order, a, b));

  for (const root of roots) {
    if (color.has(root)) continue;
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
    color.set(root, GRAY);
    path.push(root);

    while (stack.length) {
      const frame = stack[stack.length - 1];
      const succ = successors.get(frame.id) ?? [];
      if (frame.next < succ.length) {
        const v = succ[frame.next++];
        const c = color.get(v);
        if (c === GRAY) {
          const start = path.indexOf(v);
          return path.slice(start);
        }
        if (c === undefined) {
          color.set(v, GRAY);
          path.push(v);
          stack.push({ id: v, next: 0 });
        }
      } else {
        color.set(frame.id, BLACK);
        stack.pop();
        path.pop();
      }
    }
  }
  return [];
}

// Kahn's algorithm. Ready-set ordered by (order, id); throws CycleError on a cycle.
export function topoSort(input: ScheduleInput): string[] {
  const order = orderIndex(input);
  const { successors } = buildAdjacency(input);
  const indegree = new Map<string, number>();
  for (const t of input.tasks) indegree.set(t.id, 0);
  for (const d of input.dependencies) {
    if (!indegree.has(d.successorId)) continue;
    indegree.set(d.successorId, (indegree.get(d.successorId) ?? 0) + 1);
  }

  const ready = input.tasks
    .filter((t) => indegree.get(t.id) === 0)
    .map((t) => t.id)
    .sort((a, b) => compare(order, a, b));

  const result: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    result.push(id);
    for (const next of successors.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        // binary insert keeps the ready-set ordered without re-sorting each time
        let lo = 0, hi = ready.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (compare(order, ready[mid], next) < 0) lo = mid + 1;
          else hi = mid;
        }
        ready.splice(lo, 0, next);
      }
    }
  }

  if (result.length !== input.tasks.length) {
    throw new CycleError(findCycle(input.tasks, successors, order));
  }
  return result;
}
