import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(400, "VALIDATION_ERROR", message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, "CONFLICT", message);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = "Unprocessable entity") {
    super(422, "UNPROCESSABLE_ENTITY", message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable") {
    super(503, "SERVICE_UNAVAILABLE", message);
  }
}

export class ConflictCycleError extends AppError {
  constructor(cyclePath: (string | number)[]) {
    super(409, "CONFLICT_CYCLE", "Dependency cycle detected", { path: cyclePath });
  }
}

const KNOWN: Record<string, { status: number; code: string }> = {
  ValidationError: { status: 400, code: "VALIDATION_ERROR" },
  UnauthorizedError: { status: 401, code: "UNAUTHORIZED" },
  ForbiddenError: { status: 403, code: "FORBIDDEN" },
  NotFoundError: { status: 404, code: "NOT_FOUND" },
  ConflictError: { status: 409, code: "CONFLICT" },
  UnprocessableEntityError: { status: 422, code: "UNPROCESSABLE_ENTITY" },
};

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Not found: ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
    });
    return;
  }
  const name = err instanceof Error ? err.name : "";
  const known = KNOWN[name];
  if (known && err instanceof Error) {
    res.status(known.status).json({ error: { code: known.code, message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
}
