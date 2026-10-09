/** Parameterized query runner; `query` from db/pool satisfies this. */
export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface ActivityInput {
  project_id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  actor_nip?: string | null;
  detail?: unknown;
}

export const MAX_ACTIVITY_LIMIT = 200;
const MAX_DETAIL_LENGTH = 8000;

/** JSON-encode the diff; oversized payloads are truncated so log rows stay bounded. */
function encodeDetail(detail: unknown): string | null {
  if (detail == null) return null;
  try {
    const json = JSON.stringify(detail);
    if (json == null) return null;
    return json.length > MAX_DETAIL_LENGTH ? `${json.slice(0, MAX_DETAIL_LENGTH - 3)}...` : json;
  } catch {
    return null;
  }
}

export async function writeActivity(exec: Exec, data: ActivityInput): Promise<void> {
  await exec(
    `INSERT INTO pm.project_activity_logs (project_id, entity_type, entity_id, action, actor_nip, detail)
     VALUES (@project_id, @entity_type, @entity_id, @action, @actor_nip, @detail)`,
    {
      project_id: data.project_id,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      action: data.action,
      actor_nip: data.actor_nip ?? null,
      detail: encodeDetail(data.detail),
    },
  );
}

export async function listActivity(exec: Exec, projectId: number, limit = 50): Promise<any[]> {
  const top = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_ACTIVITY_LIMIT);
  return exec(
    `SELECT TOP (@top) log_id, project_id, entity_type, entity_id, action, actor_nip, detail, created_at
     FROM pm.project_activity_logs
     WHERE project_id = @projectId
     ORDER BY created_at DESC, log_id DESC`,
    { projectId, top },
  );
}
