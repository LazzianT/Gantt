# Scheduling Engine (CPM)

Server-authoritative scheduling engine. Pure, deterministic, no I/O. Given the same project graph and the same calendar, it produces the same dates every time.

## 1. Principles

- Pure: functions take value objects, return value objects. No DB, no clock, no random.
- Deterministic: iteration order is fixed by `(sort_order ASC, task_id ASC)`.
- Working-day domain: all math is on working days, not wall-clock days.
- Inclusive semantics: a task starting Monday with duration 3 occupies Monday, Tuesday, Wednesday.
- Summary tasks roll up. They are never scheduled directly.
- Cycles are rejected, not guessed.
- The Gantt is a view of the output. It never computes.

## 2. Working-day domain

v1 uses ONE project-level calendar. `Task.calendarId?` is optional in the engine input; when absent it resolves to the project calendar. Dependency arithmetic uses the SUCCESSOR task's resolved calendar (fallback: project calendar). Per-task calendars stay a schema hook, not a v1 feature.

```ts
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun..Sat

interface WorkingCalendar {
  workingWeekdays: Set<Weekday>;              // e.g. {1,2,3,4,5}
  exceptions: Map<string, boolean>;           // 'YYYY-MM-DD' -> is_working
}
```

`exceptions` overrides `workingWeekdays` for a specific date: `false` = holiday, `true` = extra working day (e.g. a Saturday make-up day).

## 3. Value objects

```ts
type TaskType = "Summary" | "Normal" | "Milestone";
type DepType = "FS" | "SS" | "FF" | "SF";

interface Task {
  id: number;
  type: TaskType;
  durationDays: number;      // working days; 0 for Milestone
  parentId: number | null;
  sortOrder: number;
  percentComplete: number;   // 0..100
  calendarId?: number | null; // v1 hook; resolves to project calendar
}

interface Dependency {
  predecessorId: number;
  successorId: number;
  type: DepType;
  lagDays: number;           // working days; may be negative
}

interface ScheduledTask {
  id: number;
  es: string; ef: string;    // ISO dates
  ls: string; lf: string;
  totalFloat: number;        // working days; may be negative
  freeFloat: number;         // working days; never negative
  isCritical: boolean;       // totalFloat <= 0
  isViolatingConstraint: boolean; // true when totalFloat < 0
}
```

## 4. Date and duration semantics

Inclusive duration. A task with duration `D` covers `D` working-day slots including its start.

```
finishOf(start, D) = addWorkingDays(start, D - 1)
durationOf(start, finish) = workingDaysBetween(start, finish)  // inclusive
```

Milestone guard: when `durationDays == 0`, `ES == EF` and `LS == LF`. The `-(D-1)` conversion special-cases `D == 0` so no `+1` drift is introduced. This guard applies in the forward pass, the backward pass, and the float sections.

## 5. Calendar algorithms

```ts
function isWorkingDay(cal, date): boolean {
  const key = iso(date);
  if (cal.exceptions.has(key)) return cal.exceptions.get(key)!;
  return cal.workingWeekdays.has(date.getDay());
}

function nextWorkingDay(cal, date): Date {
  let d = addCalendarDays(date, 1);
  while (!isWorkingDay(cal, d)) d = addCalendarDays(d, 1);
  return d;
}

function prevWorkingDay(cal, date): Date {
  let d = addCalendarDays(date, -1);
  while (!isWorkingDay(cal, d)) d = addCalendarDays(d, -1);
  return d;
}

// n working days forward (n may be negative). n=0 returns date if working.
function addWorkingDays(cal, date, n): Date {
  let d = date;
  if (n === 0) {
    // snap to a working day forward
    while (!isWorkingDay(cal, d)) d = addCalendarDays(d, 1);
    return d;
  }
  const dir = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  // if start is not working, snap in direction first
  if (!isWorkingDay(cal, d)) d = dir > 0 ? nextWorkingDay(cal, d) : prevWorkingDay(cal, d);
  while (remaining > 0) {
    d = addCalendarDays(d, dir);
    if (isWorkingDay(cal, d)) remaining--;
  }
  return d;
}

// inclusive count of working days between two dates.
// same day on a working day => 1; same day on a non-working day => 0.
// returns a NEGATIVE count when finish < start (mirrored over the interval).
function workingDaysBetween(cal, start, finish): number {
  if (finish < start) return -workingDaysBetween(cal, finish, start);
  let count = 0;
  let d = start;
  while (d <= finish) {
    if (isWorkingDay(cal, d)) count++;
    d = addCalendarDays(d, 1);
  }
  return count;
}

// zero-based working-day index relative to the project start.
// the project start itself maps to 0.
// may be NEGATIVE for dates before projectStart (workingDaysBetween returns a negative count).
function workingDayIndex(cal, projectStart, date): number {
  return workingDaysBetween(cal, projectStart, date) - 1;
}

// inverse of workingDayIndex: index 0 -> projectStart (snapped forward to a working day).
function workingDayIndexInverse(cal, projectStart, index): Date {
  return addWorkingDays(cal, projectStart, index);
}
```

