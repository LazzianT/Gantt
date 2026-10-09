import { isWorkingDay, normalizeDate, type WorkingCalendar } from "../scheduling/calendar.js";

/** Utilization below this is Underallocated; at/above it is Balanced until OVERALLOCATED. */
export const UNDERALLOCATED_THRESHOLD = 0.8;
/** Utilization strictly above this is Overallocated; exactly at it is Balanced. */
export const OVERALLOCATED_THRESHOLD = 1.0;

export type Classification = "Underallocated" | "Balanced" | "Overallocated";

export interface WorkloadAssignment {
  employee_nip: string | null;
  project_id?: number;
  resource_id: number;
  allocation_percent: number;
  start_date: Date | string | null;
  finish_date: Date | string | null;
}

export interface WorkloadDayRow {
  employee_nip: string;
  date: string;
  hours: number;
  capacity: number;
  utilization: number;
  classification: Classification;
}

export interface WorkloadSummary {
  employee_nip: string;
  days: number;
  hours: number;
  capacity: number;
  utilization: number;
  classification: Classification;
  underallocatedDays: number;
  balancedDays: number;
  overallocatedDays: number;
}

export interface WorkloadResult {
  from: string;
  to: string;
  rows: WorkloadDayRow[];
  summary: WorkloadSummary[];
}

export interface ComputeWorkloadInput {
  assignments: WorkloadAssignment[];
  calendar: WorkingCalendar;
  from: Date | string;
  to: Date | string;
  /** employee_nip -> max_units; missing means 1. */
  capacityByResource?: Record<string, number>;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDay(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return normalizeDate(value);
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function classify(utilization: number): Classification {
  if (utilization < UNDERALLOCATED_THRESHOLD) return "Underallocated";
  if (utilization > OVERALLOCATED_THRESHOLD) return "Overallocated";
  return "Balanced";
}

function covers(assignment: WorkloadAssignment, day: Date): boolean {
  const start = toDay(assignment.start_date);
  if (!start) return false;
  const finish = toDay(assignment.finish_date) ?? start;
  const t = day.getTime();
  return t >= start.getTime() && t <= finish.getTime();
}

export function computeWorkload(input: ComputeWorkloadInput): WorkloadResult {
  const from = toDay(input.from);
  const to = toDay(input.to);
  if (!from || !to) throw new Error("computeWorkload requires from and to dates");

  const { calendar } = input;
  const hoursPerDay = num(calendar.hoursPerDay) || 8;
  const capacityBy = input.capacityByResource ?? {};

  const byEmployee = new Map<string, WorkloadAssignment[]>();
  for (const a of input.assignments) {
    if (!a.employee_nip) continue;
    const list = byEmployee.get(a.employee_nip);
    if (list) list.push(a);
    else byEmployee.set(a.employee_nip, [a]);
  }

  const rows: WorkloadDayRow[] = [];
  const summary: WorkloadSummary[] = [];

  for (const [employeeNip, list] of byEmployee) {
    const perDayCapacity = (num(capacityBy[employeeNip]) || 1) * hoursPerDay;
    let hours = 0;
    let days = 0;
    let under = 0;
    let balanced = 0;
    let over = 0;

    for (let d = from; d.getTime() <= to.getTime(); d = nextDay(d)) {
      if (!isWorkingDay(calendar, d)) continue;
      let demand = 0;
      for (const a of list) {
        if (covers(a, d)) demand += hoursPerDay * (num(a.allocation_percent) / 100);
      }
      const utilization = perDayCapacity > 0 ? demand / perDayCapacity : 0;
      const classification = classify(utilization);
      rows.push({
        employee_nip: employeeNip,
        date: iso(d),
        hours: round(demand),
        capacity: round(perDayCapacity),
        utilization: round(utilization, 4),
        classification,
      });
      days++;
      hours += demand;
      if (classification === "Underallocated") under++;
      else if (classification === "Overallocated") over++;
      else balanced++;
    }

    const totalCapacity = perDayCapacity * days;
    const totalUtilization = totalCapacity > 0 ? hours / totalCapacity : 0;
    summary.push({
      employee_nip: employeeNip,
      days,
      hours: round(hours),
      capacity: round(totalCapacity),
      utilization: round(totalUtilization, 4),
      classification: classify(totalUtilization),
      underallocatedDays: under,
      balancedDays: balanced,
      overallocatedDays: over,
    });
  }

  return { from: iso(from), to: iso(to), rows, summary };
}

/** merges per-project rows; demand sums, capacity is the peak (a person is not N people across projects). */
export function aggregateCrossProject(rows: WorkloadDayRow[]): WorkloadDayRow[] {
  const merged = new Map<string, WorkloadDayRow>();
  for (const row of rows) {
    const key = `${row.employee_nip}\u0000${row.date}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row });
      continue;
    }
    existing.hours = round(existing.hours + row.hours);
    existing.capacity = Math.max(existing.capacity, row.capacity);
  }

  const out: WorkloadDayRow[] = [];
  for (const row of merged.values()) {
    const utilization = row.capacity > 0 ? row.hours / row.capacity : 0;
    out.push({ ...row, utilization: round(utilization, 4), classification: classify(utilization) });
  }
  out.sort((a, b) => a.employee_nip.localeCompare(b.employee_nip) || a.date.localeCompare(b.date));
  return out;
}
