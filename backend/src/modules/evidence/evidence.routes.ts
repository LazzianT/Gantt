import { Router, type ErrorRequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../../config/env.js";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../middleware/auth.js";
import { ValidationError } from "../../middleware/error.js";
import {
  guardProject,
  projectOfEvidence,
  projectOfTask,
  requireTaskPic,
} from "../../middleware/project-membership.js";
import type { Exec } from "./evidence.repository.js";
import { addEvidence, deleteEvidence, getEvidenceFile, listTaskEvidence } from "./evidence.service.js";

const noteSchema = z.object({ note: z.string().max(2000).nullish() });

const exec: Exec = (sql, params) => query(sql, params);

const guardTask = guardProject({ exec }, projectOfTask);
const guardTaskPic = requireTaskPic({ exec, bypassRoles: ["admin", "manager"] });
const guardEvidence = guardProject({ exec }, projectOfEvidence);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.uploads.maxEvidenceBytes, files: 1 },
});

function idParam(value: string, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${name}`);
  return n;
}

export const evidenceRouter = Router();
evidenceRouter.use(requireAuth);

/** Anyone in the project can read the evidence trail. */
evidenceRouter.get("/tasks/:id/evidence", guardTask, async (req, res, next) => {
  try {
    res.json({ data: await listTaskEvidence(exec, idParam(req.params.id)) });
  } catch (err) {
    next(err);
  }
});

/** Only the task PIC may attach evidence. An empty submission is accepted and does nothing. */
evidenceRouter.post("/tasks/:id/evidence", guardTaskPic, upload.single("file"), async (req, res, next) => {
  try {
    const nip = req.user?.sub;
    if (!nip) throw new ValidationError("Missing user identity");
    const parsed = noteSchema.safeParse({ note: req.body?.note });
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request body");
    const file = req.file;
    const created = await addEvidence(exec, idParam(req.params.id), nip, {
      note: parsed.data.note,
      file: file ? { originalName: file.originalname, buffer: file.buffer, mimeType: file.mimetype } : null,
    });
    res.status(created ? 201 : 200).json({ data: created });
  } catch (err) {
    next(err);
  }
});

evidenceRouter.get("/evidence/:id/file", guardEvidence, async (req, res, next) => {
  try {
    const file = await getEvidenceFile(exec, idParam(req.params.id));
    res.setHeader("Content-Type", file.mimeType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(file.absolutePath, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
});

evidenceRouter.delete("/evidence/:id", guardEvidence, async (req, res, next) => {
  try {
    const nip = req.user?.sub;
    if (!nip) throw new ValidationError("Missing user identity");
    await deleteEvidence(exec, idParam(req.params.id), nip);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** Multer surfaces its own errors; translate them into the app's error shape. */
const uploadErrorHandler: ErrorRequestHandler = (err, _req, _res, next) => {
  if (err instanceof multer.MulterError) {
    next(new ValidationError(err.code === "LIMIT_FILE_SIZE" ? "File is too large" : `Upload rejected: ${err.code}`));
    return;
  }
  next(err);
};
evidenceRouter.use(uploadErrorHandler);