import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { getPool } from "./config/database.js";

const app = createApp((a) => {
  a.get("/readyz", async (_req, res) => {
    try {
      const pool = await getPool();
      await pool.request().query("SELECT 1 AS ok");
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
});

app.listen(env.port, () => {
  console.log(`gantt-backend listening on port ${env.port}`);
});
