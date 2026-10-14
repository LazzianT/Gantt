import { ForbiddenError, NotFoundError, ValidationError } from "../../middleware/error.js";
import { writeActivity } from "../activity/activity.repository.js";
import { projectIdOfTask } from "../tasks/tasks.repository.js";
import {
  getById,
  insertEvidence,
  listByTask,
  remove,
  toEvidenceDTO,
  type EvidenceDTO,
  type Exec,
} from "./evidence.repository.js";
import {
  assertAllowedEvidenceFile,
  deleteEvidenceFile,
  resolveEvidencePath,
  saveEvidenceFile,
} from "./evidence.storage.js";

export { type Exec } from "./evidence.repository.js";

export interface EvidenceInput {
  note?: string | null;
  file?: { originalName: string; buffer: Buffer; mimeType?: string } | null;
}

export interface EvidenceFile {
  absolutePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

/**
 * Records evidence against a task. The note and the file are both optional individually, and an
 * entirely empty submission is a no-op rather than an error: callers legitimately reach this
 * point with nothing to attach, and the caller decides whether that is worth reporting.
 */
export async function addEvidence(
  exec: Exec,
  taskId: number,
  employeeNip: string,
  input: EvidenceInput,
): Promise<EvidenceDTO | null> {
  const note = input.note?.trim();
  const hasNote = note != null && note.length > 0;
  if (hasNote && note.length > 2000) throw new ValidationError("note must be at most 2000 characters");
  if (!hasNote && !input.file) return null;

  const stored = input.file ? await persistFile(input.file) : null;

  try {
    const row = await insertEvidence(exec, {
      task_id: taskId,
      note: hasNote ? note! : null,
      file_name: input.file?.originalName ?? null,
      stored_name: stored?.storedName ?? null,
      mime_type: input.file?.mimeType ?? null,
      size_bytes: stored?.size ?? null,
      uploaded_by_nip: employeeNip,
    });
    if (!row) throw new NotFoundError("Task not found");

    await writeActivity(exec, {
      project_id: await requireTask(exec, taskId),
      entity_type: "task_evidence",
      entity_id: row.evidence_id,
      action: "create",
      actor_nip: employeeNip,
      detail: {
        task_id: taskId,
        has_file: input.file != null,
        note_preview: hasNote ? note!.slice(0, 200) : null,
      },
    });

    return toEvidenceDTO(row);
  } catch (err) {
    // The row never landed, so the file would be orphaned on disk.
    if (stored) await deleteEvidenceFile(stored.storedName, new Date());
    throw err;
  }
}

export async function listTaskEvidence(exec: Exec, taskId: number): Promise<EvidenceDTO[]> {
  return (await listByTask(exec, taskId)).map(toEvidenceDTO);
}

export async function getEvidenceFile(exec: Exec, evidenceId: number): Promise<EvidenceFile> {
  const row = await getById(exec, evidenceId);
  if (!row) throw new NotFoundError("Evidence not found");
  if (!row.stored_name) throw new NotFoundError("Evidence has no attached file");
  return {
    absolutePath: resolveEvidencePath(row.stored_name, row.created_at),
    fileName: row.file_name ?? "evidence",
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
  };
}

/** Only the uploader may retract their own evidence. */
export async function deleteEvidence(exec: Exec, evidenceId: number, employeeNip: string): Promise<void> {
  const deleted = await remove(exec, evidenceId, employeeNip);
  if (!deleted) {
    if (!(await getById(exec, evidenceId))) throw new NotFoundError("Evidence not found");
    throw new ForbiddenError("Only the uploader can delete this evidence");
  }
  if (deleted.stored_name) await deleteEvidenceFile(deleted.stored_name, deleted.created_at);
}

async function persistFile(file: NonNullable<EvidenceInput["file"]>): Promise<{ storedName: string; size: number }> {
  assertAllowedEvidenceFile(file.originalName, file.mimeType);
  const saved = await saveEvidenceFile(file.originalName, file.buffer);
  return { storedName: saved.storedName, size: saved.size };
}

async function requireTask(exec: Exec, taskId: number): Promise<number> {
  const projectId = await projectIdOfTask(exec, taskId);
  if (projectId == null) throw new NotFoundError("Task not found");
  return projectId;
}