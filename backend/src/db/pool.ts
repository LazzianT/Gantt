import type { IResult } from "mssql";
import { getPool, sql } from "../config/database.js";

export type Params = Record<string, unknown>;

/**
 * Parameterized query. All user input must bind through `params`; never interpolate.
 */
export async function query<T = Record<string, unknown>>(text: string, params: Params = {}): Promise<T[]> {
  const pool = await getPool();
  const request = pool.request();
  for (const [name, value] of Object.entries(params)) {
    request.input(name, value);
  }
  const result = await request.query<T>(text);
  return result.recordset;
}

export async function queryOne<T = Record<string, unknown>>(text: string, params: Params = {}): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * For multi-statement batches where only the affected-row count matters.
 */
export async function execute(text: string, params: Params = {}): Promise<IResult<unknown>> {
  const pool = await getPool();
  const request = pool.request();
  for (const [name, value] of Object.entries(params)) {
    request.input(name, value);
  }
  return request.query(text) as Promise<IResult<unknown>>;
}

export { getPool, sql };
