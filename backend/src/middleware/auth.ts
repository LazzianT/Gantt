import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { canManageProjects, type JwtUser, type Role } from "../modules/auth/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtUser;
    }
  }
}

const ROLES: readonly Role[] = ["admin", "manager", "member", "viewer"];

function reject(res: Response): void {
  res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid token" } });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reject(res);
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7).trim(), env.jwt.secret, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
    const { sub, email, name, role, departCode } = payload;
    const hasIdentity = typeof name === "string" || typeof email === "string";
    if (typeof sub !== "string" || !hasIdentity || !ROLES.includes(role as Role)) {
      reject(res);
      return;
    }
    req.user = {
      sub,
      role: role as Role,
      ...(typeof name === "string" ? { name } : {}),
      ...(typeof email === "string" ? { email } : {}),
      ...(typeof departCode === "string" ? { departCode } : {}),
      ...(typeof payload.canManageProjects === "boolean"
        ? { canManageProjects: payload.canManageProjects }
        : {}),
    };
    next();
  } catch {
    reject(res);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      reject(res);
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient role" } });
      return;
    }
    next();
  };
}

/**
 * Guards project create/edit/delete. Access is granted by HRIS department
 * (see AUTH_PROJECT_DEPARTMENTS), not by role.
 */
export function requireProjectDepartment() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      reject(res);
      return;
    }
    if (!canManageProjects(req.user)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Your department is not authorized to manage projects",
        },
      });
      return;
    }
    next();
  };
}
