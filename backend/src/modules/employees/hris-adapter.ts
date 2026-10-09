import { mapRowToDTO, type EmployeeDTO, type EmployeeProvider } from "./provider.js";

export type QueryFn = (sql: string, params: Record<string, unknown>) => Promise<any[]>;

export const SEARCH_MIN_KEYWORD = 2;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;
export const PAGE_DEFAULT_SIZE = 50;
export const PAGE_MAX_SIZE = 200;

const SEARCH_CACHE_TTL_MS = 30_000;
const SEARCH_CACHE_MAX_ENTRIES = 200;
const DEFAULT_TTL_SECONDS = 300;

/**
 * Verbatim HRIS statements from docs/employee-integration.md. SELECT only.
 */
export const HRIS_SQL = {
  search: `
SELECT TOP (@limit)
    a.NIP,
    RTRIM(a.Name) AS Name,
    ISNULL(m.NamaDepartemen, '-') AS Department
FROM CORP_DB.dbo.hris_worker a
LEFT JOIN CORP_DB.dbo.hris_cost_center m ON a.DepartID = m.DepartID
WHERE a.is_Active = '1'
  AND (a.Name LIKE @like OR a.NIP LIKE @like)
ORDER BY a.Name;`,

  byNip: `
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
    CONVERT(varchar(10), a.BirthDate, 23) AS BirthDate,
    CONVERT(varchar(10), a.WorkingDate, 23) AS WorkingDate,
    CONVERT(varchar(10), a.FirstWorkingDate, 23) AS FirstWorkingDate,
    jt.Id_Jobtitle,
    jt.Jobtitle,
    jt.Joblevel
FROM CORP_DB.dbo.hris_worker a
LEFT JOIN CORP_DB.dbo.hris_cost_center m ON a.DepartID = m.DepartID
LEFT JOIN CORP_DB.dbo.hris_worker_career cp
       ON cp.NIP = a.NIP AND cp.is_Archive = '0'
LEFT JOIN CORP_DB.dbo.hris_job_title jt ON jt.Id_Jobtitle = cp.Id_Jobtitle
WHERE a.NIP = @nip
ORDER BY jt.Joblevel DESC, jt.Id_Jobtitle DESC;`,

  active: `
SELECT
    a.NIP,
    RTRIM(a.Name) AS Name,
    a.DepartID,
    ISNULL(m.NamaDepartemen, '-') AS Department,
    a.Email,
    a.Phone,
    a.Gender,
    a.EmployeeStatus,
    CONVERT(varchar(10), a.WorkingDate, 23) AS WorkingDate
FROM CORP_DB.dbo.hris_worker a
LEFT JOIN CORP_DB.dbo.hris_cost_center m ON a.DepartID = m.DepartID
WHERE a.is_Active = '1'
ORDER BY a.Name
OFFSET (@page - 1) * @pageSize ROWS
FETCH NEXT @pageSize ROWS ONLY;`,

  all: `
SELECT
    a.NIP,
    RTRIM(a.Name) AS Name,
    a.DepartID,
    ISNULL(m.NamaDepartemen, '-') AS Department,
    a.Email,
    a.Phone,
    a.Gender,
    a.EmployeeStatus,
    CONVERT(varchar(10), a.WorkingDate, 23) AS WorkingDate
FROM CORP_DB.dbo.hris_worker a
LEFT JOIN CORP_DB.dbo.hris_cost_center m ON a.DepartID = m.DepartID
ORDER BY a.Name
OFFSET (@page - 1) * @pageSize ROWS
FETCH NEXT @pageSize ROWS ONLY;`,
} as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function readTtlSeconds(): number {
  const raw = process.env.HRIS_CACHE_TTL_SECONDS ?? process.env.EMPLOYEE_CACHE_TTL_SECONDS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();
  constructor(private readonly maxEntries: number) {}

  get(key: string, now: number): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number, now: number): void {
    if (!this.map.has(key) && this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: now + ttlMs });
  }
}

export class HrisEmployeeAdapter implements EmployeeProvider {
  private readonly employeeCache = new TtlCache<EmployeeDTO | null>(10_000);
  private readonly searchCache = new TtlCache<EmployeeDTO[]>(SEARCH_CACHE_MAX_ENTRIES);

  constructor(
    private readonly query: QueryFn,
    private readonly ttlSeconds: number = readTtlSeconds(),
  ) {}

  async getEmployee(nip: string): Promise<EmployeeDTO | null> {
    const key = `employee:${nip}`;
    const now = Date.now();
    const cached = this.employeeCache.get(key, now);
    if (cached !== undefined) return cached;

    const rows = await this.query(HRIS_SQL.byNip, { nip });
    const dto = rows.length > 0 ? mapRowToDTO(rows[0]) : null;
    this.employeeCache.set(key, dto, this.ttlSeconds * 1000, now);
    return dto;
  }

  async searchEmployees(keyword: string, limit?: number): Promise<EmployeeDTO[]> {
    const query = keyword.trim();
    if (query.length < SEARCH_MIN_KEYWORD) return [];

    const capped = clamp(limit ?? SEARCH_DEFAULT_LIMIT, 1, SEARCH_MAX_LIMIT);
    const key = `search:${query}:${capped}`;
    const now = Date.now();
    const cached = this.searchCache.get(key, now);
    if (cached !== undefined) return cached;

    const rows = await this.query(HRIS_SQL.search, { limit: capped, like: `%${query}%` });
    const dtos = rows.map(mapRowToDTO);
    this.searchCache.set(key, dtos, SEARCH_CACHE_TTL_MS, now);
    return dtos;
  }

  async getActiveEmployees(page = 1, pageSize = PAGE_DEFAULT_SIZE): Promise<EmployeeDTO[]> {
    return this.list(HRIS_SQL.active, page, pageSize);
  }

  async getEmployees(page = 1, pageSize = PAGE_DEFAULT_SIZE): Promise<EmployeeDTO[]> {
    return this.list(HRIS_SQL.all, page, pageSize);
  }

  private async list(sql: string, page: number, pageSize: number): Promise<EmployeeDTO[]> {
    const params = {
      page: clamp(page, 1, Number.MAX_SAFE_INTEGER),
      pageSize: clamp(pageSize, 1, PAGE_MAX_SIZE),
    };
    const rows = await this.query(sql, params);
    return rows.map(mapRowToDTO);
  }
}
