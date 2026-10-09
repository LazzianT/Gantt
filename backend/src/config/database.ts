import sql from "mssql";
import { env } from "./env.js";

export const config: sql.config = {
  server: env.db.server,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  port: env.db.port,
  options: {
    encrypt: env.db.encrypt,
    trustServerCertificate: env.db.trustServerCertificate,
  },
  pool: {
    max: env.db.poolMax,
    min: env.db.poolMin,
    idleTimeoutMillis: 30000,
  },
  requestTimeout: env.db.queryTimeoutMs,
};

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect();
  }
  const promise = poolPromise;
  return promise;
}

export async function closePool(): Promise<void> {
  if (!poolPromise) return;
  const pool = await poolPromise.catch(() => null);
  if (pool) await pool.close();
  poolPromise = undefined;
}

export { sql };
