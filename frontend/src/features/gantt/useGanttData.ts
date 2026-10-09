import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  getBaselines,
  getBaselineVariance,
  getDependencies,
  getSchedule,
  getTaskTree,
  type Dependency,
  type Schedule,
  type ScheduleTask,
  type TaskNode,
} from './api';

export const ROW_HEIGHT = 32;

export type Scale = 'Day' | 'Week' | 'Month' | 'Quarter';

/** ponytail: the schedule payload exposes no calendar, so the axis assumes the seeded default
 *  (Mon–Fri). Swap workingWeekdays for a /calendars fetch when that endpoint exists. */
export interface WorkingCalendar {
  workingWeekdays: number[];
}

export const DEFAULT_CALENDAR: WorkingCalendar = { workingWeekdays: [1, 2, 3, 4, 5] };

export interface GanttRow {
  id: number;
  parentId: number | null;
  name: string;
  wbs: string;
  depth: number;
  type: 'Summary' | 'Task' | 'Milestone';
  start: string;
  finish: string;
  durationDays: number;
  progress: number;
  isCritical: boolean;
  totalFloat: number;
  baseline?: { start: string; finish: string };
  hasChildren: boolean;
  collapsed: boolean;
}

export interface AxisDay {
  date: string;
  isWorking: boolean;
  left: number;
  width: number;
}

export interface AxisGroup {
  key: string;
  label: string;
  left: number;
  width: number;
}

export interface Axis {
  days: AxisDay[];
  fine: AxisGroup[];
  coarse: AxisGroup[];
  dayWidth: number;
  totalWidth: number;
  todayX: number | null;
  start: string;
  end: string;
  xOf: (iso: string) => number;
  widthAt: (iso: string) => number;
  pxPerWorkingDay: number;
  dateForX: (x: number) => string;
}

export interface BarBox {
  left: number;
  width: number;
}

/** Bar geometry in timeline pixels. Milestones are a fixed 12px diamond. */
export function barBox(row: GanttRow, axis: Axis): BarBox {
  const left = axis.xOf(row.start);
  if (row.type === 'Milestone') {
    return { left: left + axis.widthAt(row.start) / 2 - 6, width: 12 };
  }
  const right = axis.xOf(row.finish) + axis.widthAt(row.finish);
  return { left, width: Math.max(axis.dayWidth, right - left) };
}

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface ScaleConfig {
  unitPx: number;
  daysPerUnit: number;
  workingDaysPerUnit: number;
}

// Column widths per docs/gantt-engine.md §3. Compressed mode divides a unit over its working days
// so weekends/holidays collapse; expanded mode spreads it over all calendar days.
const SCALES: Record<Scale, ScaleConfig> = {
  Day: { unitPx: 32, daysPerUnit: 1, workingDaysPerUnit: 1 },
  Week: { unitPx: 88, daysPerUnit: 7, workingDaysPerUnit: 5 },
  Month: { unitPx: 120, daysPerUnit: 30.44, workingDaysPerUnit: 21.7 },
  Quarter: { unitPx: 200, daysPerUnit: 91.31, workingDaysPerUnit: 65.2 },
};

function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}

function todayISO(): string {
  return toISO(new Date());
}