## 6. Dependency formulas

The successor's early dates are constrained by the predecessor. Because duration is inclusive, a finish-to-start link at lag 0 needs the successor to start on the working day AFTER the predecessor finishes.

Let `s` = successor, `p` = predecessor.

| Type | Constraint (working-day domain) |
|------|---------------------------------|
| FS | `ES_s >= nextWorkingDay(EF_p) + lag` |
| SS | `ES_s >= ES_p + lag` |
| FF | `EF_s >= EF_p + lag` |
| SF | `EF_s >= ES_p + lag` |

Inclusive offset rule:

- FS at lag 0: successor starts the next working day after predecessor finishes. The `+1 working day` is exactly `nextWorkingDay`.
- SS at lag 0: start together.
- FF at lag 0: finish together (so `ES_s = addWorkingDays(EF_p, -(D_s - 1))`).
- SF at lag 0: successor finishes the day predecessor starts (rare; used for just-in-time handoffs).
- Lag is applied in working days. Negative lag pulls the successor earlier, still snapped to working days.

Half-open vs inclusive note: `nextWorkingDay(EF_p)` is the `+1` inclusive offset. Do not also add another `+1`.

Dependencies with a Summary task as predecessor or successor are not allowed in v1. The API rejects them `400` at write time, before scheduling. See `database-design.md` and `architecture.md`.

## 7. CPM passes

Notation: `ES` early start, `EF` early finish, `LS` late start, `LF` late finish, `TF` total float, `FF` free float.

### 7.1 Forward pass (ES/EF)

Process tasks in topological order.

```
for task in topoOrder:
  if task.type == Milestone: D = 0 else D = task.durationDays

  if no predecessors:
    ES = project.startDate (ASAP) or constraint date
  else:
    ES = max over each predecessor p of constraintStart(p, task)   // per table above
    // for FF/SF, the constraint bounds EF; convert to an ES bound:
    //   EF-bound e  =>  ES = addWorkingDays(e, -(D-1))

  ES = snapForwardToWorkingDay(ES)
  // milestone guard: D == 0 => EF == ES; never call addWorkingDays(ES, -1)
  EF = (D == 0) ? ES : addWorkingDays(ES, D - 1)
```

### 7.2 Backward pass (LS/LF)

Process in reverse topological order. Project finish = max EF over all tasks.

