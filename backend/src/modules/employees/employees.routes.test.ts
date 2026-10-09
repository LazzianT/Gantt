import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { errorHandler, notFound } from "../../middleware/error.js";
import { createEmployeesRouter } from "./employees.routes.js";
import type { EmployeeDTO, EmployeeProvider } from "./provider.js";

const EMPLOYEE: EmployeeDTO = {
  nip: "12345678",
  name: "Jane Doe",
  departmentId: 7,
  departmentName: "Engineering",
  position: "Developer",
  jobLevel: null,
  email: "jane@example.com",
  phone: null,
  active: true,
  gender: "P",
  employeeStatus: "Permanent",
  joinDate: "2020-01-01",
  birthDate: "1990-01-01",
};

const provider: EmployeeProvider = {
  getEmployee: async (nip) => (nip === EMPLOYEE.nip ? EMPLOYEE : null),
  searchEmployees: async () => [EMPLOYEE],
  getActiveEmployees: async () => [EMPLOYEE],
  getEmployees: async () => [EMPLOYEE],
};

const token = jwt.sign({ sub: "u1", email: "a@b.c", role: "admin" }, env.jwt.secret);

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createEmployeesRouter(provider));
  app.use(notFound);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function get(path: string): Promise<Response> {
  return fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
}

describe("employees routes", () => {
  it("returns search results as { data }", async () => {
    const res = await get("/api/v1/employees/search?q=jane");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [EMPLOYEE] });
  });

  it("rejects q shorter than 2 characters", async () => {
    const res = await get("/api/v1/employees/search?q=j");
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown nip", async () => {
    const res = await get("/api/v1/employees/999");
    expect(res.status).toBe(404);
  });
});
