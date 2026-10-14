# Employee Integration

Project Management depends on a people directory. HRIS (HRIS_PORTAL, table `dbo.hris_Employee`) is the source of truth. The PM app never queries HRIS SQL directly from a service. It depends on an interface. One adapter implements it.

The HRIS database is **not hardcoded**: every statement is DB-qualified with `DB_DATABASE` from `.env` (`env.db.database`), so the same adapter works against whatever database the deployment points at.

## 1. Boundary diagram

```
+-------------------------------+       +-----------------------------+
|  PM services                  |       |   EmployeeProvider          |
|  member.service               | ----> |   (TypeScript interface)    |
|  resource.service             |       |                             |
|  schedule read models         |       |   getEmployees()            |
+-------------------------------+       |   getEmployee(nip)          |
                                        |   searchEmployees(q, limit) |
                                        |   getActiveEmployees(...)   |
                                        +--------------+--------------+
                                                       | implements
                                                       v
                                        +-----------------------------+
                                        |  HrisEmployeeAdapter        |
                                        |  - only HRIS SQL owner      |
                                        |  - parameterized mssql      |
                                        |  - normalize -> EmployeeDTO |
                                        |  - TTL cache                |
                                        +--------------+--------------+
                                                       |
                                                       v
                                        +-----------------------------+
                                        |  <DB>.dbo.hris_Employee     |
                                        |  + MASCOSTCENTER            |
                                        |  + career path / jobtitle   |
                                        |  (READ ONLY)                |
                                        +-----------------------------+
```

Invariant: only `HrisEmployeeAdapter` contains HRIS SQL. Grep guard: no HRIS table name may appear outside `src/integrations/hris`.

## 2. `EmployeeProvider` interface

```ts
import type { EmployeeDTO } from "./employee-dto";

export interface EmployeeProvider {
  /** Active + inactive, paginated. */
  getEmployees(params: {
    page: number;
    pageSize: number;
  }): Promise<{ items: EmployeeDTO[]; total: number }>;

  /** One employee by full NIP. Returns null if absent. */
  getEmployee(nip: string): Promise<EmployeeDTO | null>;

  /** Name or NIP contains match, active only, capped by limit. */
  searchEmployees(query: string, limit: number): Promise<EmployeeDTO[]>;

  /** Active employees, paginated. */
  getActiveEmployees(params: {
    page: number;
    pageSize: number;
  }): Promise<{ items: EmployeeDTO[]; total: number }>;
}
```

## 3. Normalized `EmployeeDTO`

```ts
export interface EmployeeDTO {
  nip: string;                 // business identity (full NIP)
  name: string;
  departmentId: number | null; // DepartID
  departmentName: string;      // NamaDepartemen or '-'
  position: string | null;     // from career path -> jobtitle
  email: string | null;
  phone: string | null;
  active: boolean;             // is_Active === '1'
  gender: "L" | "P" | null;
  employeeStatus: "Permanent" | "Contract";
  joinDate: string | null;     // ISO date from WorkingDate (fallback FirstWorkingDate)
}
```

## 4. Column mapping

| DTO field | Source | Rule |
|-----------|--------|------|
| `nip` | `hris_Employee.NIP` | full value, trimmed. Never `RIGHT(NIP,4)`. |
| `name` | `hris_Employee.Name` | `RTRIM`. |
| `departmentId` | `hris_Employee.DepartID` | as is, nullable. |
| `departmentName` | `MASCOSTCENTER.NamaDepartemen` | `ISNULL(...,'-')`. |
| `position` | `hris_Jobtitle` via `hris_EmployeeCareerPath` | active row `is_Archive='0'`. |
| `email` | `hris_Employee.Email` | trimmed, nullable. |
| `phone` | `hris_Employee.Phone` | trimmed, nullable. |
| `active` | `hris_Employee.is_Active` | `'1'` -> true. |
| `gender` | `hris_Employee.Gender` | `'L'`/`'P'` else null. |
| `employeeStatus` | `hris_Employee.EmployeeStatus` | `'P'` -> Permanent, else Contract. |
| `joinDate` | `WorkingDate` fallback `FirstWorkingDate` | ISO `YYYY-MM-DD`. |