```
projectFinish = max(EF over all tasks)

for task in reverse(topoOrder):
  D = (type == Milestone) ? 0 : durationDays

  if no successors:
    LF = projectFinish
  else:
    LF = +infinity
    for each successor s on the task's outgoing edge:
      // idx(x) = workingDayIndex(projectStart, x); inv(i) = workingDayIndexInverse(projectStart, i)
      switch edge.type:
        FS: LF = min(LF, inv( idx(ES_s) - 1 - lag ))
        SS: esBound = idx(ES_s) - lag
            LF = min(LF, inv( esBound + (D - 1) ))   // D == 0 => LF = inv(esBound)
        FF: LF = min(LF, inv( idx(EF_s) - lag ))      // EF_s bound; LF_pred >= EF_s - lag
        SF: efBound = idx(ES_s) - lag
            LF = inv( efBound )                        // EF_pred bound

  LF = snapBackwardToWorkingDay(LF)
  // milestone guard: D == 0 => LS == LF; no +1 drift
  LS = (D == 0) ? LF : addWorkingDays(LF, -(D - 1))

  TF = idx(LF) - idx(EF)            // = workingDaysBetween(LF, EF) - 1; same day => 0
  isCritical = (TF <= 0)
  isViolatingConstraint = (TF < 0)
```

Note: the SS/SF lines convert an ES/EF bound into the predecessor's `LF`. All four types reduce to an `LF_pred` value, then `LS_pred = LF_pred - (D-1)` (milestone: `LS = LF`).

### 7.3 Free float

Free float is how much a task can slip without moving any successor's early start. Computed per outgoing edge in working-day index space; the binding edge is the minimum. `idx(x) = workingDayIndex(projectStart, x)`.

| Dep | `FF = max(0, ...)` |
|-----|--------------------|
| FS | `idx(ES_s) - idx(EF_t) - 1 - lag` |
| SS | `idx(ES_s) - idx(ES_t) - lag` |
| FF | `idx(EF_s) - idx(EF_t) - lag` |
| SF | `idx(EF_s) - idx(ES_t) - lag` |

- Invariant: `freeFloat >= 0` always.
- Terminal task (no successors): `FF = max(0, totalFloat)`.
- Milestone guard: `D == 0` gives `ES == EF`, so `idx(EF_t)` equals `idx(ES_t)`; no `+1` drift.
- `FF` is clamped at 0 (slack cannot push successors). Negative float appears in `totalFloat`, never here.

### 7.4 Total float and criticality

- `totalFloat = workingDayIndex(LF) - workingDayIndex(EF)` (exclusive index difference). Equivalent: `totalFloat = workingDaysBetween(LF, EF) - 1`. Same-day range => `0`.
- `isCritical = totalFloat <= 0`. Negative float (deadline overrun) is allowed and flagged `isViolatingConstraint`; it is never clamped.
- Consistency: `totalFloat` equals `workingDayIndex(LS) - workingDayIndex(ES)` when inclusive math is consistent.

## 8. Summary rollup

Summary tasks are derived after the leaf passes.

```
for summary in reverse(topoOrderOfSummaries):
  ES = min(ES of children)
  EF = max(EF of children)
  duration = workingDaysBetween(ES, EF)          // derived, not stored from user
  percentComplete = weighted avg of children by duration
                   (zero-duration milestones excluded from the weight)
  LF = max(LF of children); LS = min(LS of children)
  TF = min(TF of children)
  isCritical = children.some(c => c.isCritical)
```

If a summary has no children: `ES = EF = project.startDate`, `duration = 0`.

## 9. Cycle detection

Two mechanisms.

### 9.1 Kahn topological sort

```ts
function topoSort(nodes, edges): { order: number[]; cycle: number[] | null } {
  const indeg = new Map<number, number>(nodes.map(n => [n.id, 0]));
  const adj = new Map<number, number[]>();
  for (const e of edges) {
    adj.set(e.pred, [...(adj.get(e.pred) ?? []), e.succ]);
    indeg.set(e.succ, (indeg.get(e.succ) ?? 0) + 1);
  }
  // deterministic ready-set: smallest (sortOrder, id) first
  const ready = nodes.filter(n => indeg.get(n.id) === 0)
                     .sort(bySortOrderThenId).map(n => n.id);
  const order: number[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of (adj.get(id) ?? []).sort(bySortOrderThenId)) {
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0) insertSorted(ready, next, bySortOrderThenId);
    }
  }
  if (order.length !== nodes.length) return { order, cycle: findCycleDFS(nodes, edges) };
  return { order, cycle: null };
}
```

### 9.2 DFS cycle path

