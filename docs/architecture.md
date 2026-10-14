# Architecture

Standalone Enterprise Project Management app. Server-authoritative CPM scheduling, Gantt as a pure view, HRIS-backed people directory behind an adapter.

## 1. Layered architecture

| Layer | Folder | Responsibility | May call |
|-------|--------|----------------|----------|
| Routes | `backend/src/routes` | Path binding, middleware wiring | Controllers |
| Controllers | `backend/src/controllers` | Parse/validate request, shape envelope | Services |
| Services | `backend/src/services` | Business rules, orchestration, transactions | Repositories, Engine |
| Engine | `backend/src/engine` | Pure CPM + calendar math. No I/O. | Nothing (pure) |
| Repositories | `backend/src/repositories` | Parameterized SQL, row <-> entity mapping | `db` |
| DB | `backend/src/db` | Pool, query helpers (`@pm/db`) | SQL Server |
| Adapter | `backend/src/integrations/hris` | HRIS access behind `EmployeeProvider` | HRIS_PORTAL pool |

Rules: no layer skips down. Controllers never touch repositories. Services never build SQL. The engine never performs I/O.

## 2. Backend folder tree

```
gantt/backend/
  src/
    index.ts                     # bootstrap, listen
    app.ts                       # express app, middleware, routes
    config/
      env.ts                     # typed env access
      database.ts                # mssql pool (pm + HRIS read)
    db/
      pool.ts                    # { getPool, query, queryOne, execute, sql }
      transaction.ts             # withTransaction helper
    middleware/
      auth.ts                    # JWT verify -> req.user
      error.ts                   # error -> {error} envelope
      validate.ts                # zod request validation
      requestId.ts
    routes/
      index.ts
      projects.routes.ts
      tasks.routes.ts
      dependencies.routes.ts
      resources.routes.ts
      members.routes.ts
      calendars.routes.ts
      baselines.routes.ts
      milestones.routes.ts
      progress.routes.ts
      schedule.routes.ts
      employees.routes.ts
    controllers/
      project.controller.ts
      task.controller.ts
      dependency.controller.ts
      resource.controller.ts
      member.controller.ts
      calendar.controller.ts
      baseline.controller.ts
      milestone.controller.ts
      progress.controller.ts
      schedule.controller.ts
      employee.controller.ts
    services/
      project.service.ts
      task.service.ts
      dependency.service.ts
      resource.service.ts
      member.service.ts
      calendar.service.ts
      baseline.service.ts
      milestone.service.ts
      progress.service.ts
      schedule.service.ts        # loads graph, calls engine, persists
    engine/
      types.ts                   # Task, Dependency, WorkingCalendar
      calendar.ts                # isWorkingDay/nextWorkingDay/addWorkingDays/workingDaysBetween
      cpm.ts                     # forward, backward, floats, rollup
      topoSort.ts                # Kahn + DFS cycle path
      index.ts
    integrations/
      hris/
        employee-provider.ts     # EmployeeProvider interface
        hris-employee.adapter.ts # HrisEmployeeAdapter implements it
        employee-dto.ts          # EmployeeDTO + normalizers
        cache.ts                 # TTL cache
      hris-pool.ts               # wraps HRIS_PORTAL db pool.js shape
    utils/
      envelope.ts                # ok(), fail()
      errors.ts                  # AppError, NotFound, Conflict, Validation
      logger.ts
  sql/
    001_schema_and_app_users.sql
    ... 013_seed_default_calendar.sql
  package.json
  tsconfig.json
  .env.example
```

## 3. Frontend folder tree

```
gantt/frontend/
  src/
    main.tsx
    App.tsx
    api/
      client.ts                  # fetch wrapper, attaches JWT, unwraps {data}/{error}
      projects.api.ts
      tasks.api.ts
      dependencies.api.ts
      schedule.api.ts
      employees.api.ts
    auth/
      AuthProvider.tsx
      useAuth.ts
      tokenStore.ts
    features/
      projects/
      gantt/
        GanttRoot.tsx
        GanttGrid.tsx
        GanttTimeline.tsx
        GanttHeader.tsx
        GanttRow.tsx
        GanttBar.tsx
        DependencyLayer.tsx
        BaselineLayer.tsx
        TodayMarker.tsx
        GanttToolbar.tsx
        gantt.types.ts
        gantt.scale.ts           # day/week/month/quarter math
    components/                  # shared UI
    hooks/
    pages/
      LoginPage.tsx
      ProjectListPage.tsx
      ProjectDetailPage.tsx
    store/                       # schedule cache keyed by scheduleVersion
    styles/
    index.css
  tailwind.config.ts
  vite.config.ts
  package.json
  tsconfig.json
  .env.example
```

