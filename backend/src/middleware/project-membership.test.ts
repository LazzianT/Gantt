import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorHandler } from "./error.js";
import {
  guardProject,
  projectFromParam,
  projectOfTask,
  requireSelfOrRole,
  type Role,
} from "./project-membership.js";
import type { Exec } from "../modules/projects/projects.repository.js";

const KNOWN_PROJECT = 10;
const MEMBER_NIP = "111";
const OTHER_NIP = "222";

const exec: Exec = async (sql, params) => {
  if (sql.includes("FROM pm.projects")) {
    return Number(params?.id) === KNOWN_PROJECT ? [{ project_id: KNOWN_PROJECT }] : [];
  }
  if (sql.includes("FROM pm.project_tasks")) {
    return Number(params?.id) === 7 ? [{ project_id: KNOWN_PROJECT }] : [];
  }
  if (sql.includes("FROM pm.project_members")) {
    return String(params?.nip) === MEMBER_NIP ? [{ member: 1 }] : [];
  }
  return [];
};

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      sub: String(req.headers["x-sub"] ?? OTHER_NIP),
      role: (req.headers["x-role"] as Role) ?? "member",
      name: "Test User",
      ...(req.headers["x-can-manage"] === "1" ? { canManageProjects: true } : {}),
    };
    next();
  });
  app.get("/projects/:id", guardProject({ exec }, projectFromParam("id")), (_req, res) => {
    res.json({ data: { ok: true } });
  });
  app.get("/tasks/:id", guardProject({ exec }, projectOfTask), (_req, res) => {
    res.json({ data: { ok: true } });
  });
  app.get(
    "/resources/:employee_nip/workload",
    requireSelfOrRole("employee_nip", ["admin", "manager"]),
    (_req, res) => res.json({ data: { ok: true } }),
  );
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, { headers });
}

describe("guardProject", () => {
  it("lets an admin bypass project membership", async () => {
    const res = await get(`/projects/${KNOWN_PROJECT}`, { "x-role": "admin", "x-sub": OTHER_NIP });
    expect(res.status).toBe(200);
  });

  it("lets a manager bypass project membership", async () => {
    const res = await get(`/projects/${KNOWN_PROJECT}`, { "x-role": "manager", "x-sub": OTHER_NIP });
    expect(res.status).toBe(200);
  });

  it("lets a project-department manager bypass without membership", async () => {
    const res = await get(`/projects/${KNOWN_PROJECT}`, {
      "x-role": "member",
      "x-sub": OTHER_NIP,
      "x-can-manage": "1",
    });
    expect(res.status).toBe(200);
  });

  it("lets a member of the project through", async () => {
    const res = await get(`/projects/${KNOWN_PROJECT}`, { "x-role": "member", "x-sub": MEMBER_NIP });
    expect(res.status).toBe(200);
  });

  it("rejects a non-member with 403", async () => {
    const res = await get(`/projects/${KNOWN_PROJECT}`, { "x-role": "member", "x-sub": OTHER_NIP });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "FORBIDDEN", message: "Project access denied" } });
  });

  it("returns 404 for an unknown project", async () => {
    const res = await get("/projects/999", { "x-role": "member", "x-sub": OTHER_NIP });
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric project id", async () => {
    const res = await get("/projects/abc", { "x-role": "member", "x-sub": MEMBER_NIP });
    expect(res.status).toBe(400);
  });

  it("resolves the project from a nested task id", async () => {
    const mine = await get("/tasks/7", { "x-role": "member", "x-sub": MEMBER_NIP });
    expect(mine.status).toBe(200);
    const theirs = await get("/tasks/7", { "x-role": "member", "x-sub": OTHER_NIP });
    expect(theirs.status).toBe(403);
  });
});

describe("requireSelfOrRole", () => {
  it("allows the caller to read their own workload", async () => {
    const res = await get(`/resources/${MEMBER_NIP}/workload`, { "x-role": "member", "x-sub": MEMBER_NIP });
    expect(res.status).toBe(200);
  });

  it("rejects a member reading someone else's workload", async () => {
    const res = await get(`/resources/${MEMBER_NIP}/workload`, { "x-role": "member", "x-sub": OTHER_NIP });
    expect(res.status).toBe(403);
  });

  it("allows a manager to read any workload", async () => {
    const res = await get(`/resources/${MEMBER_NIP}/workload`, { "x-role": "manager", "x-sub": OTHER_NIP });
    expect(res.status).toBe(200);
  });
});
