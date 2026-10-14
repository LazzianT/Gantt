# Database Design: `pm` schema

Database `DB_DATABASE` (`.env`; `CORP_DB` by default), dedicated schema `pm`. HRIS tables (`dbo.hris_Employee`) are never modified and never referenced by a foreign key. Employee identity is stored as `employee_nip NVARCHAR(...)` with copy-on-write display snapshots.

## 1. Conventions

- PK: `INT IDENTITY` (or `BIGINT` for logs/append-heavy).
- Timestamps: `DATETIME2(3)` default `SYSUTCDATETIME()`.
- Dates that are calendar days (not instants): `DATE`.
- Strings: `NVARCHAR`. Business codes: `VARCHAR`.
- Soft delete via `is_active BIT` where history matters. No hard delete of tasks with logs.
- Every table in `pm`. No cross-database FK. No FK to `hris_Employee`.
- Index foreign keys and frequent filters (`project_id`, `calendar_id`, `baseline_id`, `report_date`).

## 2. Entity relationship diagram (ASCII)

```
work_calendars 1---* calendar_working_days
      |        1---* calendar_exceptions
      |
      | (default_calendar_id / task.calendar_id / resource.calendar_id)
      v
   projects 1---* project_members
      |     1---* project_resources
      |     1---* project_tasks 1---* task_dependencies (pred/succ)
      |      |           |   \---* task_resources
      |      |           \------* task_progress
      |      |           \------* project_baseline_tasks
      |     1---* project_milestones (optional task_id link)
      |     1---* project_baselines 1---* project_baseline_tasks
      \     1---* project_activity_logs

app_users (reserved; not used by current NIP+DOB login — see authentication.md)

project_tasks.parent_task_id --> project_tasks.task_id (self, summary tree)
task_dependencies.predecessor_task_id --> project_tasks.task_id
task_dependencies.successor_task_id   --> project_tasks.task_id
task_resources.task_id   --> project_tasks.task_id
task_resources.resource_id --> project_resources.resource_id
project_baseline_tasks.task_id --> project_tasks.task_id (nullable if task removed)
```

## 3. Tables

### 3.1 `pm.work_calendars`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `calendar_id` | INT IDENTITY | NO | PK | |
| `name` | NVARCHAR(100) | NO | | |
| `timezone` | NVARCHAR(64) | NO | | default `Asia/Jakarta` |
| `hours_per_day` | DECIMAL(4,2) | NO | | default 8; capacity basis |
| `description` | NVARCHAR(500) | YES | | |
| `is_default` | BIT | NO | | default 0; one default per install |
| `is_active` | BIT | NO | | default 1 |
| `created_at` | DATETIME2(3) | NO | | default SYSUTCDATETIME() |
| `updated_at` | DATETIME2(3) | NO | | |

Index: `UX_work_calendars_default` filtered unique on `is_default` where `is_default = 1`.

### 3.2 `pm.calendar_working_days`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `working_day_id` | INT IDENTITY | NO | PK | |
| `calendar_id` | INT | NO | FK -> work_calendars | ON DELETE CASCADE |
| `day_of_week` | TINYINT | NO | | 0 = Sunday .. 6 = Saturday |
| `is_working` | BIT | NO | | default 1 |

Constraints: `CHECK (day_of_week BETWEEN 0 AND 6)`. Unique `(calendar_id, day_of_week)`.

### 3.3 `pm.calendar_exceptions`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `exception_id` | INT IDENTITY | NO | PK | |
| `calendar_id` | INT | NO | FK -> work_calendars | ON DELETE CASCADE |
| `exception_date` | DATE | NO | | |
| `is_working` | BIT | NO | | 0 = holiday, 1 = extra working day |
| `name` | NVARCHAR(100) | YES | | e.g. "Idul Fitri" |

Unique `(calendar_id, exception_date)`.

### 3.4 `pm.projects`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `project_id` | INT IDENTITY | NO | PK | |
| `project_code` | VARCHAR(32) | NO | UNIQUE | |
| `name` | NVARCHAR(200) | NO | | |
| `description` | NVARCHAR(MAX) | YES | | |
| `status` | VARCHAR(20) | NO | | default `Planning` |
| `start_date` | DATE | NO | | project anchor |
| `finish_date` | DATE | YES | | computed, persisted |
| `default_calendar_id` | INT | YES | FK -> work_calendars | |
| `owner_nip` | NVARCHAR(20) | NO | | employee id, no FK |
| `schedule_version` | INT | NO | | default 0; bump on recalc |
| `is_active` | BIT | NO | | default 1 |
| `created_by` | NVARCHAR(20) | YES | | nip |
| `created_at` | DATETIME2(3) | NO | | |
| `updated_at` | DATETIME2(3) | NO | | |