## 4. REST API resource map

All paths under `/api/v1`. Envelope: success `{data}` (200/201), failure `{error}`.

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/auth/login` | Issue JWT from `{ nip, birthDate }` (HRIS-backed) | No |
| GET | `/auth/me` | Current user from token | Yes |
| GET | `/employees/search?q=&limit=` | Employee directory (adapter) | Yes |
| GET | `/employees/:nip` | One employee (adapter) | Yes |
| GET | `/employees/active` | Active list, paginated | Yes |
| GET | `/calendars` | List calendars | Yes |
| POST | `/calendars` | Create calendar | Yes |
| GET | `/calendars/:id` | Calendar detail + exceptions | Yes |
| PATCH | `/calendars/:id` | Update calendar | Yes |
| GET | `/projects` | List projects | Yes |
| POST | `/projects` | Create project | Yes |
| GET | `/projects/:id` | Project detail | Yes |
| PATCH | `/projects/:id` | Update project | Yes |
| DELETE | `/projects/:id` | Soft delete | Yes |
| GET | `/projects/:id/members` | List members | Yes |
| POST | `/projects/:id/members` | Add member (snapshot) | Yes |
| DELETE | `/projects/:id/members/:nip` | Remove member | Yes |
| GET | `/projects/:id/resources` | List resources | Yes |
| POST | `/projects/:id/resources` | Add resource | Yes |
| PATCH | `/resources/:id` | Update resource | Yes |
| DELETE | `/resources/:id` | Soft delete resource | Yes |
| GET | `/projects/:id/tasks` | List tasks (ordered) | Yes |
| POST | `/projects/:id/tasks` | Create task | Yes |
| GET | `/tasks/:id` | Task detail | Yes |
| PATCH | `/tasks/:id` | Update task (start/duration/name/type) | Yes |
| DELETE | `/tasks/:id` | Soft delete task | Yes |
| GET | `/projects/:id/dependencies` | List dependencies | Yes |
| POST | `/projects/:id/dependencies` | Create dependency | Yes |
| PATCH | `/dependencies/:id` | Edit type/lag | Yes |
| DELETE | `/dependencies/:id` | Delete dependency | Yes |
| GET | `/projects/:id/milestones` | List milestones | Yes |
| POST | `/projects/:id/milestones` | Create milestone | Yes |
| PATCH | `/milestones/:id` | Update milestone | Yes |
| GET | `/projects/:id/baselines` | List baselines | Yes |
| POST | `/projects/:id/baselines` | Capture baseline | Yes |
| GET | `/baselines/:id` | Baseline + tasks | Yes |
| POST | `/baselines/:id/activate` | Set active baseline | Yes |
| GET | `/projects/:id/progress` | Progress history | Yes |
| POST | `/tasks/:id/progress` | Report progress | Yes |
| GET | `/dashboard/my-tasks` | My Tasks list (tasks where `pic_nip` = session NIP) + summary | Yes |
| PATCH | `/tasks/:id/completion` | My Tasks: mark done with `actual_finish`, or reopen | PIC only (`admin`/`manager` bypass) |
| POST | `/tasks/:id/actual-finish/review` | Manager decision on a submitted finish date | `admin`/`manager` |
| GET | `/projects/:projectId/actual-finish-reviews` | Manager queue of submitted finish dates | `admin`/`manager` |
| GET | `/tasks/:id/evidence` | Task evidence trail | Project member |
| POST | `/tasks/:id/evidence` | Add evidence (note and/or file, multipart); empty = no-op `200` | PIC only |
| GET | `/evidence/:id/file` | Download evidence file (authenticated) | Project member |
| DELETE | `/evidence/:id` | Delete own evidence | Uploader only |
| POST | `/projects/:id/schedule` | Recalculate (server CPM) | Yes |
| GET | `/projects/:id/schedule` | Read computed schedule | Yes |
| GET | `/portfolio` | Portfolio read-model (health, progress, counts) | Yes |
| GET | `/projects/:id/dashboard` | Project dashboard read-model | Yes |
| GET | `/projects/:id/workload?from=&to=` | Project workload demand vs capacity | Yes |
| GET | `/resources/:employee_nip/workload?from=&to=` | Cross-project workload by employee | Yes |

## 5. JWT auth

- Login is **NIP + date of birth (DOB)**. Credentials validate against the read-only HRIS directory (`dbo.hris_Employee`, database `DB_DATABASE` from `.env`) through `EmployeeProvider` / `HrisEmployeeAdapter` (`getEmployee(nip)` + active check + date-only `BirthDate` compare). No local password store.
- Endpoint: `POST /auth/login { nip, birthDate }`. Success: `201/200 { data: { token, user } }`. Failure `401` with a uniform message.
- Token payload `{ sub: nip, name, role }`, signed HS256 with `JWT_SECRET` (env). TTL from `JWT_EXPIRES_IN` (env, default `8h`).
- Role resolved from env allowlists at login: `AUTH_ADMIN_NIPS` → `admin`, `AUTH_MANAGER_NIPS` → `manager`, else `member`.
- Middleware verifies signature and expiry, attaches `req.user`. Missing/invalid -> `401` with `{error}`. `requireRole(...)` guards routes.
- `pm.app_users` email/password login is **reserved / unused** by the current app (kept for a future local-identity path).
- No secrets in source. Tokens sent as `Authorization: Bearer <token>`.
- Dev-only demo fallback (`AUTH_DEMO_ENABLED`) grants a session when HRIS is unreachable; it fails closed in production.
- Full detail, demo credentials, session storage, limitations, and hardening checklist: `authentication.md`.

## 6. EmployeeProvider boundary

Only `HrisEmployeeAdapter` touches HRIS SQL. Everything above depends on the interface.

```
+----------------------+     +--------------------+     +-----------------------+
|   Services /         |     |  EmployeeProvider  |     |  HrisEmployeeAdapter  |
|   Controllers        | --> |  (interface)       | <-- |  implements           |
|  (project mgmt)      |     |  getEmployees      |     |  owns HRIS SQL        |
|                      |     |  getEmployee       |     |  normalizes -> DTO    |
|                      |     |  searchEmployees   |     +-----------+-----------+
|                      |     |  getActiveEmployees|                 |
+----------------------+     +--------------------+                 |
                                                                   v
                                                   +----------------------------------+
                                                   |  <DB>.dbo.hris_Employee          |
                                                   |  + MASCOSTCENTER + career/job    |
                                                   |  (READ ONLY)                     |
                                                   +----------------------------------+
