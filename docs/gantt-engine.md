# Gantt Engine (View)

The Gantt is a pure view over the server-computed schedule. It renders. It never schedules. Every edit is intent sent to the API, followed by a reschedule and re-render.

## 1. Sync contract

```
+----------------+        read         +------------------+       compute      +-----------+
|  Gantt View    | <------------------ |  Schedule API    | <---------------- |  CPM      |
|  (React)       |                     |  {data}          |                   |  Engine   |
|  renders only  |                     |  scheduleVersion |                   |  (pure)   |
|                | ------------------> |                  |                   |
+----------------+   intent (mutate)   +------------------+                   +-----------+
```

Rules:

1. View reads `{ tasks, projectFinish, scheduleVersion }`. It computes nothing.
2. Every mutation sends intent: `PATCH start`, `PATCH durationDays`, `POST dependency`, `PATCH dependency`, `PATCH progress`.
3. After a successful mutation, the view refetches the schedule. The server returns the new dates.
4. Optimistic preview is local and temporary. On error it reverts to the last server state.
5. `scheduleVersion` invalidates the view cache. `memo` keys include `id + scheduleVersion`.

Task Model <-> Engine <-> Gantt:

| Layer | Shape | Owning module |
|-------|-------|---------------|
| Task Model | `project_tasks` rows | repositories |
| Engine | `ScheduledTask { es, ef, ls, lf, totalFloat, freeFloat, isCritical }` | engine |
| Gantt VM | `GanttRow { id, name, depth, start, finish, progress, type, critical, baseline }` | gantt.scale.ts / GanttRoot |

## 2. Gantt view model

```ts
interface GanttRowVM {
  id: number;
  name: string;
  wbs: string | null;
  depth: number;              // summary tree indent
  type: "Summary" | "Task" | "Milestone";
  start: string;              // ISO from engine ES
  finish: string;             // ISO from engine EF
  durationDays: number;
  progress: number;           // 0..100
  isCritical: boolean;
  totalFloat: number;
  baseline?: { start: string; finish: string };
  dependencies: { id: number; fromId: number; toId: number; type: DepType; lag: number }[];
  hasChildren: boolean;
  collapsed: boolean;
}
```

Visual elements:

| Element | Rendering |
|---------|-----------|
| Row | virtualized flex row: label cell + timeline cell |
| Bar | absolutely positioned div, left/width from day index |
| Milestone | diamond (rotated square), single point, no width |
| Progress fill | inner div width = `progress%` of bar width |
| Dependency arrow | single SVG overlay; polyline from predecessor end to successor start with arrowhead |
| Baseline ghost | thin bar behind the current bar, muted color, from baseline dates |
| Today marker | vertical line across the timeline at today's day index |
| Summary bracket | thicker bar with downward end caps, no progress fill by default |

## 3. Time axis

Scales: Day, Week, Month, Quarter. Two-tier header: top tier = coarse unit (month/quarter/year), bottom tier = fine unit (day/week/date).

| Scale | Top tier | Bottom tier | Column width (px) |
|-------|----------|-------------|-------------------|
| Day | Month | day-of-month | 32 |
| Week | Month | week number | 88 |
| Month | Year | month short | 120 |
| Quarter | Year | Q1..Q4 | 200 |

Zoom: change scale, recompute column width and index mapping. Day index derives from `start_date` and the project calendar. The scale module owns:

```ts
function dayIndex(date, projectStart): number
function xOfDay(dayIndex, columnWidth): number
function daysVisible(viewportWidth, columnWidth): number
```

Only working days from the calendar produce usable columns; non-working days render shaded.

## 4. Interaction to API contracts

| Interaction | Gesture | Request | Body | On success | On error |
|-------------|---------|---------|------|-----------|----------|
| Move task | drag bar horizontally | `PATCH /tasks/:id` | `{ start: "YYYY-MM-DD" }` | reschedule, re-render | revert preview |
| Resize task | drag right edge | `PATCH /tasks/:id` | `{ durationDays: N }` | reschedule, re-render | revert preview |
| Create dependency | drag from bar handle to another bar | `POST /projects/:id/dependencies` | `{ predecessorTaskId, successorTaskId, type, lagDays }` | refetch schedule | revert arrow, toast `409` if cycle |
| Edit dependency | click arrow, pick type/lag | `PATCH /dependencies/:id` | `{ type, lagDays }` | refetch schedule | revert |
| Report progress | click bar, set percent | `PATCH /tasks/:id/progress` or `POST /tasks/:id/progress` | `{ percentComplete, reportDate }` | refetch | revert |
| Collapse summary | click chevron | local only | - | hide children | - |
| Zoom | toolbar | local only | - | recompute axis | - |

Optimistic preview: apply the change to the view-model in memory, keep the pre-change snapshot, send the request. On response, replace with server truth. On failure, restore the snapshot and show the error.

## 5. Critical-path visual treatment

- Critical bars: distinct color (e.g. red/amber), by default.
- Non-critical: neutral bar color with the float badge on hover.
- Toolbar toggle: "Critical path" on/off. When on, dim non-critical bars.
- Milestones on the critical path use the critical color.

