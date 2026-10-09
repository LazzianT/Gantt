import { env } from "../config/env.js";
import { closePool, getPool } from "../config/database.js";

async function listTables(): Promise<void> {
  if (!env.db.server || !env.db.user) {
    console.error("[tables] Database not configured. Set DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD in .env (see .env.example).");
    process.exit(1);
  }

  console.log(`[tables] target ${env.db.server}:${env.db.port} database "${env.db.database}" schema "pm"`);

  const pool = await getPool();
  const rows = await pool
    .request()
    .query<{ name: string }>("SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('pm') ORDER BY name");
  const names = rows.recordset.map((row) => row.name);
  console.log(`[tables] pm tables (${names.length}): ${names.join(", ")}`);
}

listTables()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error(`[tables] ${(error as Error).message}`);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
