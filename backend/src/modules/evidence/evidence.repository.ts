/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface EvidenceRow {
  evidence_id: number;
  task_id: number;
  note: string | null;
  file_name: string | null;
  stored_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by_nip: string | null;
  created_at: Date | string;
}

export interface InsertEvidenceData {
  task_id: number;
  note?: string | null;
  file_name?: string | null;
  stored_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  uploaded_by_nip?: string | null;
}

const SELECT = `SELECT evidence_id, task_id, note, file_name, stored_name, mime_type, size_bytes,
       uploaded_by_nip, created_at
FROM pm.task_evidence`;

export async function insertEvidence(exec: Exec, data: InsertEvidenceData): Promise<EvidenceRow | null> {
  const rows = await exec(
    `INSERT INTO pm.task_evidence
       (task_id, note, file_name, stored_name, mime_type, size_bytes, uploaded_by_nip)
     OUTPUT INSERTED.evidence_id, INSERTED.task_id, INSERTED.note, INSERTED.file_name, INSERTED.stored_name,
            INSERTED.mime_type, INSERTED.size_bytes, INSERTED.uploaded_by_nip, INSERTED.created_at
     VALUES (@task_id, @note, @file_name, @stored_name, @mime_type, @size_bytes, @uploaded_by_nip)`,
    {
      task_id: data.task_id,
      note: data.note ?? null,
      file_name: data.file_name ?? null,
      stored_name: data.stored_name ?? null,
      mime_type: data.mime_type ?? null,
      size_bytes: data.size_bytes ?? null,
      uploaded_by_nip: data.uploaded_by_nip ?? null,
    },
  );
  return (rows[0] as EvidenceRow | undefined) ?? null;
}

export async function listByTask(exec: Exec, taskId: number): Promise<EvidenceRow[]> {
  return exec(`${SELECT} WHERE task_id = @taskId ORDER BY created_at DESC, evidence_id DESC`, { taskId });
}

export async function getById(exec: Exec, evidenceId: number): Promise<EvidenceRow | null> {
  const rows = await exec(`${SELECT} WHERE evidence_id = @evidenceId`, { evidenceId });
  return (rows[0] as EvidenceRow | undefined) ?? null;
}

export async function remove(exec: Exec, evidenceId: number, employeeNip: string): Promise<EvidenceRow | null> {
  const rows = await exec(
    `DELETE FROM pm.task_evidence
     OUTPUT DELETED.stored_name, DELETED.created_at
     WHERE evidence_id = @evidenceId AND uploaded_by_nip = @employeeNip`,
    { evidenceId, employeeNip },
  );
  const deleted = rows[0] as { stored_name?: string | null; created_at?: Date | string } | undefined;
  if (!deleted) return null;
  return {
    evidence_id: evidenceId,
    task_id: 0,
    note: null,
    file_name: null,
    stored_name: deleted.stored_name ?? null,
    mime_type: null,
    size_bytes: null,
    uploaded_by_nip: employeeNip,
    created_at: deleted.created_at ?? new Date(),
  };
}

/** Display shape sent to the client: internal stored_name never leaves the server. */
export interface EvidenceDTO {
  evidence_id: number;
  task_id: number;
  note: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  has_file: boolean;
  uploaded_by_nip: string | null;
  created_at: string;
}

export function toEvidenceDTO(row: EvidenceRow): EvidenceDTO {
  return {
    evidence_id: row.evidence_id,
    task_id: row.task_id,
    note: row.note,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes == null ? null : Number(row.size_bytes),
    has_file: row.stored_name != null,
    uploaded_by_nip: row.uploaded_by_nip,
    created_at: new Date(row.created_at).toISOString(),
  };
}