import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { ValidationError } from "../../middleware/error.js";
import { loginRateLimiter } from "../../middleware/rate-limit.js";
import { createEmployeeProvider } from "../employees/index.js";
import { loginWithNip, me } from "./auth.service.js";

const loginSchema = z.object({
  nip: z.string().trim().min(1),
  birthDate: z.string().trim().min(1),
});

const provider = createEmployeeProvider((sql, params) => query(sql, params));

export const authRouter = Router();

authRouter.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid NIP or date of birth");
    res.json({ data: await loginWithNip(provider, parsed.data) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ data: me(req.user!) });
});