When Kahn leaves nodes unsorted, DFS with a color map (white/gray/black) recovers the exact cycle path for the error payload.

```ts
function findCycleDFS(nodes, edges): number[] {
  const adj = buildAdj(edges);
  const color = new Map<number, 0|1|2>(); // white/gray/black
  const stack: number[] = [];
  let cycle: number[] = [];
  function dfs(u: number): boolean {
    color.set(u, 1); stack.push(u);
    for (const v of (adj.get(u) ?? [])) {
      if (color.get(v) === 1) {
        cycle = stack.slice(stack.indexOf(v));
        return true;
      }
      if (color.get(v) === undefined && dfs(v)) return true;
    }
    color.set(u, 2); stack.pop();
    return false;
  }
  for (const n of nodes) if (color.get(n.id) === undefined && dfs(n.id)) break;
  return cycle;
}
```

Cycle -> API responds `409` with `{ error: { code: "CONFLICT_CYCLE", details: { path } } }`.

## 10. Recalculation and transactions

- Trigger: task/dependency/calendar/progress change, or explicit `POST /projects/:id/schedule`.
- `schedule.service` loads the graph in one transaction, calls the pure engine, then persists in the same transaction.
- Transaction boundary:
  1. Lock project row (`UPDLOCK`).
  2. Load tasks, deps, calendar.
  3. Call engine.
  4. Write per-task `planned_start`, `planned_finish`.
  5. Update `projects.finish_date`, increment `schedule_version`.
  6. Commit.
- Reject cycle (`409`) before any write.
- Deterministic ordering at every step so concurrent identical requests converge.
- `schedule_version` bumps on every successful recalc. The client caches by version.

## 11. Data flow

```
  change(s) via REST
        |
        v
  schedule.service ---- load ----> repositories ---> pm.* tables
        |                                              ^
        | graph + calendar                             |
        v                                              |
   engine.compute                                      |
     | 1 topoSort (cycle? -> 409 abort)                 |
     | 2 forward pass   (ES/EF)                         |
     | 3 backward pass  (LS/LF, TF, FF)                 |
     | 4 summary rollup                                 |
     v                                                  |
   ScheduledTask[]  ------------------- persist -------+
        |
        v
   GET /projects/:id/schedule -> { data: { tasks, projectFinish, scheduleVersion } }
        |
        v
   Gantt (pure view)
```

## 12. Worked example

Calendar: Mon-Fri working, no holidays. Project start = Monday week 1.

| Task | Type | Dur | Predecessor(s) |
|------|------|-----|----------------|
| A | Normal | 3 | none |
| B | Normal | 2 | A (FS, lag 0) |
| C | Normal | 4 | A (FS, lag 0) |
| D | Normal | 3 | B (FS, lag 0) |
| E | Milestone | 0 | C (FS, lag 0), D (FS, lag 0) |

Working-day index: Mon wk1 = 0, Tue = 1, Wed = 2, Thu = 3, Fri = 4, Mon wk2 = 5, Tue = 6, Wed = 7, Thu = 8.

Forward pass:

- A: ES = day0 (Mon wk1). EF = day0 + (3-1) = day2 (Wed wk1).
- B: ES = nextWorkingDay(day2) = day3 (Thu wk1). EF = day3 + 1 = day4 (Fri wk1).
- C: ES = nextWorkingDay(day2) = day3 (Thu wk1). EF = day3 + 3 = day6 (Tue wk2).
- D: ES = nextWorkingDay(day4) = day5 (Mon wk2). EF = day5 + 2 = day7 (Wed wk2).
- E: ES = max(nextWorkingDay(day6), nextWorkingDay(day7)) = max(day7, day8) = day8 (Thu wk2). EF = day8 (milestone).

Project finish = max EF = day8 (Thu wk2).

Backward pass (LF of terminal tasks = day8):

