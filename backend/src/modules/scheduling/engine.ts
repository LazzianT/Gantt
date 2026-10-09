// CPM scheduling engine. Pure and deterministic: same input + calendar -> same dates.

import {
  addWorkingDays,
  isWorkingDay,
  normalizeDate,
  prevWorkingDay,
  workingDayIndex,
  workingDaysBetween,
  type WorkingCalendar,
} from "./calendar.js";
import { topoSort } from "./graph.js";
import type {
  ComputedTask,
  Dependency,
  ScheduleInput,
  ScheduleResult,
  Task,
} from "./types.js";

function snapForward(cal: WorkingCalendar, date: Date): Date {
  return addWorkingDays(cal, normalizeDate(date), 0);
}

// Snap a boundary to a working day without moving an already-working date.
function snapBackward(cal: WorkingCalendar, date: Date): Date {
  const d = normalizeDate(date);
  return isWorkingDay(cal, d) ? d : prevWorkingDay(cal, d);
}

function durationOf(task: Task): number {
  return task.type === "Milestone" ? 0 : task.durationDays;
}

function finishOf(cal: WorkingCalendar, start: Date, duration: number): Date {
  return duration <= 0 ? normalizeDate(start) : addWorkingDays(cal, start, duration - 1);
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

// ES bound implied by one predecessor. FF/SF bound a finish, converted to a start.
function impliedES(
  cal: WorkingCalendar,
  dep: Dependency,
  predES: Date,
  predEF: Date,
  succDuration: number,
): Date {
  const lag = dep.lagDays;
  switch (dep.type) {
    case "FS":
      return addWorkingDays(cal, predEF, lag + 1);
    case "SS":
      return addWorkingDays(cal, predES, lag);
    case "FF": {
      const finishBound = addWorkingDays(cal, predEF, lag);
      return succDuration <= 0 ? finishBound : addWorkingDays(cal, finishBound, -(succDuration - 1));
    }
    case "SF": {
      const finishBound = addWorkingDays(cal, predES, lag);
      return succDuration <= 0 ? finishBound : addWorkingDays(cal, finishBound, -(succDuration - 1));
    }
  }
}

// LF bound a successor places on its predecessor.
function predecessorLF(
  cal: WorkingCalendar,
  dep: Dependency,
  predDuration: number,
  succES: Date,
  succEF: Date,
): Date {
  const lag = dep.lagDays;
  switch (dep.type) {
    case "FS":
      return addWorkingDays(cal, succES, -(lag + 1));
    case "SS": {
      const esBound = addWorkingDays(cal, succES, -lag);
      return predDuration <= 0 ? esBound : addWorkingDays(cal, esBound, predDuration - 1);
    }
    case "FF":
      return addWorkingDays(cal, succEF, -lag);
    case "SF":
      return addWorkingDays(cal, succES, -lag);
  }
}

function freeFloatFor(
  idx: (d: Date) => number,
  dep: Dependency,
  taskES: Date,
  taskEF: Date,
  succES: Date,
  succEF: Date,
): number {
  const lag = dep.lagDays;
  switch (dep.type) {
    case "FS":
      return idx(succES) - idx(taskEF) - 1 - lag;
    case "SS":
      return idx(succES) - idx(taskES) - lag;
    case "FF":
      return idx(succEF) - idx(taskEF) - lag;
    case "SF":
      return idx(succEF) - idx(taskES) - lag;
  }
}

export function compute(input: ScheduleInput, cal: WorkingCalendar): ScheduleResult {
  const order = topoSort(input);
  const byId = new Map(input.tasks.map((t) => [t.id, t] as const));
  const projectStart = snapForward(cal, input.projectStart);

  for (const dep of input.dependencies) {
    for (const endpoint of [dep.predecessorId, dep.successorId]) {
      if (byId.get(endpoint)?.type === "Summary") {
        throw new Error(`SUMMARY_DEPENDENCY: ${endpoint}`);
      }
    }
  }

  const incoming = new Map<string, Dependency[]>();
  const outgoing = new Map<string, Dependency[]>();
  for (const t of input.tasks) {
    incoming.set(t.id, []);
    outgoing.set(t.id, []);
  }
  for (const d of input.dependencies) {
    outgoing.get(d.predecessorId)?.push(d);
    incoming.get(d.successorId)?.push(d);
  }

  const es = new Map<string, Date>();
  const ef = new Map<string, Date>();
  const nonSummary: string[] = [];

  for (const id of order) {
    const task = byId.get(id)!;
    if (task.type === "Summary") continue;
    nonSummary.push(id);
    const dur = durationOf(task);

    if (task.isManual) {
      const start = snapForward(cal, task.manualStart ?? input.projectStart);
      es.set(id, start);
      ef.set(id, finishOf(cal, start, dur));
      continue;
    }

    const candidates: Date[] = [];
    const inDeps = incoming.get(id) ?? [];
    // Only roots anchor to the project start; successors may be pulled before it by negative lag.
    if (inDeps.length === 0) candidates.push(projectStart);
    if (task.constraint.type === "SNET" && task.constraint.date) {
      candidates.push(task.constraint.date);
    }
    for (const dep of inDeps) {
      candidates.push(impliedES(cal, dep, es.get(dep.predecessorId)!, ef.get(dep.predecessorId)!, dur));
    }
    let start = candidates[0];
    for (const c of candidates) start = maxDate(start, c);

    const esDate = snapForward(cal, start);
    es.set(id, esDate);
    ef.set(id, finishOf(cal, esDate, dur));
  }

  let projectFinish: Date | null = null;
  for (const id of nonSummary) {
    const e = ef.get(id)!;
    projectFinish = projectFinish === null ? e : maxDate(projectFinish, e);
  }
  if (projectFinish === null) projectFinish = projectStart;

  const idx = (d: Date) => workingDayIndex(cal, projectStart, d);
  const ls = new Map<string, Date>();
  const lf = new Map<string, Date>();

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const task = byId.get(id)!;
    if (task.type === "Summary") continue;
    const dur = durationOf(task);
    const outDeps = outgoing.get(id) ?? [];

    let lfDate: Date | null = null;
    if (outDeps.length === 0) {
      lfDate = projectFinish;
    } else {
      for (const dep of outDeps) {
        const bound = predecessorLF(cal, dep, dur, es.get(dep.successorId)!, ef.get(dep.successorId)!);
        lfDate = lfDate === null ? bound : minDate(lfDate, bound);
      }
    }
    if (task.constraint.type === "FNLT" && task.constraint.date) {
      lfDate = lfDate === null ? task.constraint.date : minDate(lfDate, task.constraint.date);
    }

    const lfSnap = snapBackward(cal, lfDate!);
    lf.set(id, lfSnap);
    ls.set(id, dur <= 0 ? lfSnap : addWorkingDays(cal, lfSnap, -(dur - 1)));
  }

  const computed = new Map<string, ComputedTask>();
  for (const id of nonSummary) {
    const task = byId.get(id)!;
    const dur = durationOf(task);
    const outDeps = outgoing.get(id) ?? [];
    let freeFloat: number;
    if (outDeps.length === 0) {
      freeFloat = Math.max(0, idx(lf.get(id)!) - idx(ef.get(id)!));
    } else {
      let min = Infinity;
      for (const dep of outDeps) {
        const value = freeFloatFor(
          idx,
          dep,
          es.get(id)!,
          ef.get(id)!,
          es.get(dep.successorId)!,
          ef.get(dep.successorId)!,
        );
        if (value < min) min = value;
      }
      freeFloat = Math.max(0, min);
    }
    const totalFloat = idx(lf.get(id)!) - idx(ef.get(id)!);
    computed.set(id, {
      id,
      es: es.get(id)!,
      ef: ef.get(id)!,
      ls: ls.get(id)!,
      lf: lf.get(id)!,
      duration: dur,
      percentComplete: task.percentComplete,
      totalFloat,
      freeFloat,
      isCritical: totalFloat <= 0,
      isViolatingConstraint: totalFloat < 0,
    });
  }

  const descendantsOf = (summaryId: string): ComputedTask[] => {
    const leaves: ComputedTask[] = [];
    for (const c of input.tasks) {
      if (c.parentId !== summaryId) continue;
      if (c.type === "Summary") leaves.push(...descendantsOf(c.id));
      else leaves.push(computed.get(c.id)!);
    }
    return leaves;
  };

  const rollup = (summaryId: string): ComputedTask => {
    const existing = computed.get(summaryId);
    if (existing) return existing;

    const children = input.tasks.filter((t) => t.parentId === summaryId);
    const childResults = children.map((c) =>
      c.type === "Summary" ? rollup(c.id) : computed.get(c.id)!,
    );

    let result: ComputedTask;
    if (childResults.length === 0) {
      result = {
        id: summaryId,
        es: projectStart,
        ef: projectStart,
        ls: projectStart,
        lf: projectStart,
        duration: 0,
        percentComplete: 0,
        totalFloat: 0,
        freeFloat: 0,
        isCritical: false,
        isViolatingConstraint: false,
      };
    } else {
      let esMin = childResults[0].es;
      let efMax = childResults[0].ef;
      let lsMin = childResults[0].ls;
      let lfMax = childResults[0].lf;
      let minFloat = childResults[0].totalFloat;
      let anyCritical = false;
      let anyViolating = false;
      for (const c of childResults) {
        esMin = minDate(esMin, c.es);
        efMax = maxDate(efMax, c.ef);
        lsMin = minDate(lsMin, c.ls);
        lfMax = maxDate(lfMax, c.lf);
        if (c.totalFloat < minFloat) minFloat = c.totalFloat;
        if (c.isCritical) anyCritical = true;
        if (c.isViolatingConstraint) anyViolating = true;
      }

      const leaves = descendantsOf(summaryId);
      let weight = 0;
      let weighted = 0;
      for (const leaf of leaves) {
        const w = Math.max(0, leaf.duration);
        weight += w;
        weighted += w * leaf.percentComplete;
      }
      const percentComplete =
        weight > 0
          ? weighted / weight
          : leaves.length > 0
            ? leaves.reduce((s, l) => s + l.percentComplete, 0) / leaves.length
            : 0;

      result = {
        id: summaryId,
        es: esMin,
        ef: efMax,
        ls: lsMin,
        lf: lfMax,
        duration: workingDaysBetween(cal, esMin, efMax),
        percentComplete,
        totalFloat: minFloat,
        freeFloat: 0,
        isCritical: anyCritical,
        isViolatingConstraint: anyViolating,
      };
    }
    computed.set(summaryId, result);
    return result;
  };
  for (const s of input.tasks) if (s.type === "Summary") rollup(s.id);

  const orderIndex = new Map(input.tasks.map((t) => [t.id, t.order] as const));
  const cmp = (a: string, b: string) => {
    const oa = orderIndex.get(a) ?? 0;
    const ob = orderIndex.get(b) ?? 0;
    return oa !== ob ? oa - ob : a < b ? -1 : a > b ? 1 : 0;
  };

  const criticalOut = new Map<string, string[]>();
  const criticalIndeg = new Map<string, number>();
  for (const id of nonSummary) {
    if (!computed.get(id)!.isCritical) continue;
    criticalOut.set(id, []);
    criticalIndeg.set(id, 0);
  }
  for (const d of input.dependencies) {
    if (!criticalOut.has(d.predecessorId) || !criticalOut.has(d.successorId)) continue;
    criticalOut.get(d.predecessorId)!.push(d.successorId);
    criticalIndeg.set(d.successorId, (criticalIndeg.get(d.successorId) ?? 0) + 1);
  }
  for (const list of criticalOut.values()) list.sort(cmp);

  const memo = new Map<string, string[]>();
  const longestFrom = (id: string): string[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    let best: string[] = [id];
    for (const next of criticalOut.get(id) ?? []) {
      const candidate = [id, ...longestFrom(next)];
      if (candidate.length > best.length) best = candidate;
    }
    memo.set(id, best);
    return best;
  };
  let criticalPath: string[] = [];
  const roots = [...criticalOut.keys()]
    .filter((id) => (criticalIndeg.get(id) ?? 0) === 0)
    .sort(cmp);
  for (const root of roots) {
    const chain = longestFrom(root);
    if (chain.length > criticalPath.length) criticalPath = chain;
  }

  return {
    tasks: computed,
    projectFinish: projectFinish!,
    projectDuration:
      nonSummary.length === 0 ? 0 : workingDaysBetween(cal, projectStart, projectFinish!),
    criticalPath,
  };
}