## 6. Baseline vs current rendering

- Baseline ghost: thin, muted bar directly behind or under the current bar, from `baseline.start`/`baseline.finish`.
- Variance gap: optional shaded connector spanning current vs baseline ends.
- Toggle: show/hide baseline in the toolbar.
- No active baseline -> layer renders nothing, no error.

## 7. Milestone rendering

- Diamond at a single day. No duration width.
- If linked to a task, position from the task's `ES`.
- Completed milestones: filled diamond; pending: outlined, muted.

## 8. Rendering approach decision

Chosen: virtualized DOM rows + absolutely positioned bars + a single SVG dependency-arrow layer.

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Virtualized DOM + SVG arrows | Accessible, easy styling, CSS for progress/baseline, text selectable, unit-testable | Many DOM nodes (mitigated by windowing), arrow layer must be redrawn on scroll | Chosen |
| SVG-only | Crisp scaling, simple arrow math | Thousands of nodes choke; bad for text and inputs; accessibility hard | No |
| Canvas | Fast with huge counts | No DOM hit-testing without custom code; accessibility and inputs painful; text rendering fiddly | No |
| WebGL | Extreme scale | Overkill, no accessibility, heavy setup | No |

Performance notes:

- Windowing: render only visible rows plus a small overscan (e.g. `visibleCount + 10`).
- Drag preview via `requestAnimationFrame`; never per `mousemove` re-render of the whole grid.
- Memoized rows: `React.memo` keyed by `id + scheduleVersion` plus the fields that changed. A `scheduleVersion` bump invalidates deterministically.
- Dependency arrows: one `<svg>` spanning the timeline; recompute path strings only for rows in the viewport.
- Horizontal scroll: translate the timeline and the SVG layer together; avoid relayout.
- Avoid re-measuring column widths during scroll; measure once per scale/zoom change.

## 9. Component breakdown

| Component | Responsibility |
|-----------|----------------|
| `GanttRoot` | Fetch schedule, hold view state (scale, collapse, toggles), provide context |
| `GanttGrid` | Virtualized label column: WBS, name, indent, summary tree |
| `GanttTimeline` | Scroll container for the time area; hosts bars and layers |
| `GanttHeader` | Two-tier time header; click to jump/zoom |
| `GanttRow` | One row: label cell + timeline cell; memoized |
| `GanttBar` | Bar, progress fill, resize handle, drag move |
| `DependencyLayer` | SVG arrows for dependencies |
| `BaselineLayer` | Baseline ghost bars |
| `TodayMarker` | Vertical current-day line |
| `GanttToolbar` | Scale, critical-path toggle, baseline toggle, add task, refresh |

Data flow: `GanttRoot` -> context -> children. Children render from the view-model. Bars emit intent callbacks up to `GanttRoot`, which calls the API.

## 10. Library decision

Recommendation: build custom.

| Candidate | License | Fit with server-authoritative engine |
|-----------|---------|--------------------------------------|
| gantt-task-react | MIT | Fights the model. It owns date math and state; conflicts with server CPM and optimistic preview. |
| frappe-gantt | MIT | Lightweight, but weak on baselines, dependencies, virtualization, and summary trees. |
| dhtmlx-gantt | GPL / Commercial | Feature-rich, but heavy and its own scheduler duplicates ours. GPL may not fit. |
| Bryntum Gantt | Commercial | Excellent, costly, and still its own scheduling engine; we would pay to fight it. |

Reason to build custom: our engine is the source of truth. Third-party gantts assume they schedule. Integrating one means disabling its scheduler and bending its data model, which costs more than the parts we actually need (rows, bars, arrows, axis). Custom keeps the view thin and honest.

Fallback if timelines tighten: buy Bryntum and use it in "external scheduling" mode, feeding it our computed dates. Revisit only if custom rendering slips.

## 11. View test plan

| # | Case | Assertion |
|---|------|-----------|
| G1 | Render 5-task project | 5 rows, bars at correct x from ES |
| G2 | Milestone | diamond, zero width, correct day |
| G3 | Summary tree | children indent, collapse hides them |
| G4 | Progress fill | inner width equals percent of bar |
| G5 | Critical toggle | critical bars recolored, others dimmed |
| G6 | Baseline layer | ghost bar behind current bar |
| G7 | Today marker | vertical line at today's day index |
| G8 | Dependency arrow | polyline present between correct rows |
| G9 | Drag move | optimistic x change, PATCH sent, revert on 500 |
| G10 | Resize | optimistic width change, PATCH durationDays |
| G11 | Create dependency (cycle) | optimistic arrow, revert, toast on 409 |
| G12 | Scale switching | header tiers and column widths update |
| G13 | Windowing | 1000 rows render only viewport + overscan |
| G14 | scheduleVersion bump | memo invalidation, rows re-render with new dates |
| G15 | No active baseline | baseline layer renders nothing, no error |
| G16 | Empty project | empty state, no crash |
| G17 | Keyboard nav | focusable rows, arrow keys move focus, Enter opens task |
| G18 | Screen reader | row label announces name, dates, duration, progress |
