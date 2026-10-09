# Discovery: Enterprise Project Management (Gantt) - Milestone 1

Status: Milestone 1 discovery complete, decisions locked.
Scope: standalone app in `gantt/`, Microsoft Project-like scheduling, HRIS-backed people directory.

## 1. Repository layout finding

The workspace holds three relevant trees. Only `gantt/` is used for this project.

| Path | What it is | Stack | Reused? |
|------|------------|-------|---------|
| `HRIS_PORTAL/` | HRIS source of truth (HRIS_PORTAL app) | Express 5 + `mssql`, CommonJS | Read-only data source |
| `plans/` | Prior art: task board / gantt-lite | React + Vite, Express ESM | No |
| `Planify/` | Prior art: planning app | Next.js + Prisma | No |
| `gantt/` | New standalone app (this project) | React + Vite + TS + Tailwind, Node + Express + TS, SQL Server | Yes |

`gantt/` was empty at discovery time. Backend, frontend, and docs live here as separate roots.

## 2. HRIS source and column evidence

- Application: HRIS_PORTAL.
- Database: `CORP_DB`.
- Primary table: `CORP_DB.dbo.hris_worker`.

Confirmed columns (verbatim, do not invent others):

| Column | Meaning |
|--------|---------|
| `NIP` | string employee id. No reliable unique PK or index. |
| `Id_Employee` | int identity. Not the business key. |
| `Name` | employee name |
| `is_Active` | `'1'` means active |
| `DepartID` | FK to `hris_cost_center(DepartID)` |
| `Gender` | `'L'` / `'P'` |
| `EmployeeStatus` | `'P'` = Permanent, anything else = Contract |
| `MaritalStatus` | `'K'` when married (single seen in data) |
| `BirthPlace`, `BirthDate` | birth info |
| `Phone`, `Email` | contact |
| `NIK`, `NRIC`, `NPWP`, `BPJSTK`, `BPJSKS` | identity and benefit numbers |
| `FirstWorkingDate`, `WorkingDate` | tenure dates |
| `Religion`, `Child` | demographics |
| `Address, Kelurahan, Kecamatan, KabupatenKota, Province, PostalCode` | legal address |
| `Addressdomisili, Keldomisili, Kecdomisili, KabKotadomisili, Provincedomisili` | domicile address |

Supporting tables:

- `hris_cost_center(DepartID, NamaDepartemen, LevelDepartemen, Id_Division)` resolves department.
- Position path: `hris_worker_career` (active row `is_Archive='0'`) -> `hris_job_title(Id_Jobtitle, Joblevel, Id_Category)` -> `hris_job_level` / `hris_job_category(Id_Category, CategoryName)`.

Established employee search SQL (adapter basis):

```sql
SELECT TOP (@limit)
    a.NIP,
    RTRIM(a.Name) AS Name,
    ISNULL(m.NamaDepartemen, '-') AS Department
FROM CORP_DB.dbo.hris_worker a
LEFT JOIN CORP_DB.dbo.hris_cost_center m ON a.DepartID = m.DepartID
WHERE a.is_Active = '1'
  AND (a.Name LIKE @like OR a.NIP LIKE @like)
ORDER BY a.Name;
```

## 3. Shared pool adapter path

HRIS_PORTAL already exposes a reusable, parameterized data access layer:

- Shared pool: `HRIS_PORTAL/backend/src/config/database.js`, exports `getPool`.
- Adapter: `HRIS_PORTAL/backend/src/modules/hris/db/pool.js`, exports `{ getPool, query, queryOne, execute, sql }`.

The new app imports the same shape of adapter (copy or re-implement behind the same interface) so HRIS access stays parameterized. No string concatenation of user input.

## 4. Prior art comparison

| Dimension | `plans/` | `Planify/` | New `gantt/` |
|-----------|----------|------------|--------------|
| Frontend | React + Vite | Next.js | React + Vite + TS + Tailwind |
| Backend | Express (ESM) | Next.js API + Prisma | Node + Express + TS, `mssql` |
| Data model | Workspaces / Projects / SubProjects / Tasks | Project / Milestone / Task | `pm` schema, CPM-grade |
| Dependencies | No | No | Yes (FS/SS/FF/SF + lag) |
| CPM | No | No | Yes, server-authoritative |
| Baseline | No | Planned for V2 | Yes, first-class |
| Resources | No | Planned for V2 | Yes, first-class |
| Calendars | No | No | Yes (working days + exceptions) |
| Auth | session-ish | Next-auth-style | JWT bearer |
| Reuse | No | No | N/A |

`Planify/` roadmap explicitly places baseline, CPM, and resource management in V2. Neither prior app is the model. The new app is standalone.

## 5. Locked decisions

| # | Decision |
|---|----------|
| D1 | New app lives in `gantt/` with `gantt/backend`, `gantt/frontend`, `gantt/docs`. |
| D2 | Dedicated schema `pm` inside database `CORP_DB`. `hris_worker` untouched. |
| D3 | No foreign key to `hris_worker`. Store `employee_nip` as a plain column. |
| D4 | Employee identity is `NIP` (string). Display fields are copy-on-write snapshots. |
| D5 | Boundary: Project Management -> `EmployeeProvider` -> `HrisEmployeeAdapter` -> `hris_worker`. Only the adapter touches HRIS SQL. |
| D6 | Scheduling is a server-authoritative CPM engine. Gantt is a pure view. |
| D7 | Auth is JWT bearer. |
| D8 | Layering: routes -> controllers -> services -> repositories -> db. |
| D9 | Response envelope: `{data}` on success, `{error}` on failure. |

## 6. Risks and open questions

| # | Risk / question | Impact | Mitigation / owner |
|---|-----------------|--------|--------------------|
| R1 | `NIP` has no reliable PK or index. | Lookups can be slow; duplicates possible. | Adapter uses FULL NIP equality; never `RIGHT(NIP,4)`. Index only in `pm` tables, not on HRIS. |
| R2 | Prior HRIS_PORTAL flows key on `RIGHT(NIP,4)` / `NIP.slice(-4)`. | Wrong employee match if copied. | Adapter contract forbids suffix matching. See `employee-integration.md` anti-drift rules. |
| R3 | `EmployeeStatus` uses `'P'` for Permanent and anything else for Contract. | Miscategorization. | Normalize in adapter, document fallback as Contract. |
| R4 | HRIS availability and latency. | People directory outages block assignment UI. | TTL cache + copy-on-write snapshot; degrade to stale/best-effort. |
| R5 | Department/position data changes after assignment. | Snapshot drift. | Snapshot at assignment; refresh on demand. |
| R6 | Multiple calendars per project. | Scheduling scope creep. | Milestone 2 uses one default calendar; hook reserved. |
| R7 | Resource leveling and earned value. | Not in M1/M2 scope. | Reserved as extensibility hooks only. |
| R8 | Open: expected project count and task count per project (perf sizing). | Affects windowing and index choices. | Confirm before build. |
| R9 | Open: is `masa kerja` / tenure required in `EmployeeDTO`? | Field list. | Decide before adapter freeze. |
| R10 | Open: who owns `pm` migrations in prod (this team or HRIS_PORTAL DBA)? | Deployment path. | Confirm before `001` runs. |

## 7. Deliverables in this docs set

- `discovery.md` (this file)
- `architecture.md`
- `database-design.md`
- `employee-integration.md`
- `scheduling-engine.md`
- `gantt-engine.md`
