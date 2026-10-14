import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceRow, Exec } from "./evidence.repository.js";
import { addEvidence, deleteEvidence, getEvidenceFile, listTaskEvidence } from "./evidence.service.js";
import * as storage from "./evidence.storage.js";

function evidenceRow(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    evidence_id: 5,
    task_id: 3,
    note: "done",
    file_name: null,
    stored_name: null,
    mime_type: null,
    size_bytes: null,
    uploaded_by_nip: "NIP-42",
    created_at: "2026-04-01T02:00:00.000Z",
    ...overrides,
  };
}

/** Minimal query planner: answers by table keyword, records the rest as writes. */
function fakeExec(rows: Record<string, any[]>) {
  const calls: { sql: string; params?: Record<string, unknown> }[] = [];
  const exec: Exec = async (sql, params) => {
    calls.push({ sql, params });
    for (const [needle, result] of Object.entries(rows)) {
      if (sql.includes(needle)) return result;
    }
    return [];
  };
  return { exec, calls };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("addEvidence", () => {
  it("treats an empty submission as a no-op instead of an error", async () => {
    const save = vi.spyOn(storage, "saveEvidenceFile");
    const { exec, calls } = fakeExec({});
    await expect(addEvidence(exec, 3, "NIP-42", { note: "   " })).resolves.toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("rejects an oversized note", async () => {
    const { exec } = fakeExec({});
    await expect(addEvidence(exec, 3, "NIP-42", { note: "x".repeat(2001) })).rejects.toThrow(
      "note must be at most 2000 characters",
    );
  });

  it("stores a note-only record and logs the activity", async () => {
    const { exec, calls } = fakeExec({
      "INSERT INTO pm.task_evidence": [evidenceRow({ note: "shipped" })],
      "FROM pm.project_tasks": [{ project_id: 7 }],
    });
    const result = await addEvidence(exec, 3, "NIP-42", { note: "  shipped  " });
    expect(result?.note).toBe("shipped");
    expect(result?.has_file).toBe(false);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO pm.task_evidence"));
    expect(insert?.params).toMatchObject({ task_id: 3, note: "shipped", uploaded_by_nip: "NIP-42" });
    expect(calls.some((c) => c.sql.includes("project_activity_logs"))).toBe(true);
  });

  it("rejects a disallowed file extension before touching the disk", async () => {
    const save = vi.spyOn(storage, "saveEvidenceFile");
    const { exec } = fakeExec({});
    await expect(
      addEvidence(exec, 3, "NIP-42", { file: { originalName: "payload.exe", buffer: Buffer.from("x") } }),
    ).rejects.toThrow("Unsupported file type");
    expect(save).not.toHaveBeenCalled();
  });

  it("removes the stored file when the insert fails", async () => {
    const save = vi
      .spyOn(storage, "saveEvidenceFile")
      .mockResolvedValue({ storedName: "abc.pdf", absolutePath: "/tmp/abc.pdf", size: 3 });
    const cleanup = vi.spyOn(storage, "deleteEvidenceFile").mockResolvedValue(undefined);
    const { exec } = fakeExec({});
    await expect(
      addEvidence(exec, 3, "NIP-42", { file: { originalName: "abc.pdf", buffer: Buffer.from("pdf") } }),
    ).rejects.toThrow("Task not found");
    expect(save).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith("abc.pdf", expect.any(Date));
  });
});

describe("listTaskEvidence", () => {
  it("never leaks the internal stored_name", async () => {
    const { exec } = fakeExec({
      "FROM pm.task_evidence": [evidenceRow({ stored_name: "deadbeef.pdf", file_name: "report.pdf" })],
    });
    const [item] = await listTaskEvidence(exec, 3);
    expect(item.has_file).toBe(true);
    expect(item.file_name).toBe("report.pdf");
    expect(JSON.stringify(item)).not.toContain("deadbeef");
  });
});

describe("getEvidenceFile", () => {
  it("rejects a note-only record", async () => {
    const { exec } = fakeExec({ "FROM pm.task_evidence": [evidenceRow()] });
    await expect(getEvidenceFile(exec, 5)).rejects.toThrow("Evidence has no attached file");
  });
});

describe("deleteEvidence", () => {
  it("refuses when the caller is not the uploader", async () => {
    const { exec } = fakeExec({
      "OUTPUT DELETED": [],
      "FROM pm.task_evidence": [evidenceRow({ uploaded_by_nip: "NIP-99" })],
    });
    await expect(deleteEvidence(exec, 5, "NIP-42")).rejects.toThrow("Only the uploader can delete this evidence");
  });

  it("removes the file from disk when the uploader deletes it", async () => {
    const cleanup = vi.spyOn(storage, "deleteEvidenceFile").mockResolvedValue(undefined);
    const { exec } = fakeExec({
      "OUTPUT DELETED": [{ stored_name: "deadbeef.pdf", created_at: "2026-04-01T02:00:00.000Z" }],
    });
    await deleteEvidence(exec, 5, "NIP-42");
    expect(cleanup).toHaveBeenCalledWith("deadbeef.pdf", "2026-04-01T02:00:00.000Z");
  });
});