```

Details in `employee-integration.md`.

## 7. Scheduling boundary

```
REST /schedule  ->  schedule.service  ->  engine (pure CPM)  ->  persist computed dates
                         |                       ^
                         |  reads projects, tasks, deps, calendars
                         v
                    repositories  ->  pm schema

Engine input:  tasks[], dependencies[], workingCalendar
Engine output: per-task { ES, EF, LS, LF, totalFloat, freeFloat, isCritical }, project finish
Engine does:   no DB, no clock, no randomness. Same input -> same output.
```

Cycle detected in graph -> `409 Conflict` with `{error}` and the offending path. See `scheduling-engine.md`.

## 8. Gantt as a pure view

- The Gantt component reads a computed schedule. It never computes dates or floats.
- Edits (drag move, resize, dependency draw, progress) send a mutation, then re-fetch the schedule.
- Optimistic preview lives in the view and reverts on error response.
- The view never writes `planned_start`/`planned_finish` directly; it PATCHes intent (start or durationDays) and lets the server reschedule.
- Drag move sets a Start-No-Earlier-Than (SNET) constraint (manual anchor), not a hard date. The server recalculates; a conflicting constraint is reported, never committed locally.

See `gantt-engine.md`.

## 9. Module boundaries

| Module | Owns | Never does |
|--------|------|-----------|
| Projects | project CRUD, status | scheduling math |
| Tasks | task CRUD, ordering, summary integrity | dependency math |
| Dependencies | edge CRUD, cycle guard at write time | date computation |
| Calendars | working day definitions | schedule |
| Baselines | snapshot capture and diff inputs | schedule |
| Progress | actuals and percent | schedule |
| Schedule | orchestration, engine call, persistence | UI |
| Employees | adapter only | project data |
| Workload | derived demand/capacity read-model | schedule |
| Dashboard | derived portfolio/project read-models | schedule |
| Auth | NIP+DOB check via `EmployeeProvider`, JWT issue | project data |
| Engine | pure CPM | I/O |

Dependencies with a Summary task as predecessor or successor are rejected `400` at write time in v1.

## 10. Response envelope and HTTP codes

Success:

```json
{ "data": { } }
```

Error:

```json
{ "error": { "code": "CONFLICT_CYCLE", "message": "Dependency cycle detected", "details": { "path": [12, 14, 12] } } }
```

| Code | When |
|------|------|
| 200 | Read/update success |
| 201 | Create success |
| 204 | Delete success |
| 400 | Validation failure |
| 401 | Missing/invalid/expired JWT |
| 403 | Authenticated, not allowed |
| 404 | Resource not found |
| 409 | Cycle, duplicate key, version conflict |
| 422 | Semantically invalid (e.g. milestone with duration > 0) |
| 500 | Unhandled |
| 503 | HRIS unavailable with no cache fallback |

## 11. Environment variables

| Var | Used by | Example | Notes |
|-----|---------|---------|-------|
| `NODE_ENV` | backend | `development` | |
| `PORT` | backend | `4000` | |
| `DB_SERVER` | backend | `DB_HOST` | HRIS host |
| `DB_DATABASE` | backend | `CORP_DB` | qualifies every HRIS statement; also holds `pm` |
| `DB_USER` | backend | `pm_app` | least privilege |
| `DB_PASSWORD` | backend | (secret) | never commit |
| `DB_ENCRYPT` | backend | `true` | |
| `DB_TRUST_SERVER_CERT` | backend | `false` | |
| `DB_POOL_MAX` | backend | `10` | |
| `JWT_SECRET` | backend | (secret) | never commit |
| `JWT_EXPIRES_IN` | backend | `8h` | |
| `AUTH_ADMIN_NIPS` | backend | `1001,1002` | comma-separated NIPs -> `admin` |
| `AUTH_MANAGER_NIPS` | backend | `2001` | comma-separated NIPs -> `manager` |
| `AUTH_DEMO_ENABLED` | backend | `false` | dev-only fallback; prod fails closed if true |
| `DEMO_NIP` / `DEMO_BIRTHDATE` / `DEMO_NAME` / `DEMO_ROLE` | backend | `1234` / `1990-01-01` / `Demo Admin` / `admin` | demo credential (not production auth) |
| `HRIS_CACHE_TTL_SECONDS` | backend | `300` | employee cache |
| `HRIS_QUERY_TIMEOUT_MS` | backend | `5000` | |
| `CORS_ORIGIN` | backend | `http://localhost:5173` | |
| `VITE_API_BASE_URL` | frontend | `http://localhost:4000/api/v1` | |
| `VITE_APP_NAME` | frontend | `Gantt PM` | |

