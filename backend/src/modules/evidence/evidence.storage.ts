import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { ValidationError } from "../../middleware/error.js";

/** Extensions accepted for task evidence. Anything else is rejected at the route boundary. */
export const ALLOWED_EVIDENCE_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "text/csv": ".csv",
};

const evidenceRoot = (): string => path.resolve(env.uploads.evidenceDir);

/** Rejects anything whose extension is not on the allow-list, regardless of the declared mime type. */
export function assertAllowedEvidenceFile(originalName: string, mimeType: string | undefined): void {
  const ext = path.extname(originalName).toLowerCase();
  const allowed = ALLOWED_EVIDENCE_EXTENSIONS as readonly string[];
  if (!allowed.includes(ext)) {
    throw new ValidationError(`Unsupported file type "${ext || originalName}". Allowed: ${allowed.join(", ")}`);
  }
  if (mimeType && mimeType !== "application/octet-stream" && !EXTENSION_BY_MIME[mimeType]) {
    throw new ValidationError(`Unsupported content type "${mimeType}"`);
  }
}

/** Shards by month so a single directory never accumulates every upload. */
function shardDir(now = new Date()): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return path.join(evidenceRoot(), year, month);
}

/** Content-hash prefix keeps repeated uploads of the same bytes from filling the disk. */
function buildStoredName(buffer: Buffer, originalName: string): string {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const ext = path.extname(originalName).toLowerCase();
  return `${hash}${ext}`;
}

export interface StoredFile {
  storedName: string;
  absolutePath: string;
  size: number;
}

export async function saveEvidenceFile(
  originalName: string,
  buffer: Buffer,
  now = new Date(),
): Promise<StoredFile> {
  const storedName = buildStoredName(buffer, originalName);
  const dir = shardDir(now);
  await mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, storedName);
  await writeFile(absolutePath, buffer);
  return { storedName, absolutePath, size: buffer.byteLength };
}

/** Best-effort cleanup: an orphan file on disk is preferable to a failed request. */
export async function deleteEvidenceFile(storedName: string, createdAt: Date | string): Promise<void> {
  const when = new Date(createdAt);
  if (Number.isNaN(when.getTime())) return;
  try {
    await unlink(path.join(shardDir(when), path.basename(storedName)));
  } catch {
    /* already gone */
  }
}

export function resolveEvidencePath(storedName: string, createdAt: Date | string): string {
  // basename() drops any traversal segment; the shard dir is derived from the stored timestamp.
  const when = new Date(createdAt);
  if (Number.isNaN(when.getTime())) throw new ValidationError("Invalid evidence timestamp");
  return path.join(shardDir(when), path.basename(storedName));
}