Position resolution (active row): career path `is_Archive='0'` joins `hris_Jobtitle.Id_Jobtitle`. If several active rows exist, pick the one with the greatest job level, then greatest id.

## 5. `HrisEmployeeAdapter` responsibilities

1. Own every HRIS SQL statement. Use parameterized `mssql` only.
2. Normalize rows to `EmployeeDTO`. No raw rows escape.
3. Enforce full-NIP equality. Reject suffix matching.
4. Cache results with a TTL. Serve stale on failure up to a hard limit.
5. Apply query timeout. Surface typed errors.
6. Never write to HRIS. SELECT only.

### 5.1 Search (adapter basis, verbatim)

```sql
SELECT TOP (@limit)
    a.NIP,
    RTRIM(a.Name) AS Name,
    ISNULL(m.NamaDepartemen, '-') AS Department
FROM <DB>.dbo.hris_Employee a
LEFT JOIN <DB>.dbo.MASCOSTCENTER m ON a.DepartID = m.DepartID
WHERE a.is_Active = '1'
  AND (a.Name LIKE @like OR a.NIP LIKE @like)
ORDER BY a.Name;
```

`@like` is built as `'%' + @query + '%'` in code, passed as a parameter. Never concatenated into the string.

### 5.2 By NIP with joins

```sql
SELECT
    a.NIP,
    RTRIM(a.Name)             AS Name,
    a.DepartID,
    ISNULL(m.NamaDepartemen, '-') AS Department,
    a.Email,
    a.Phone,
    a.is_Active,
    a.Gender,
    a.EmployeeStatus,
    a.WorkingDate,
    a.FirstWorkingDate,
    jt.Id_Jobtitle,
    jt.Joblevel
FROM <DB>.dbo.hris_Employee a
LEFT JOIN <DB>.dbo.MASCOSTCENTER m ON a.DepartID = m.DepartID
LEFT JOIN <DB>.dbo.hris_EmployeeCareerPath cp
       ON cp.NIP = a.NIP AND cp.is_Archive = '0'
LEFT JOIN <DB>.dbo.hris_Jobtitle jt ON jt.Id_Jobtitle = cp.Id_Jobtitle
WHERE a.NIP = @nip
ORDER BY jt.Joblevel DESC, jt.Id_Jobtitle DESC;
```

Adapter takes the first row and maps `position` from the jobtitle join. Verify the actual career-path join column names against HRIS_PORTAL before freeze (open question in `discovery.md`).

### 5.3 Active list, paginated

```sql
SELECT
    a.NIP,
    RTRIM(a.Name) AS Name,
    a.DepartID,
    ISNULL(m.NamaDepartemen, '-') AS Department,
    a.Email,
    a.Phone,
    a.Gender,
    a.EmployeeStatus,
    a.WorkingDate
FROM <DB>.dbo.hris_Employee a
LEFT JOIN <DB>.dbo.MASCOSTCENTER m ON a.DepartID = m.DepartID
WHERE a.is_Active = '1'
ORDER BY a.Name
OFFSET (@page - 1) * @pageSize ROWS
FETCH NEXT @pageSize ROWS ONLY;
```

Count query mirrors the filter with `COUNT_BIG(*)`.

## 6. NIP quirk rule

Some HRIS_PORTAL flows key on `RIGHT(NIP,4)` / `NIP.slice(-4)`. That is unsafe here.

- The adapter matches and returns the FULL `NIP`.
- No code path may truncate NIP to 4 characters, prefix, or suffix.
- `pm` stores `employee_nip NVARCHAR(20)` with the full value.
- Tests must include a fixture with two NIPs sharing the same last 4 digits. The adapter must keep them distinct.

This rule is non-negotiable. Violating it silently mis-attributes people and work.

## 7. Caching and copy-on-write

