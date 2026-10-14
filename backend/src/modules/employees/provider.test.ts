import { describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { HRIS_SQL, HrisEmployeeAdapter, SEARCH_MAX_LIMIT, hrisObject, type QueryFn } from "./hris-adapter.js";
import { mapRowToDTO } from "./provider.js";

interface Call {
  sql: string;
  params: Record<string, unknown>;
}

function fakeQuery(rows: Record<string, any>[] = []) {
  const calls: Call[] = [];
  const fn: QueryFn = async (sql, params) => {
    calls.push({ sql, params });
    return rows;
  };
  return { fn, calls };
}

describe("mapRowToDTO", () => {
  it("maps a full by-NIP row", () => {
    const dto = mapRowToDTO({
      NIP: " 12345678 ",
      Name: "Jane Doe   ",
      DepartID: 7,
      Department: "Engineering",
      Jobtitle: "Engineering Manager",
      Joblevel: "MANAGER",
      Email: " jane@example.com ",
      Phone: null,
      is_Active: "1",
      Gender: "P",
      EmployeeStatus: "P",
      BirthDate: "1990-05-15T00:00:00.000Z",
      WorkingDate: "2020-03-01T00:00:00.000Z",
      FirstWorkingDate: "2019-01-01T00:00:00.000Z",
    });
    expect(dto).toEqual({
      nip: "12345678",
      name: "Jane Doe",
      departmentId: 7,
      departmentName: "Engineering",
      position: "Engineering Manager",
      jobLevel: "MANAGER",
      email: "jane@example.com",
      phone: null,
      active: true,
      gender: "P",
      employeeStatus: "Permanent",
      joinDate: "2020-03-01",
      birthDate: "1990-05-15",
    });
  });

  it("falls back: department '-', position null, first working date, contract", () => {
    const dto = mapRowToDTO({
      NIP: "1",
      Name: "X",
      DepartID: null,
      Department: null,
      is_Active: "0",
      Gender: "Q",
      EmployeeStatus: "K",
      FirstWorkingDate: "2021-05-06T00:00:00.000Z",
    });
    expect(dto.departmentId).toBeNull();
    expect(dto.departmentName).toBe("-");
    expect(dto.position).toBeNull();
    expect(dto.jobLevel).toBeNull();
    expect(dto.active).toBe(false);
    expect(dto.gender).toBeNull();
    expect(dto.employeeStatus).toBe("Contract");
    expect(dto.joinDate).toBe("2021-05-06");
    expect(dto.email).toBeNull();
    expect(dto.phone).toBeNull();
    expect(dto.birthDate).toBeNull();
  });

  it("maps a SQL-style date string without a timezone shift", () => {
    const dto = mapRowToDTO({ NIP: "1", Name: "X", is_Active: "1", BirthDate: "1990-01-01" });
    expect(dto.birthDate).toBe("1990-01-01");
  });

  it("keeps the calendar day for a Date at local midnight", () => {
    const dto = mapRowToDTO({
      NIP: "1",
      Name: "X",
      is_Active: "1",
      BirthDate: new Date(1990, 0, 1, 0, 0, 0),
    });
    expect(dto.birthDate).toBe("1990-01-01");
  });

  it("keeps a null BirthDate null", () => {
    expect(mapRowToDTO({ NIP: "1", Name: "X", is_Active: "1", BirthDate: null }).birthDate).toBeNull();
  });
});

describe("HrisEmployeeAdapter.searchEmployees", () => {
  it("returns [] for keywords shorter than 2 chars without querying", async () => {
    const { fn, calls } = fakeQuery([{ NIP: "1", Name: "A" }]);
    const adapter = new HrisEmployeeAdapter(fn);
    expect(await adapter.searchEmployees("a")).toEqual([]);
    expect(await adapter.searchEmployees(" ")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("clamps the limit into [1, SEARCH_MAX_LIMIT]", async () => {
    const { fn, calls } = fakeQuery([]);
    const adapter = new HrisEmployeeAdapter(fn);
    await adapter.searchEmployees("ab", 9999);
    await adapter.searchEmployees("cd", 0);
    expect(calls[0]!.params.limit).toBe(SEARCH_MAX_LIMIT);
    expect(calls[1]!.params.limit).toBe(1);
  });

  it("emits the documented active-only SQL and parameterizes the LIKE", async () => {
    const { fn, calls } = fakeQuery([]);
    const adapter = new HrisEmployeeAdapter(fn);
    await adapter.searchEmployees("ja", 5);
    const { sql, params } = calls[0]!;
    expect(sql).toMatch(/is_Active\s*=\s*'1'/);
    expect(sql).toContain("MASCOSTCENTER");
    expect(sql).toContain("TOP (@limit)");
    expect(params.like).toBe("%ja%");
    expect(params.limit).toBe(5);
    expect(sql).not.toContain("%ja%");
  });
});

describe("HrisEmployeeAdapter.getEmployee", () => {
  it("matches the full NIP, never a suffix", async () => {
    const full = "12345678";
    const { fn, calls } = fakeQuery([{ NIP: full, Name: "Jane", is_Active: "1" }]);
    const adapter = new HrisEmployeeAdapter(fn);
    const dto = await adapter.getEmployee(full);
    expect(calls[0]!.params.nip).toBe(full);
    expect(calls[0]!.sql).toContain("a.NIP = @nip");
    expect(calls[0]!.sql).not.toMatch(/RIGHT\s*\(\s*NIP/i);
    expect(dto?.nip).toBe(full);
  });

  it("keeps NIPs sharing the last 4 digits distinct", async () => {
    const nipA = "10001234";
    const nipB = "20001234";
    const fn: QueryFn = async (_sql, params) => [
      { NIP: params.nip, Name: params.nip === nipA ? "A" : "B", is_Active: "1" },
    ];
    const adapter = new HrisEmployeeAdapter(fn);
    expect((await adapter.getEmployee(nipA))?.nip).toBe(nipA);
    expect((await adapter.getEmployee(nipB))?.nip).toBe(nipB);
  });

  it("caches hits and misses (one query per NIP)", async () => {
    const { fn, calls } = fakeQuery([{ NIP: "9", Name: "Z", is_Active: "1" }]);
    const adapter = new HrisEmployeeAdapter(fn, 300);
    await adapter.getEmployee("9");
    await adapter.getEmployee("9");
    expect(calls).toHaveLength(1);

    const { fn: emptyFn, calls: emptyCalls } = fakeQuery([]);
    const emptyAdapter = new HrisEmployeeAdapter(emptyFn, 300);
    expect(await emptyAdapter.getEmployee("nope")).toBeNull();
    expect(await emptyAdapter.getEmployee("nope")).toBeNull();
    expect(emptyCalls).toHaveLength(1);
  });
});

describe("HrisEmployeeAdapter paging", () => {
  it("uses OFFSET/FETCH params for active and all lists", async () => {
    const { fn, calls } = fakeQuery([]);
    const adapter = new HrisEmployeeAdapter(fn);
    await adapter.getActiveEmployees();
    await adapter.getEmployees(2, 10);
    expect(calls[0]!.params).toEqual({ page: 1, pageSize: 50 });
    expect(calls[0]!.sql).toMatch(/OFFSET \(@page - 1\) \* @pageSize ROWS/);
    expect(calls[0]!.sql).toMatch(/is_Active\s*=\s*'1'/);
    expect(calls[1]!.params).toEqual({ page: 2, pageSize: 10 });
    expect(calls[1]!.sql).not.toMatch(/is_Active/);
  });

  it("clamps page and pageSize", async () => {
    const { fn, calls } = fakeQuery([]);
    const adapter = new HrisEmployeeAdapter(fn);
    await adapter.getActiveEmployees(0, 0);
    expect(calls[0]!.params).toEqual({ page: 1, pageSize: 1 });
  });
});

describe("HRIS SQL safety", () => {
  it("contains no write statements", () => {
    for (const sql of Object.values(HRIS_SQL)) {
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE)\b/i);
    }
  });

  it("converts date columns to YYYY-MM-DD strings", () => {
    expect(HRIS_SQL.byNip).toContain("CONVERT(varchar(10), a.BirthDate, 23)");
    expect(HRIS_SQL.byNip).toContain("CONVERT(varchar(10), a.WorkingDate, 23)");
    expect(HRIS_SQL.byNip).toContain("CONVERT(varchar(10), a.FirstWorkingDate, 23)");
    expect(HRIS_SQL.byNip).toContain("jt.Joblevel");
    expect(HRIS_SQL.active).toContain("CONVERT(varchar(10), a.WorkingDate, 23)");
    expect(HRIS_SQL.all).toContain("CONVERT(varchar(10), a.WorkingDate, 23)");
  });

  it("qualifies every HRIS object with DB_DATABASE from env, never a hardcoded database", () => {
    const prefix = `[${env.db.database}].dbo.`;
    expect(hrisObject("hris_Employee")).toBe(`${prefix}hris_Employee`);
    for (const sql of Object.values(HRIS_SQL)) {
      expect(sql).toContain(prefix);
      expect(sql).not.toMatch(/CORP_DB/i);
      expect(sql).not.toMatch(/hris_worker|hris_cost_center|hris_job_title/i);
    }
  });
});
