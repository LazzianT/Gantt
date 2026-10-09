import { describe, expect, it } from "vitest";
import { readEnv } from "./env.js";

const DB = { DB_SERVER: "srv", DB_USER: "usr", DB_PASSWORD: "pw" };

describe("readEnv", () => {
  it("requires JWT_SECRET when NODE_ENV is not development (including unset)", () => {
    expect(() => readEnv({ NODE_ENV: "production", ...DB })).toThrow(/JWT_SECRET/);
    expect(() => readEnv({ NODE_ENV: "staging", ...DB })).toThrow(/JWT_SECRET/);
    expect(() => readEnv({ ...DB })).toThrow(/JWT_SECRET/);
  });

  it("requires DB credentials when NODE_ENV is not development", () => {
    expect(() => readEnv({ NODE_ENV: "production", JWT_SECRET: "real-secret" })).toThrow(/DB_SERVER/);
    expect(() => readEnv({ NODE_ENV: "production", JWT_SECRET: "real-secret", DB_SERVER: "s" })).toThrow(
      /DB_USER/,
    );
  });

  it("rejects the development default as an explicit JWT_SECRET", () => {
    expect(() => readEnv({ NODE_ENV: "production", JWT_SECRET: "dev-insecure-secret", ...DB })).toThrow(
      /dev-insecure-secret/,
    );
    expect(() => readEnv({ NODE_ENV: "development", JWT_SECRET: "dev-insecure-secret" })).toThrow(
      /dev-insecure-secret/,
    );
  });

  it("allows the dev default only when JWT_SECRET is unset in development", () => {
    const config = readEnv({ NODE_ENV: "development" });
    expect(config.isDev).toBe(true);
    expect(config.jwt.secret).toBe("dev-insecure-secret");
  });
});