- TTL cache keyed by method + arguments. `HRIS_CACHE_TTL_SECONDS` (default 300).
- `searchEmployees` results are cached briefly (short TTL) to survive keystroke bursts; treat as best-effort.
- `getEmployee(nip)` cached longer; invalidated on explicit refresh.
- Copy-on-write: when a member or resource is added, the service reads one DTO and writes snapshot columns into `pm.project_members` / `pm.project_resources` (`member_name`, `department_name`, `position_name`, `email`, `snapshot_at`).
- After that, project views render from snapshots. HRIS changes do not silently rewrite history.
- Refresh is explicit: a "refresh from HRIS" action re-reads the DTO and updates snapshots, logged in `project_activity_logs`.

## 8. Failure and degradation

| Failure | Behavior |
|---------|----------|
| HRIS timeout (`HRIS_QUERY_TIMEOUT_MS`, default 5000) | Serve stale cache if present; else `503`. |
| HRIS down, cache warm | Serve stale, mark response `stale: true`. |
| HRIS down, cache cold, project has snapshots | Render project from snapshots. Directory search shows empty with a notice. |
| Single `getEmployee` miss (person removed) | Return null; UI shows "former employee" using snapshot. |
| Duplicate NIP rows | Adapter returns the row with the greatest `Id_Employee`. |

Retry policy: retry idempotent reads up to 2 times with exponential backoff (100ms, 300ms) on transient errors only. No retry on validation or not-found.

Degradation is explicit, never silent. The API exposes whether data is `stale`.

## 9. Security

- SELECT-only. The DB user (`DB_USER`) has no DML rights on `hris_Employee` or its joins.
- Least privilege: grant on the specific tables/views the adapter reads.
- No HRIS PII beyond what the DTO needs. Sensitive fields (`NIK`, `NRIC`, `NPWP`, `BPJSTK`, `BPJSKS`) are never selected by this adapter.
- No secrets in code or docs. Connection info from env.
- All SQL parameterized. No string interpolation of user input.
- Errors returned to clients are generic; raw SQL errors are logged server-side only.

## 10. Environment variables (adapter scope)

| Var | Purpose | Default |
|-----|---------|---------|
| `DB_SERVER` | HRIS host | none |
| `DB_DATABASE` | database qualified on every HRIS statement (also holds the `pm` schema) | `CORP_DB` |
| `DB_USER` | read-mostly account | none |
| `DB_PASSWORD` | secret | none |
| `DB_ENCRYPT` | TLS | `true` |
| `DB_TRUST_SERVER_CERT` | cert trust | `false` |
| `HRIS_CACHE_TTL_SECONDS` | cache TTL | `300` |
| `HRIS_QUERY_TIMEOUT_MS` | query timeout | `5000` |
| `HRIS_MAX_STALE_SECONDS` | serve-stale ceiling | `3600` |

## 11. Anti-drift rules

1. HRIS table names appear only under `src/integrations/hris`. CI grep fails the build otherwise.
2. No service imports the HRIS pool directly. Only the adapter does.
3. DTO shape is frozen per release. New fields land in the DTO first, then the mapping table here.
4. No `RIGHT(NIP,4)` anywhere. Lint rule / test enforces full NIP.
5. Snapshot columns are never overwritten by a plain read. Only explicit refresh writes them.
6. Any new HRIS SQL must be added to this document with the exact statement.
7. Column renames in HRIS require a discovery update and an adapter test fixture update.

## 12. Future swap to a REST HRIS

The interface is the seam. If HRIS later exposes REST:

1. Add `RestEmployeeAdapter implements EmployeeProvider`.
2. Switch the binding in the DI/config module (`EMPLOYEE_PROVIDER=rest`).
3. No service, controller, or route changes. Cache, degradation, and error typing remain at the adapter or a shared wrapper.

```
EmployeeProvider (interface)
   |-- HrisEmployeeAdapter   (today: direct mssql)
   \-- RestEmployeeAdapter   (future: HTTP, same DTO)
```

Because callers depend on `EmployeeProvider`, the swap is configuration, not a refactor.