function isWorkingDay(date: Date, cal: WorkingCalendar): boolean {
  return cal.workingWeekdays.includes(date.getUTCDay());
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

function startOfISOWeek(date: Date): Date {
  const day = date.getUTCDay() || 7;
  return addDays(date, 1 - day);
}

function quarterOf(date: Date): number {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

function fineKey(scale: Scale, iso: string): string {
  if (scale === 'Day') return iso;
  if (scale === 'Week') return toISO(startOfISOWeek(parseISO(iso)));
  if (scale === 'Month') return iso.slice(0, 7);
  return `${iso.slice(0, 4)}-Q${quarterOf(parseISO(iso))}`;
}

function coarseKey(scale: Scale, iso: string): string {
  return scale === 'Day' || scale === 'Week' ? iso.slice(0, 7) : iso.slice(0, 4);
}

function fineLabel(scale: Scale, iso: string): string {
  const d = parseISO(iso);
  if (scale === 'Day') return String(d.getUTCDate());
  if (scale === 'Week') return `W${isoWeek(d)}`;
  if (scale === 'Month') return MONTHS[d.getUTCMonth()];
  return `Q${quarterOf(d)}`;
}

function coarseLabel(scale: Scale, iso: string): string {
  const d = parseISO(iso);
  if (scale === 'Day' || scale === 'Week') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return String(d.getUTCFullYear());
}

function groupDays(days: AxisDay[], scale: Scale, kind: 'fine' | 'coarse'): AxisGroup[] {
  const keyOf = kind === 'fine' ? fineKey : coarseKey;
  const labelOf = kind === 'fine' ? fineLabel : coarseLabel;
  const groups: AxisGroup[] = [];
  for (const day of days) {
    const key = keyOf(scale, day.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.width = day.left + day.width - last.left;
    } else {
      groups.push({ key, label: labelOf(scale, day.date), left: day.left, width: day.width });
    }
  }
  return groups;
}

/** Builds the day-slot axis: x positions are working-day indices (compressed) or calendar-day
 *  indices (expanded). No scheduling math — dates come from the engine. */
export function buildAxis(
  rows: GanttRow[],
  scale: Scale,
  compressed: boolean,
  zoom: number,
  cal: WorkingCalendar = DEFAULT_CALENDAR,
): Axis {
  const cfg = SCALES[scale];
  const dayWidth =
    (compressed ? cfg.unitPx / cfg.workingDaysPerUnit : cfg.unitPx / cfg.daysPerUnit) * zoom;

  const stamps: string[] = [];
  for (const row of rows) stamps.push(row.start, row.finish);
  let start: Date;
  let end: Date;
  if (stamps.length === 0) {
    const today = parseISO(todayISO());
    start = addDays(today, -14);
    end = addDays(today, 21);
  } else {
    stamps.sort();
    start = addDays(parseISO(stamps[0]), -3);
    end = addDays(parseISO(stamps[stamps.length - 1]), 3);
  }

  const days: AxisDay[] = [];
  const byDate = new Map<string, AxisDay>();
  let cursor = 0;
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    const iso = toISO(d);
    const working = isWorkingDay(d, cal);
    const width = compressed ? (working ? dayWidth : 0) : dayWidth;
    const cell: AxisDay = { date: iso, isWorking: working, left: cursor, width };
    days.push(cell);
    byDate.set(iso, cell);
    cursor += width;
  }
  const totalWidth = cursor;
  const startIso = toISO(start);
  const endIso = toISO(end);

  const xOf = (iso: string): number => {
    const cell = byDate.get(iso.slice(0, 10));
    if (cell) return cell.left;
    return iso < startIso ? 0 : totalWidth;
  };
  const widthAt = (iso: string): number => byDate.get(iso.slice(0, 10))?.width ?? dayWidth;

  const today = todayISO();
  const todayCell = byDate.get(today);
  const todayX = todayCell ? todayCell.left + todayCell.width / 2 : null;

  // Inverse of xOf: snap a pixel to the working day whose slot contains it, else the nearest.
  const dateForX = (x: number): string => {
    let nearest = days[0];
    let nearestDist = Infinity;
    for (const cell of days) {
      if (cell.width > 0 && x >= cell.left && x < cell.left + cell.width) return cell.date;
      const dist = Math.abs(x - (cell.left + cell.width / 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = cell;
      }
    }
    return nearest.date;
  };

  return {
    days,
    fine: groupDays(days, scale, 'fine'),
    coarse: groupDays(days, scale, 'coarse'),
    dayWidth,
    totalWidth,
    todayX,
    start: startIso,
    end: endIso,
    xOf,
    widthAt,
    // ponytail: expanded mode counts calendar columns, so this is exact only in compressed
    // (working-days) mode — the default. Switch to counting calendar days between dates if expanded resize matters.
    pxPerWorkingDay: dayWidth,
    dateForX,
  };
}

function subtreeSpan(
  node: TaskNode,
  sched: Map<number, ScheduleTask>,
): { start: string | null; finish: string | null } {
  const scheduled = sched.get(node.id);
  let start = scheduled?.esDate ?? node.esDate ?? node.startDate;
  let finish = scheduled?.efDate ?? node.efDate ?? node.finishDate;
  for (const child of node.children ?? []) {
    const span = subtreeSpan(child, sched);
    if (span.start && (!start || span.start < start)) start = span.start;
    if (span.finish && (!finish || span.finish > finish)) finish = span.finish;
  }
  return { start, finish };
}

function isMilestoneNode(node: TaskNode): boolean {
  return node.taskType === 'Milestone' || node.isMilestone;
}

function buildRows(
  tree: TaskNode[],
  sched: Map<number, ScheduleTask>,
  baselineByTask: Map<number, { start: string; finish: string }>,
  collapsed: Set<number>,
): GanttRow[] {
  const rows: GanttRow[] = [];
  const walk = (nodes: TaskNode[], depth: number): void => {
    for (const node of nodes) {
      const hasChildren = (node.children ?? []).length > 0;
      const span = subtreeSpan(node, sched);
      const scheduled = sched.get(node.id);
      if (span.start && span.finish) {
        const milestone = isMilestoneNode(node);
        const type: GanttRow['type'] = milestone ? 'Milestone' : node.taskType === 'Summary' ? 'Summary' : 'Task';
        rows.push({
          id: node.id,
          parentId: node.parentTaskId,
          name: node.name,
          wbs: node.wbsCode ?? '',
          depth,
          type,
          start: span.start,
          finish: span.finish,
          durationDays: scheduled?.duration ?? node.durationDays ?? 0,
          progress: scheduled?.percentComplete ?? node.progressPercent,
          isCritical: scheduled?.isCritical ?? node.isCritical,
          totalFloat: scheduled?.totalFloat ?? node.totalFloatDays ?? 0,
          baseline: baselineByTask.get(node.id),
          hasChildren,
          collapsed: collapsed.has(node.id),
        });
      }
      if (hasChildren && !collapsed.has(node.id)) walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return rows;
}

export interface GanttDataOptions {
  scale: Scale;
  compressed: boolean;
  zoom: number;
  collapsed: Set<number>;
}

export interface GanttData {
  loading: boolean;
  error: string | null;
  reload: () => void;
  rows: GanttRow[];
  rowIndex: Map<number, number>;
  axis: Axis;
  dependencies: Dependency[];
  criticalIds: Set<number>;
  schedule: Schedule | null;
  hasBaseline: boolean;
  collapsibleIds: number[];
}

export function useGanttData(projectId: number, options: GanttDataOptions): GanttData {
  const { scale, compressed, zoom, collapsed } = options;
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [tree, setTree] = useState<TaskNode[] | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [baselineByTask, setBaselineByTask] = useState<Map<number, { start: string; finish: string }>>(new Map());
  const [hasBaseline, setHasBaseline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [nextSchedule, nextTree, nextDeps] = await Promise.all([
          getSchedule(projectId),
          getTaskTree(projectId),
          getDependencies(projectId),
        ]);
        if (cancelled) return;
        setSchedule(nextSchedule);
        setTree(nextTree ?? []);
        setDependencies(nextDeps ?? []);
        try {
          const baselines = await getBaselines(projectId);
          if (cancelled) return;
          const latest = (baselines ?? [])[0];
          setHasBaseline(Boolean(latest));
          if (latest) {
            const variance = await getBaselineVariance(latest.baseline_id);
            if (cancelled) return;
            const map = new Map<number, { start: string; finish: string }>();
            for (const row of variance ?? []) {
              if (row.baseline_start && row.baseline_finish) {
                map.set(row.task_id, { start: row.baseline_start, finish: row.baseline_finish });
              }
            }
            setBaselineByTask(map);
          } else {
            setBaselineByTask(new Map());
          }
        } catch {
          if (!cancelled) {
            setHasBaseline(false);
            setBaselineByTask(new Map());
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load the schedule.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const schedById = useMemo(() => {
    const map = new Map<number, ScheduleTask>();
    for (const task of schedule?.tasks ?? []) map.set(task.id, task);
    return map;
  }, [schedule]);

  const emptyCollapsed = useMemo(() => new Set<number>(), []);

  const fullRows = useMemo(
    () => (tree ? buildRows(tree, schedById, baselineByTask, emptyCollapsed) : []),
    [tree, schedById, baselineByTask, emptyCollapsed],
  );

  const rows = useMemo(
    () => (tree ? buildRows(tree, schedById, baselineByTask, collapsed) : []),
    [tree, schedById, baselineByTask, collapsed],
  );

  const rowIndex = useMemo(() => {
    const map = new Map<number, number>();
    rows.forEach((row, index) => map.set(row.id, index));
    return map;
  }, [rows]);

  const axis = useMemo(
    () => buildAxis(fullRows, scale, compressed, zoom),
    [fullRows, scale, compressed, zoom],
  );

  const criticalIds = useMemo(() => new Set(schedule?.criticalPath ?? []), [schedule]);

  const collapsibleIds = useMemo(
    () => fullRows.filter((row) => row.hasChildren).map((row) => row.id),
    [fullRows],
  );

  return {
    loading,
    error,
    reload,
    rows,
    rowIndex,
    axis,
    dependencies,
    criticalIds,
    schedule,
    hasBaseline,
    collapsibleIds,
  };
}

// Runnable self-check of the non-trivial axis math; dev-only, cheap, no test runner needed.
function selfCheck(): void {
  if (!import.meta.env.DEV) return;
  const rows: GanttRow[] = [
    {
      id: 1,
      parentId: null,
      name: 'A',
      wbs: '1',
      depth: 0,
      type: 'Task',
      start: '2026-03-02',
      finish: '2026-03-06',
      durationDays: 5,
      progress: 0,
      isCritical: false,
      totalFloat: 0,
      hasChildren: false,
      collapsed: false,
    },
  ];
  const axis = buildAxis(rows, 'Day', true, 1, DEFAULT_CALENDAR);
  const saturday = axis.days.find((d) => d.date === '2026-03-07');
  const monday = axis.days.find((d) => d.date === '2026-03-02');
  console.assert(saturday?.width === 0, 'gantt axis: compressed non-working days must collapse to zero width');
  console.assert(monday?.width === 32, 'gantt axis: Day scale working day must be 32px');
  console.assert(axis.xOf('2026-03-06') > axis.xOf('2026-03-02'), 'gantt axis: x must advance along working days');
  console.assert(axis.dateForX(axis.xOf('2026-03-02')) === '2026-03-02', 'gantt axis: dateForX must invert xOf on working days');
}

selfCheck();
