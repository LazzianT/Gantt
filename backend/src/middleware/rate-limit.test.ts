import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loginRateLimiter } from "./rate-limit.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.post("/login", loginRateLimiter, (_req, res) => {
    res.json({ data: { token: "ok" } });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function login(nip: string): Promise<Response> {
  return fetch(`${base}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nip, birthDate: "1990-01-01" }),
  });
}

describe("loginRateLimiter", () => {
  it("returns 429 with the error envelope on the 11th attempt for the same ip+nip", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login("1234")).status).toBe(200);
    }
    const blocked = await login("1234");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
    });
  });

  it("keys separately per NIP", async () => {
    expect((await login("5678")).status).toBe(200);
  });
});
