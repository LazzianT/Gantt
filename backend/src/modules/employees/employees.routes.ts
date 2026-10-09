import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { NotFoundError, ValidationError } from "../../middleware/error.js";
import { createEmployeeProvider } from "./index.js";
import type { EmployeeProvider } from "./provider.js";

const SEARCH_MIN_Q = 2;

function parseLimit(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function createEmployeesRouter(
  provider: EmployeeProvider = createEmployeeProvider((sql, params) => query(sql, params)),
): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/employees/search", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < SEARCH_MIN_Q) throw new ValidationError("Query 'q' must be at least 2 characters");
      res.json({ data: await provider.searchEmployees(q, parseLimit(req.query.limit)) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/employees/:nip", async (req, res, next) => {
    try {
      const employee = await provider.getEmployee(req.params.nip);
      if (!employee) throw new NotFoundError("Employee not found");
      res.json({ data: employee });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
