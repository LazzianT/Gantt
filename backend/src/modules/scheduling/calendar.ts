// Working-day calendar math for the CPM engine. All dates are date-only UTC midnight.
// Inclusive semantics: a task starting Monday with duration 3 covers Mon, Tue, Wed.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun..Sat

export interface CalendarException {
  date: Date;
  working: boolean;
}

export interface WorkingCalendar {
  id: number;
  workingWeekdays: number[]; // 0=Sun..6=Sat
  hoursPerDay: number;
  exceptions: CalendarException[];
}

interface Resolved {
  weekdays: Set<number>;
  exceptions: Map<string, boolean>; // YYYY-MM-DD -> is_working
}

const cache = new WeakMap<WorkingCalendar, Resolved>();

function resolve(cal: WorkingCalendar): Resolved {
  const cached = cache.get(cal);
  if (cached) return cached;
  const exceptions = new Map<string, boolean>();
  for (const e of cal.exceptions) exceptions.set(toKey(e.date), e.working);
  const resolved: Resolved = { weekdays: new Set(cal.workingWeekdays), exceptions };
  cache.set(cal, resolved);
  return resolved;
}

function toKey(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

export function normalizeDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addCalendarDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

function isWorking(r: Resolved, d: Date): boolean {
  const ex = r.exceptions.get(toKey(d));
  if (ex !== undefined) return ex;
  return r.weekdays.has(d.getUTCDay());
}

export function isWorkingDay(cal: WorkingCalendar, d: Date): boolean {
  return isWorking(resolve(cal), normalizeDate(d));
}

export function nextWorkingDay(cal: WorkingCalendar, date: Date): Date {
  const r = resolve(cal);
  let d = addCalendarDays(normalizeDate(date), 1);
  while (!isWorking(r, d)) d = addCalendarDays(d, 1);
  return d;
}

export function prevWorkingDay(cal: WorkingCalendar, date: Date): Date {
  const r = resolve(cal);
  let d = addCalendarDays(normalizeDate(date), -1);
  while (!isWorking(r, d)) d = addCalendarDays(d, -1);
  return d;
}

// n working days forward; n may be negative. n=0 snaps forward to a working day.
export function addWorkingDays(cal: WorkingCalendar, date: Date, n: number): Date {
  const r = resolve(cal);
  let d = normalizeDate(date);
  if (n === 0) {
    while (!isWorking(r, d)) d = addCalendarDays(d, 1);
    return d;
  }
  const dir = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  if (!isWorking(r, d)) d = dir > 0 ? nextWorkingDay(cal, d) : prevWorkingDay(cal, d);
  while (remaining > 0) {
    d = addCalendarDays(d, dir);
    if (isWorking(r, d)) remaining--;
  }
  return d;
}

// Inclusive count of working days. Same working day => 1; b < a => negative count of [b, a].
export function workingDaysBetween(cal: WorkingCalendar, a: Date, b: Date): number {
  const start = normalizeDate(a);
  const end = normalizeDate(b);
  if (end.getTime() < start.getTime()) return -workingDaysBetween(cal, end, start);
  const r = resolve(cal);
  let count = 0;
  let d = start;
  const limit = end.getTime();
  while (d.getTime() <= limit) {
    if (isWorking(r, d)) count++;
    d = addCalendarDays(d, 1);
  }
  return count;
}

// Zero-based working-day index; the project start (as a working day) maps to 0.
// Dates before the project start map to negative indexes, inverse of addWorkingDays.
export function workingDayIndex(cal: WorkingCalendar, projectStart: Date, date: Date): number {
  const ps = normalizeDate(projectStart);
  const d = normalizeDate(date);
  const between = workingDaysBetween(cal, ps, d);
  return d.getTime() >= ps.getTime() ? between - 1 : between + 1;
}

export function workingDayIndexInverse(cal: WorkingCalendar, projectStart: Date, index: number): Date {
  return addWorkingDays(cal, projectStart, index);
}
