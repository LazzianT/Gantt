import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Throttle login per IP+NIP: caps single-account brute force while several IPs cannot lock an account out alone.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as { nip?: unknown } | undefined;
    const nip = typeof body?.nip === "string" ? body.nip.trim() : "";
    return `${ipKeyGenerator(req.ip ?? "")}:${nip}`;
  },
  statusCode: 429,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
  },
});