## 12. Component diagram

```
+---------------------------------------------------------------+
|                          Browser (SPA)                        |
|  Login  |  ProjectList  |  ProjectDetail                        |
|                                    |                          |
|                             +------v-------+                  |
|                             |  GanttRoot   |  (pure view)     |
|                             |  Grid+Timeline                  |
|                             +------+-------+                  |
+------------------------------------|--------------------------+
                                     | HTTPS + JWT
                                     v
+---------------------------------------------------------------+
|                    Node + Express (TypeScript)                |
|  routes -> controllers -> services -> repositories            |
|                     |                    |                    |
|                     v                    v                    |
|               CPM Engine (pure)      EmployeeProvider          |
|                     |                    |                    |
+---------------------|--------------------|--------------------+
                      v                    v
              +--------------+     +--------------------------+
              |  <DB>.pm     |     |  <DB>.dbo.hris_Employee  |
              |  (own schema)|     |  (read only, adapter)    |
              +--------------+     +--------------------------+
```

## 13. ADRs (one-liners)

- ADR-01: Standalone app in `gantt/`, no reuse of `plans/` or `Planify/`.
- ADR-02: Dedicated `pm` schema in the `DB_DATABASE` database; HRIS tables (`hris_Employee`) untouched.
- ADR-03: No FK to `hris_Employee`; store `employee_nip` plus snapshots.
- ADR-04: Employee identity is full `NIP`, never `RIGHT(NIP,4)`.
- ADR-05: Scheduling is server-authoritative; client never computes dates.
- ADR-06: CPM engine is pure and deterministic; no I/O inside.
- ADR-07: Gantt is a pure view over the computed schedule.
- ADR-08: HRIS access only through `EmployeeProvider` via `HrisEmployeeAdapter`.
- ADR-09: Copy-on-write snapshots for member/resource display fields.
- ADR-10: JWT bearer auth; secret from env.
- ADR-11: Layering routes -> controllers -> services -> repositories -> db.
- ADR-12: Response envelope `{data}` / `{error}`; standard HTTP codes.
- ADR-13: Cycle rejection returns `409` with the cycle path.
- ADR-14: Custom Gantt rendering (virtualized rows + SVG arrow layer), not a third-party gantt.
- ADR-15: Duration/date semantics are inclusive working days.

## 14. Non-goals and anti-drift

- No HR features. No leave, payroll, attendance, or performance modules.
- No writes to HRIS. HRIS is read-only, only behind `EmployeeProvider`.
- No second employee master. `pm` stores `employee_nip` plus copy-on-write snapshots.
- No commercial Gantt library as a hard dependency. Custom rendering; a paid lib is a fallback only.
- No layer skips. Routes -> controllers -> services -> repositories -> db.
- Workload and dashboard are DERIVED read-models; no dedicated storage tables.