Constraints:

- `CHECK (status IN ('Planning','Active','OnHold','Completed','Cancelled'))`.
- `CHECK (finish_date IS NULL OR finish_date >= start_date)`.

### 3.5 `pm.project_members`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `member_id` | INT IDENTITY | NO | PK | |
| `project_id` | INT | NO | FK -> projects | ON DELETE CASCADE |
| `employee_nip` | NVARCHAR(20) | NO | | no FK to HRIS |
| `member_name` | NVARCHAR(150) | NO | | snapshot, copy-on-write |
| `department_name` | NVARCHAR(150) | YES | | snapshot |
| `position_name` | NVARCHAR(150) | YES | | snapshot |
| `email` | NVARCHAR(150) | YES | | snapshot |
| `role` | VARCHAR(30) | NO | | e.g. PM, Member, Viewer |
| `allocation_pct` | DECIMAL(5,2) | YES | | 0..100 |
| `snapshot_at` | DATETIME2(3) | NO | | when snapshot taken |
| `is_active` | BIT | NO | | default 1 |
| `created_at` | DATETIME2(3) | NO | | |

Constraints: `CHECK (allocation_pct IS NULL OR allocation_pct BETWEEN 0 AND 100)`. Unique `(project_id, employee_nip)`.

### 3.6 `pm.project_resources`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `resource_id` | INT IDENTITY | NO | PK | |
| `project_id` | INT | NO | FK -> projects | ON DELETE CASCADE |
| `employee_nip` | NVARCHAR(20) | YES | | if labor tied to employee |
| `resource_name` | NVARCHAR(200) | NO | | |
| `resource_type` | VARCHAR(20) | NO | | Labor / Material / Cost |
| `max_units` | DECIMAL(9,2) | NO | | default 100 |
| `standard_rate` | DECIMAL(19,4) | YES | | |
| `calendar_id` | INT | YES | FK -> work_calendars | |
| `employee_name` | NVARCHAR(200) | YES | | snapshot, copy-on-write |
| `department_name` | NVARCHAR(200) | YES | | snapshot |
| `position_name` | NVARCHAR(200) | YES | | snapshot |
| `email` | NVARCHAR(200) | YES | | snapshot |
| `snapshot_at` | DATETIME2(3) | YES | | when snapshot taken |
| `is_active` | BIT | NO | | default 1 |
| `created_at` | DATETIME2(3) | NO | | |

Constraints: `CHECK (resource_type IN ('Labor','Material','Cost'))`. `CHECK (max_units >= 0)`.

### 3.7 `pm.project_tasks`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `task_id` | INT IDENTITY | NO | PK | |
| `project_id` | INT | NO | FK -> projects | ON DELETE CASCADE |
| `parent_task_id` | INT | YES | FK -> project_tasks | summary tree |
| `wbs_code` | VARCHAR(50) | YES | | e.g. `1.2.3` |
| `task_type` | VARCHAR(10) | NO | | Summary / Normal / Milestone |
| `name` | NVARCHAR(200) | NO | | |
| `calendar_id` | INT | YES | FK -> work_calendars | fallback to project default |
| `planned_start` | DATE | YES | | computed/persisted |
| `planned_finish` | DATE | YES | | computed/persisted |
| `duration_days` | INT | YES | | working days |
| `es_date` | DATE | YES | | persisted early start |
| `ef_date` | DATE | YES | | persisted early finish |
| `ls_date` | DATE | YES | | persisted late start |
| `lf_date` | DATE | YES | | persisted late finish |
| `total_float_days` | DECIMAL(9,2) | YES | | working days; may be negative |
| `free_float_days` | DECIMAL(9,2) | YES | | working days; never negative |
| `is_critical` | BIT | NO | | default 0 |
| `schedule_version` | INT | NO | | default 0; equals projects.schedule_version after write |
| `actual_start` | DATE | YES | | |
| `actual_finish` | DATE | YES | | |
| `percent_complete` | DECIMAL(5,2) | NO | | default 0 |
| `sort_order` | INT | NO | | default 0; ties broken by task_id |
| `constraint_type` | VARCHAR(10) | YES | | ASAP / MSO / MFO / SNET / FNLT |
| `constraint_date` | DATE | YES | | |
| `is_active` | BIT | NO | | default 1 |
| `created_at` | DATETIME2(3) | NO | | |
| `updated_at` | DATETIME2(3) | NO | | |