- E: LF = day8. LS = day8. TF = 0.
- D: successor E (FS). LF = prevWorkingDay(LS_E) = prevWorkingDay(day8) = day7. LS = day7 - 2 = day5. TF = 0.
- C: successor E (FS). LF = prevWorkingDay(day8) = day7. LS = day7 - 3 = day4. TF = 1.
- B: successor D (FS). LF = prevWorkingDay(LS_D = day5) = day4. LS = day4 - 1 = day3. TF = 0.
- A: successors B (LS day3), C (LS day4). LF = min(prevWorkingDay(day3), prevWorkingDay(day4)) = min(day2, day3) = day2. LS = day2 - 2 = day0. TF = 0.

Result table:

| Task | Type | Dur | Predecessor | ES | EF | LS | LF | TF | FF | Critical |
|------|------|-----|-------------|----|----|----|----|----|----|----------|
| A | Normal | 3 | - | Mon wk1 | Wed wk1 | Mon wk1 | Wed wk1 | 0 | 0 | Yes |
| B | Normal | 2 | A FS | Thu wk1 | Fri wk1 | Thu wk1 | Fri wk1 | 0 | 0 | Yes |
| C | Normal | 4 | A FS | Thu wk1 | Tue wk2 | Fri wk1 | Wed wk2 | 1 | 1 | No |
| D | Normal | 3 | B FS | Mon wk2 | Wed wk2 | Mon wk2 | Wed wk2 | 0 | 0 | Yes |
| E | Milestone | 0 | C, D FS | Thu wk2 | Thu wk2 | Thu wk2 | Thu wk2 | 0 | 0 | Yes |

Critical path: A -> B -> D -> E. Project duration: 9 working days (day0..day8 inclusive).

## 13. Extensibility hooks (reserved, out of scope)

- Resource leveling: an engine post-pass that shifts tasks within float to resolve overallocation. Needs resource assignments as input. Not implemented in M2.
- Multiple calendars: already supported per task via `calendar_id`. Cross-calendar dependency math needs a shared day axis; reserved.
- Earned value: `task_progress` plus baseline supply PV/EV; `SPI = EV / PV`. Read-model only. Not implemented in M2.
- Constraints (`MSO`, `MFO`, `SNET`, `FNLT`): columns exist. Engine treats ASAP only in M2.

## 14. Unit test plan

| # | Case | Input | Expected |
|---|------|-------|----------|
| T1 | FS lag 0 | A dur3 -> B dur2 | B.ES = next working day after A.EF |
| T2 | FS positive lag | A dur3, lag 2 | B.ES = A.EF + 3 working days (next + 2) |
| T3 | FS negative lag | A dur3, lag -1 | B.ES overlaps A by 1 working day |
| T4 | SS lag 0 | A -> B | B.ES = A.ES |
| T5 | FF lag 0 | A -> B | B.EF = A.EF |
| T6 | SF lag 0 | A -> B | B.EF = A.ES (same day; EF_s = ES_pred) |
| T7 | Milestone | dur 0 | EF = ES; critical if no float |
| T8 | Weekend spanning | dur 5 across Sat/Sun | EF lands Friday, not Sunday |
| T9 | Holiday exception | holiday mid-task | duration extends past the holiday |
| T10 | Extra working day | Saturday marked working | duration shrinks vs default |
| T11 | Summary rollup | children A,B | summary ES = min, EF = max, duration derived |
| T12 | Weighted progress | children dur 3 and 1 at 100%/0% | summary = 75% |
| T13 | Multiple roots | two independent chains | both start at project start |
| T14 | Multiple ends | two terminal tasks | project finish = max EF |
| T15 | Cycle | A->B->C->A | `409`, cycle path recovered, no writes |
| T16 | Self-dependency | A->A | rejected at write (unique/check) |
| T17 | Critical path | worked example above | A,B,D,E flagged critical |
| T18 | Determinism | same input twice | identical output byte-for-byte |
| T19 | Negative float | hard constraint conflicts | TF < 0 surfaced, not clamped |
| T20 | Float equality | any graph | `TF == LS-ES == LF-EF` in working days |
| T21 | Empty project | no tasks | finish = start, no crash |
| T22 | Milestone as predecessor | milestone -> task FS | task starts next working day |
