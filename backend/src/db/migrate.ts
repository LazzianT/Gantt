import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectionPool } from "mssql";
import { env } from "../config/env.js";
import { closePool, getPool } from "../config/database.js";

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql");

function log(message: string): void {
  console.log(`[migrate] ${message}`);
}

/** Split a script on standalone `GO` lines (batch separator, not T-SQL). */
export function splitBatches(script: string): string[] {
  return script
    .split(/^\s*GO\s*;?\s*$/gim)
    .map((batch) => batch.trim())
    .filter((batch) => batch.length > 0);
}

async function ensureMigrationTable(pool: ConnectionPool): Promise<void> {
  const bootstrap = [
    "IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'pm') EXEC('CREATE SCHEMA pm')",
    `IF OBJECT_ID('pm.schema_migrations','U') IS NULL
     CREATE TABLE pm.schema_migrations (
       filename   NVARCHAR(255) NOT NULL CONSTRAINT PK_pm_schema_migrations PRIMARY KEY,
       applied_at DATETIME2(3)  NOT NULL CONSTRAINT DF_pm_schema_migrations_applied_at DEFAULT SYSUTCDATETIME()
     )`,
  ];
  for (const batch of bootstrap) {
    await pool.request().query(batch);
  }
}

async function applyPending(): Promise<void> {
  if (!env.db.server || !env.db.user) {
    console.error("[migrate] Database not configured. Set DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD in .env (see .env.example).");
    process.exit(1);
  }

  if (!fs.existsSync(SQL_DIR)) {
    console.error(`[migrate] SQL directory not found: ${SQL_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(SQL_DIR)
    .filter((file) => file.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  log(`target ${env.db.server}:${env.db.port} database "${env.db.database}" schema "pm"`);

  const pool = await getPool();
  await ensureMigrationTable(pool);

  const appliedRows = await pool
    .request()
    .query<{ filename: string }>("SELECT filename FROM pm.schema_migrations");
  const applied = new Set(appliedRows.recordset.map((row) => row.filename));

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      log(`skip ${file}`);
      continue;
    }

    const script = fs.readFileSync(path.join(SQL_DIR, file), "utf8");
    const batches = splitBatches(script);
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      for (const batch of batches) {
        await transaction.request().query(batch);
      }
      await transaction
        .request()
        .input("filename", file)
        .query("INSERT INTO pm.schema_migrations (filename) VALUES (@filename)");
      await transaction.commit();
      appliedCount += 1;
      log(`applied ${file}`);
    } catch (error) {
      await transaction.rollback();
      throw new Error(`Migration failed: ${file}\n${(error as Error).message}`);
    }
  }

  log(appliedCount === 0 ? "up to date" : `done, ${appliedCount} applied`);

  const tableRows = await pool
    .request()
    .query<{ name: string }>("SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('pm') ORDER BY name");
  const tableNames = tableRows.recordset.map((row) => row.name);
  log(`pm tables (${tableNames.length}): ${tableNames.join(", ")}`);
}

applyPending()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error(`[migrate] ${(error as Error).message}`);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