Constraints:

- `CHECK (task_type IN ('Summary','Normal','Milestone'))`.
- `CHECK (percent_complete BETWEEN 0 AND 100)`.
- `CHECK (duration_days IS NULL OR duration_days >= 0)`.
- `CHECK (task_type <> 'Milestone' OR duration_days = 0)`.
- `CHECK (parent_task_id IS NULL OR parent_task_id <> task_id)`.
- `CHECK (constraint_type IS NULL OR constraint_type IN ('ASAP','MSO','MFO','SNET','FNLT'))`.

Indexes: `(project_id, sort_order)`, `(parent_task_id)`, `(project_id, is_active)`.

The scheduling engine writes `es_date`, `ef_date`, `ls_date`, `lf_date`, `total_float_days`, `free_float_days`, `is_critical` and stamps `schedule_version`. Reads may recompute when a task's `schedule_version` is behind `projects.schedule_version`.

### 3.8 `pm.task_dependencies`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `dependency_id` | INT IDENTITY | NO | PK | |
| `project_id` | INT | NO | FK -> projects | denormalized for fast load |
| `predecessor_task_id` | INT | NO | FK -> project_tasks | ON DELETE CASCADE |
| `successor_task_id` | INT | NO | FK -> project_tasks | ON DELETE CASCADE |
| `dep_type` | CHAR(2) | NO | | FS / SS / FF / SF |
| `lag_days` | INT | NO | | default 0; working days; negative allowed |
| `is_active` | BIT | NO | | default 1; soft delete |
| `created_at` | DATETIME2(3) | NO | | |

Constraints:

- `CHECK (dep_type IN ('FS','SS','FF','SF'))`.
- `CHECK (predecessor_task_id <> successor_task_id)`.
- Unique `(predecessor_task_id, successor_task_id, dep_type)`.

Indexes: `(successor_task_id)`, `(predecessor_task_id)`, `(project_id)`.

### 3.9 `pm.task_resources`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `assignment_id` | INT IDENTITY | NO | PK | |
| `task_id` | INT | NO | FK -> project_tasks | ON DELETE CASCADE |
| `resource_id` | INT | NO | FK -> project_resources | |
| `units` | DECIMAL(9,3) | NO | | default 100 |
| `planned_cost` | DECIMAL(19,4) | YES | | |
| `created_at` | DATETIME2(3) | NO | | |

Unique `(task_id, resource_id)`. `CHECK (units >= 0)`.

### 3.10 `pm.project_milestones`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `milestone_id` | INT IDENTITY | NO | PK | |
| `project_id` | INT | NO | FK -> projects | ON DELETE CASCADE |
| `task_id` | INT | YES | FK -> project_tasks | optional link to a milestone task |
| `name` | NVARCHAR(200) | NO | | |
| `milestone_date` | DATE | YES | | computed when task-linked |
| `is_completed` | BIT | NO | | default 0 |
| `completed_at` | DATETIME2(3) | YES | | |
| `created_at` | DATETIME2(3) | NO | | |

Indexes: `(project_id, milestone_date)`.

### 3.11 `pm.project_baselines`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `baseline_id` | INT IDENTITY | NO | PK | |
| `project_id` | INT | NO | FK -> projects | ON DELETE CASCADE |
| `name` | NVARCHAR(100) | NO | | |
| `version` | INT | NO | | |
| `baseline_date` | DATE | NO | | capture date |
| `is_active` | BIT | NO | | default 0; one active per project |
| `created_by` | NVARCHAR(20) | YES | | nip |
| `created_at` | DATETIME2(3) | NO | | |

Unique `(project_id, version)`. Filtered unique on `(project_id)` where `is_active = 1`.

