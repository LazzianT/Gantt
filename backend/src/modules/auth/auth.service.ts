import jwt from "jsonwebtoken";
import { env, normalizeDepartCode } from "../../config/env.js";
import { ServiceUnavailableError, UnauthorizedError, ValidationError } from "../../middleware/error.js";
import type { EmployeeDTO, EmployeeProvider } from "../employees/provider.js";

export type Role = "admin" | "manager" | "member" | "viewer";

export interface JwtUser {
  sub: string;
  name?: string;
  email?: string;
  role: Role;
  /** Zero-padded HRIS department code (e.g. "0800"); null when unknown. */
  departCode?: string | null;
  /** Server-computed capability so the UI can gate actions without duplicating the allow-list. */
  canManageProjects?: boolean;
}

export interface NipLoginInput {
  nip: string;
  birthDate: string;
}

export interface NipUser {
  nip: string;
  name: string;
  role: Role;
  departCode: string | null;
  canManageProjects: boolean;
}

export interface NipLoginResult {
  token: string;
  user: NipUser;
}

/** Accepts YYYY-MM-DD or an ISO timestamp; returns date-only or null when unparseable. */
export function normalizeDate(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1]! : null;
}

/** NIP lists override; otherwise the HRIS job level text decides. */
export function resolveRole(nip: string, jobLevel?: string | null): Role {
  if (env.auth.adminNips.includes(nip)) return "admin";
  if (env.auth.managerNips.includes(nip)) return "manager";
  if (jobLevel) {
    if (/BOARD|DIRECTOR|DIREKTUR/i.test(jobLevel)) return "admin";
    if (/MANAGER|HEAD|CHIEF|GM/i.test(jobLevel)) return "manager";
  }
  return "member";
}

/**
 * Project lifecycle (create/edit/delete) is granted by department, not role:
 * a user may manage projects only when their HRIS department is allow-listed.
 */
export function canManageProjects(user: { departCode?: string | null }): boolean {
  const code = user.departCode ?? null;
  return code !== null && env.auth.projectDepartments.includes(code);
}

export async function loginWithNip(
  provider: EmployeeProvider,
  { nip, birthDate }: NipLoginInput,
): Promise<NipLoginResult> {
  const trimmedNip = nip.trim();
  const normalizedBirthDate = normalizeDate(birthDate);
  if (!trimmedNip || !normalizedBirthDate) {
    throw new ValidationError("NIP and date of birth are required");
  }

  let employee: EmployeeDTO | null;
  try {
    employee = await provider.getEmployee(trimmedNip);
  } catch {
    // HRIS is the only identity source; fail closed rather than issue a session.
    throw new ServiceUnavailableError("Employee directory unavailable.");
  }

  if (!employee || !employee.active || employee.birthDate !== normalizedBirthDate) {
    throw new UnauthorizedError("Invalid NIP or date of birth.");
  }

  const role = resolveRole(employee.nip, employee.jobLevel);
  const departCode = normalizeDepartCode(employee.departmentId);
  const canManage = canManageProjects({ departCode });
  const token = signPayload({
    sub: employee.nip,
    name: employee.name,
    role,
    departCode,
    canManageProjects: canManage,
  });
  return { token, user: { nip: employee.nip, name: employee.name, role, departCode, canManageProjects: canManage } };
}

function signPayload(payload: Record<string, unknown>): string {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function signToken(user: JwtUser): string {
  return signPayload({
    sub: user.sub,
    ...(user.name !== undefined ? { name: user.name } : {}),
    role: user.role,
    ...(user.departCode !== undefined ? { departCode: user.departCode } : {}),
    ...(user.canManageProjects !== undefined ? { canManageProjects: user.canManageProjects } : {}),
  });
}

export function me(user: JwtUser): JwtUser {
  return user;
}
