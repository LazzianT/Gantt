export type Gender = "L" | "P" | null;
export type EmployeeStatus = "Permanent" | "Contract";

export interface EmployeeDTO {
  nip: string;
  name: string;
  departmentId: number | null;
  departmentName: string;
  position: string | null;
  jobLevel: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  gender: Gender;
  employeeStatus: EmployeeStatus;
  joinDate: string | null;
  birthDate: string | null;
}

export interface EmployeeProvider {
  getEmployee(nip: string): Promise<EmployeeDTO | null>;
  searchEmployees(keyword: string, limit?: number): Promise<EmployeeDTO[]>;
  getActiveEmployees(page?: number, pageSize?: number): Promise<EmployeeDTO[]>;
  getEmployees(page?: number, pageSize?: number): Promise<EmployeeDTO[]>;
}

function rtrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Local components: a local-midnight datetime must keep its calendar day.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match ? match[1]! : null;
}

export function mapRowToDTO(row: Record<string, any>): EmployeeDTO {
  const gender = row.Gender === "L" || row.Gender === "P" ? (row.Gender as Gender) : null;
  return {
    nip: rtrim(row.NIP),
    name: rtrim(row.Name),
    departmentId: row.DepartID === null || row.DepartID === undefined ? null : Number(row.DepartID),
    departmentName: nullableText(row.Department) ?? "-",
    position: nullableText(row.Jobtitle),
    jobLevel: nullableText(row.Joblevel),
    email: nullableText(row.Email),
    phone: nullableText(row.Phone),
    active: row.is_Active === "1",
    gender,
    employeeStatus: row.EmployeeStatus === "P" ? "Permanent" : "Contract",
    joinDate: toIsoDate(row.WorkingDate ?? row.FirstWorkingDate),
    birthDate: toIsoDate(row.BirthDate),
  };
}