### 3.12 `pm.project_baseline_tasks`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `baseline_task_id` | BIGINT IDENTITY | NO | PK | |
| `baseline_id` | INT | NO | FK -> project_baselines | ON DELETE CASCADE |
| `task_id` | INT | YES | FK -> project_tasks | nullable if task later removed |
| `task_name` | NVARCHAR(200) | NO | | snapshot |
| `wbs_code` | VARCHAR(50) | YES | | snapshot |
| `planned_start` | DATE | YES | | snapshot |
| `planned_finish` | DATE | YES | | snapshot |
| `duration_days` | INT | YES | | snapshot |
| `percent_complete` | DECIMAL(5,2) | YES | | snapshot |
| `planned_cost` | DECIMAL(19,4) | YES | | snapshot |

Indexes: `(baseline_id)`, `(baseline_id, task_id)`.

### 3.13 `pm.task_progress`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `progress_id` | BIGINT IDENTITY | NO | PK | |
| `task_id` | INT | NO | FK -> project_tasks | ON DELETE CASCADE |
| `report_date` | DATE | NO | | |
| `percent_complete` | DECIMAL(5,2) | NO | | |
| `actual_start` | DATE | YES | | |
| `actual_finish` | DATE | YES | | |
| `remaining_duration_days` | INT | YES | | |
| `note` | NVARCHAR(500) | YES | | |
| `reported_by` | NVARCHAR(20) | YES | | nip |
| `created_at` | DATETIME2(3) | NO | | |

Unique `(task_id, report_date)`. `CHECK (percent_complete BETWEEN 0 AND 100)`.

### 3.14 `pm.project_activity_logs`

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `log_id` | BIGINT IDENTITY | NO | PK | |
| `project_id` | INT | NO | FK -> projects | ON DELETE CASCADE |
| `entity_type` | VARCHAR(50) | NO | | task / dependency / baseline / member |
| `entity_id` | VARCHAR(50) | YES | | string form of id |
| `action` | VARCHAR(20) | NO | | create / update / delete / schedule |
| `actor_nip` | NVARCHAR(20) | YES | | |
| `changes` | NVARCHAR(MAX) | YES | | JSON diff |
| `created_at` | DATETIME2(3) | NO | | default SYSUTCDATETIME() |

Constraints: `CHECK (action IN ('create','update','delete','schedule'))`. Index `(project_id, created_at DESC)`.

### 3.15 `pm.app_users` — reserved / unused

Not used by the current login. Authentication is **NIP + date of birth validated against the read-only HRIS directory** (`dbo.hris_Employee`, database `DB_DATABASE` from `.env`) via `EmployeeProvider`; no password is checked. This table and its email/password path are retained for a possible future local-identity option. See `authentication.md`.

| Column | Type | Null | Key | Notes |
|--------|------|------|-----|-------|
| `user_id` | INT IDENTITY | NO | PK | |
| `name` | NVARCHAR(200) | NO | | |
| `email` | NVARCHAR(200) | NO | UNIQUE | login identity (unused by current login) |
| `password_hash` | NVARCHAR(255) | NO | | bcrypt (unused by current login) |
| `role` | NVARCHAR(20) | NO | | |
| `is_active` | BIT | NO | | default 1 |
| `created_at` | DATETIME2(3) | NO | | |
| `updated_at` | DATETIME2(3) | NO | | |

Constraints: `CHECK (role IN ('admin','manager','member','viewer'))`.

## 4. Migration file list (`sql/`)

| File | Creates |
|------|---------|
| `001_schema_and_app_users.sql` | `CREATE SCHEMA pm` (+ guard) + `app_users` |
| `002_calendars.sql` | `work_calendars` + `calendar_working_days` + `calendar_exceptions` |
| `003_projects.sql` | `projects` + `project_members` |
| `004_project_resources.sql` | `project_resources` |
| `005_project_tasks.sql` | `project_tasks` + tree index |
| `006_task_dependencies.sql` | `task_dependencies` |
| `007_task_resources.sql` | `task_resources` |
| `008_milestones.sql` | `project_milestones` |
| `009_baselines.sql` | `project_baselines` + `project_baseline_tasks` |
| `010_progress.sql` | `task_progress` |
| `011_activity_logs.sql` | `project_activity_logs` |
| `012_indexes.sql` | secondary indexes |
| `013_seed_default_calendar.sql` | default calendar seed (working week + `hours_per_day`) |
| `014_project_task_pic.sql` | `project_tasks.pic_nip` / `pic_name` |
| `015_task_evidence.sql` | `task_evidence` (note and/or file per task) |
| `016_task_actual_dates.sql` | `project_tasks.actual_start` / `actual_finish` (as-built) |
| `017_actual_finish_approval.sql` | manager review columns + index on `project_tasks` |

