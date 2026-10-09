import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { ServiceUnavailableError } from "../../middleware/error.js";
import { mapRowToDTO, type EmployeeDTO, type EmployeeProvider } from "../employees/provider.js";
import { loginWithNip, canManageProjects, resolveRole } from "./auth.service.js";

function employee(overrides: Partial<EmployeeDTO> = {}): EmployeeDTO {
  return {
    nip: "1001",
    name: "Jane Doe",
    departmentId: 1,
    departmentName: "Engineering",
    position: "Developer",
    jobLevel: null,
    email: null,
    phone: null,
    active: true,
    gender: null,
    employeeStatus: "Permanent",
    joinDate: "2020-01-01",
    birthDate: "1990-01-01",
    ...overrides,
  };
}

function fakeProvider(result: EmployeeDTO | null, throws = false): EmployeeProvider {
  return {
    getEmployee: async () => {
      if (throws) throw new Error("HRIS unreachable");
      return result;
    },
    searchEmployees: async () => [],
    getActiveEmployees: async () => [],
    getEmployees: async () => [],
  };
}

function withNipLists<T>(lists: { admin?: string[]; manager?: string[] }, fn: () => T): T {
  const auth = env.auth as unknown as { adminNips: string[]; managerNips: string[] };
  const prevAdmin = auth.adminNips;
  const prevManager = auth.managerNips;
  auth.adminNips = lists.admin ?? [];
  auth.managerNips = lists.manager ?? [];
  try {
    return fn();
  } finally {
    auth.adminNips = prevAdmin;
    auth.managerNips = prevManager;
  }
}

async function withDepartments<T>(codes: string[], fn: () => T | Promise<T>): Promise<T> {
  const auth = env.auth as unknown as { projectDepartments: string[] };
  const prev = auth.projectDepartments;
  auth.projectDepartments = codes;
  try {
    return await fn();
  } finally {
    auth.projectDepartments = prev;
  }
}

describe("auth.service.loginWithNip", () => {
  it("returns a session with name, role and department code for valid NIP and DOB", async () => {
    const { token, user } = await loginWithNip(fakeProvider(employee()), {
      nip: "1001",
      birthDate: "1990-01-01",
    });
    expect(user).toEqual({
      nip: "1001",
      name: "Jane Doe",
      role: "member",
      departCode: "0001",
      canManageProjects: false,
    });
    const decoded = jwt.verify(token, env.jwt.secret) as jwt.JwtPayload;
    expect(decoded).toMatchObject({
      sub: "1001",
      name: "Jane Doe",
      role: "member",
      departCode: "0001",
      canManageProjects: false,
    });
    expect(typeof decoded.exp).toBe("number");
  });

  it("zero-pads a numeric HRIS department id and flags project-management for allow-listed departments", async () => {
    await withDepartments(["0800", "0700", "0200"], async () => {
      const { user } = await loginWithNip(fakeProvider(employee({ departmentId: 800 })), {
        nip: "1001",
        birthDate: "1990-01-01",
      });
      expect(user.departCode).toBe("0800");
      expect(user.canManageProjects).toBe(true);
    });
  });

  it("compares against the mapped birthDate (local-midnight Date stays the same day)", async () => {
    const mapped = mapRowToDTO({
      NIP: "1001",
      Name: "Jane Doe",
      is_Active: "1",
      EmployeeStatus: "P",
      BirthDate: new Date(1990, 0, 1, 0, 0, 0),
    });
    const { user } = await loginWithNip(fakeProvider(mapped), { nip: "1001", birthDate: "1990-01-01" });
    expect(user.nip).toBe("1001");
  });

  it("rejects a wrong date of birth", async () => {
    await expect(
      loginWithNip(fakeProvider(employee()), { nip: "1001", birthDate: "2000-01-01" }),
    ).rejects.toThrow(/Invalid NIP or date of birth/);
  });

  it("rejects an unknown NIP", async () => {
    await expect(
      loginWithNip(fakeProvider(null), { nip: "9999", birthDate: "1990-01-01" }),
    ).rejects.toThrow(/Invalid NIP or date of birth/);
  });

  it("rejects an inactive employee", async () => {
    await expect(
      loginWithNip(fakeProvider(employee({ active: false })), { nip: "1001", birthDate: "1990-01-01" }),
    ).rejects.toThrow(/Invalid NIP or date of birth/);
  });

  it("throws ServiceUnavailableError when the provider throws, even for old demo creds", async () => {
    await expect(
      loginWithNip(fakeProvider(null, true), { nip: "1234", birthDate: "1990-01-01" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("never returns a session when the provider throws", async () => {
    await expect(
      loginWithNip(fakeProvider(null, true), { nip: "1001", birthDate: "1990-01-01" }),
    ).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
  });
});

describe("auth.service.resolveRole", () => {
  it("derives roles from the HRIS job level text", () => {
    expect(resolveRole("x", "MANAGER")).toBe("manager");
    expect(resolveRole("x", "DIRECTOR")).toBe("admin");
    expect(resolveRole("x", "HEAD OF OPS")).toBe("manager");
    expect(resolveRole("x", "BOARD MEMBER")).toBe("admin");
    expect(resolveRole("x", "STAFF")).toBe("member");
    expect(resolveRole("x", null)).toBe("member");
    expect(resolveRole("x")).toBe("member");
  });

  it("lets env NIP lists override the job level", () => {
    withNipLists({ admin: ["1001"] }, () => {
      expect(resolveRole("1001", "STAFF")).toBe("admin");
    });
    withNipLists({ manager: ["1001"] }, () => {
      expect(resolveRole("1001", "DIRECTOR")).toBe("manager");
    });
  });

  it("passes the employee job level through loginWithNip", async () => {
    const { user } = await loginWithNip(fakeProvider(employee({ jobLevel: "MANAGER" })), {
      nip: "1001",
      birthDate: "1990-01-01",
    });
    expect(user.role).toBe("manager");
  });
});

describe("auth.service.canManageProjects", () => {
  it("grants project management to allow-listed departments regardless of role", async () => {
    await withDepartments(["0800", "0700", "0200"], () => {
      expect(canManageProjects({ departCode: "0800" })).toBe(true);
      expect(canManageProjects({ departCode: "0700" })).toBe(true);
      expect(canManageProjects({ departCode: "0200" })).toBe(true);
    });
  });

  it("denies departments outside the allow-list and unknown departments", async () => {
    await withDepartments(["0800", "0700", "0200"], () => {
      expect(canManageProjects({ departCode: "0100" })).toBe(false);
      expect(canManageProjects({ departCode: null })).toBe(false);
      expect(canManageProjects({ departCode: undefined })).toBe(false);
      expect(canManageProjects({})).toBe(false);
    });
  });

  it("fails closed when no departments are configured", async () => {
    await withDepartments([], () => {
      expect(canManageProjects({ departCode: "0800" })).toBe(false);
    });
  });
});