Idempotent style: `IF OBJECT_ID('pm.x','U') IS NULL BEGIN ... END` (later files use `IF COL_LENGTH(...) IS NULL` for `ALTER TABLE`). Forward-only. No destructive `DROP` in migrations.

## 5. Data integrity rules

| Rule | Enforced by |
|------|-------------|
| Task belongs to exactly one project | FK + NOT NULL |
| Dependency endpoints are tasks in the same project | service check + `task_dependencies.project_id` |
| No self-dependency | `CHECK (predecessor_task_id <> successor_task_id)` |
| No duplicate dependency type between same pair | unique index |
| No dependency cycles | service + engine Kahn/DFS; reject 409 |
| Milestone has zero duration | `CHECK (task_type <> 'Milestone' OR duration_days = 0)` |
| Summary duration derived, not user-set | service rule + engine rollup |
| Percent in 0..100 | `CHECK` |
| Employee id stored as full NIP, no FK | column design + adapter rule |
| Snapshot fields not silently overwritten by HRIS | copy-on-write service logic |
| Summary task is never a dependency endpoint | service check -> `400` |
| Soft-deleted dependency excluded from graph | `is_active = 1` filter |
| Schedule fields consistent per version | engine writes; `schedule_version` match |

## 6. Baseline and progress variance support

- Baseline capture copies current `planned_start`, `planned_finish`, `duration_days`, `percent_complete`, `planned_cost` into `project_baseline_tasks`.
- One active baseline per project (`is_active` filtered unique). Activation deactivates siblings in one transaction.
- Variance is computed at read time, not stored:
  - `start_variance = current.planned_start - baseline.planned_start` (working days)
  - `finish_variance = current.planned_finish - baseline.planned_finish`
  - `duration_variance = current.duration_days - baseline.duration_days`
  - `schedule_performance_ratio` hook reserved (earned value, out of scope).
- `task_progress` keeps the reported history; the latest by `report_date` is authoritative for progress display.

## 7. Scheduling constraints (DAG)

- The dependency graph per project must be a DAG. Nodes = active tasks of the project. Edges = active dependencies.
- Cycle detection on two layers:
  1. Write time: creating/editing a dependency runs a reachability check. If it closes a cycle, reject `409 CONFLICT_CYCLE`.
  2. Schedule time: full Kahn topological sort; leftover nodes indicate a cycle. DFS recovers the exact path for the error payload.
- Deterministic ordering: Kahn ready-set drained in `(sort_order ASC, task_id ASC)`. Same data set yields the same order and the same dates.
- Summary tasks are not scheduled independently. They roll up from children (min ES, max EF). Summary tasks are never dependency endpoints; the API rejects such a dependency `400` at write time (v1).
- Orphan tasks (no predecessors) get `ES = project.start_date` (ASAP) or the constraint date.

## 8. Derived read-models (not stored)

No new tables. Computed at read time.

### 8.1 Workload

- Daily demand hours for a resource = `hours_per_day * (allocation_percent / 100)`, where `allocation_percent := task_resources.units` (percent; default 100). Source: `task_resources` joined to `project_tasks`, spread over the task's working-day span on the task's resolved calendar.
- Capacity = `project_resources.max_units` (default 1) * calendar `hours_per_day`.
- Utilization = demand / capacity. Classify `Underallocated` (< 0.8) / `Balanced` (0.8–1.0) / `Overallocated` (> 1.0); thresholds configurable.
- Cross-project aggregate by `employee_nip` over overlapping ranges.
- Endpoints: `GET /projects/:id/workload?from&to`, `GET /resources/:employee_nip/workload?from&to`.

### 8.2 Dashboard

- Portfolio and project dashboards are derived read-models, never stored.
- `GET /portfolio`: per-project health, weighted progress, dates, team size, open/overdue/critical counts; filter All / Active / Planning / On Hold / Completed / At Risk / Delayed.
- `GET /projects/:id/dashboard`: weighted progress, schedule/baseline variance, upcoming milestones, overdue tasks, critical tasks, workload summary, recent activity.

### 8.3 Calendar scope (v1)

- One project-level calendar in v1. `project_tasks.calendar_id` is nullable; null resolves to the project `default_calendar_id`.
- The engine takes an optional `Task.calendarId`; dependency arithmetic uses the successor's resolved calendar. Per-task calendars stay a schema hook, not a v1 feature.
