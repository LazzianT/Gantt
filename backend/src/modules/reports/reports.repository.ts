export type Exec = (sql: string, params?: Record<string, unknown>) => Promise<any[]>;

export interface ReportsData {
  project: { project_id: number; code: string; name: string; status: string; health: string };
  summary: { tasks: number; completed: number; open: number; overdue: number; critical: number; variance_days: number | null };
  variance: Array<{
    task_id: number; name: string; baseline_finish: string | null; current_finish: string | null; variance_days: number | null; slip: boolean;
  }>;
  delays: Array<{
    task_id: number; name: string; pic_nip: string | null; finish_date: string | null; actual_finish: string | null; status: string; progress_percent: number; is_critical: boolean; days_overdue: number;
  }>;
  audit: Array<{
    kind: 'activity' | 'evidence' | 'approval'; id: number; task_id: number | null; task_name: string | null; actor_nip: string | null; action: string; detail: string | null; created_at: string;
  }>;
}

function rows<T>(value: any[]): T[] { return value as T[]; }

export async function getReports(exec: Exec, projectId: number): Promise<ReportsData | null> {
  const [project, tasks, baseline, activity, evidence] = await Promise.all([
    exec(`SELECT project_id, code, name, status, health FROM pm.projects WHERE project_id = @projectId AND is_deleted = 0`, { projectId }),
    exec(`SELECT task_id, name, pic_nip, finish_date, actual_finish, status, progress_percent, is_critical FROM pm.project_tasks WHERE project_id = @projectId AND is_deleted = 0`, { projectId }),
    exec(`SELECT TOP 1 b.baseline_id FROM pm.project_baselines b WHERE b.project_id = @projectId ORDER BY b.captured_at DESC, b.baseline_id DESC`, { projectId }),
    exec(`SELECT TOP (@limit) l.log_id, l.entity_id, l.action, l.actor_nip, l.detail, l.created_at, t.name AS task_name FROM pm.project_activity_logs l LEFT JOIN pm.project_tasks t ON t.task_id = l.entity_id WHERE l.project_id = @projectId ORDER BY l.created_at DESC, l.log_id DESC`, { projectId, limit: 100 }),
    exec(`SELECT TOP (@limit) e.evidence_id, e.task_id, e.uploaded_by_nip, e.note, e.created_at, t.name AS task_name FROM pm.task_evidence e JOIN pm.project_tasks t ON t.task_id = e.task_id WHERE t.project_id = @projectId ORDER BY e.created_at DESC, e.evidence_id DESC`, { projectId, limit: 100 }),
  ]);
  if (!project[0]) return null;
  const taskRows = rows<any>(tasks);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = (v: any) => v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  const dayDiff = (a: string | null, b: string) => a ? Math.max(0, Math.floor((Date.parse(b) - Date.parse(a)) / 86400000)) : 0;
  const delays = taskRows.filter((t) => t.status !== 'Completed' && t.finish_date && iso(t.finish_date)! < iso(today)!).map((t) => ({ ...t, finish_date: iso(t.finish_date), actual_finish: iso(t.actual_finish), progress_percent: Number(t.progress_percent), is_critical: Boolean(t.is_critical), days_overdue: dayDiff(iso(t.finish_date), iso(today)!) }));
  const variance: ReportsData['variance'] = [];
  if (baseline[0]) {
    const baselineRows = await exec(`SELECT bt.task_id, t.name, bt.finish_date AS baseline_finish, t.finish_date AS current_finish FROM pm.project_baseline_tasks bt JOIN pm.project_tasks t ON t.task_id = bt.task_id WHERE bt.baseline_id = @baselineId AND t.is_deleted = 0`, { baselineId: baseline[0].baseline_id });
    for (const row of baselineRows) {
      const base = iso(row.baseline_finish); const current = iso(row.current_finish); const varianceDays = base && current ? Math.round((Date.parse(current) - Date.parse(base)) / 86400000) : null;
      variance.push({ task_id: row.task_id, name: row.name, baseline_finish: base, current_finish: current, variance_days: varianceDays, slip: varianceDays != null && varianceDays > 0 });
    }
  }
  const audit: ReportsData['audit'] = [
    ...activity.map((r) => ({ kind: r.action === 'approve_actual_finish' || r.action === 'reject_actual_finish' ? 'approval' as const : 'activity' as const, id: Number(r.log_id), task_id: r.entity_id, task_name: r.task_name ?? null, actor_nip: r.actor_nip, action: r.action, detail: r.detail, created_at: new Date(r.created_at).toISOString() })),
    ...evidence.map((r) => ({ kind: 'evidence' as const, id: Number(r.evidence_id), task_id: r.task_id, task_name: r.task_name, actor_nip: r.uploaded_by_nip, action: 'evidence', detail: r.note, created_at: new Date(r.created_at).toISOString() })),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100);
  return {
    project: project[0],
    summary: { tasks: taskRows.length, completed: taskRows.filter((t) => t.status === 'Completed').length, open: taskRows.filter((t) => t.status !== 'Completed').length, overdue: delays.length, critical: taskRows.filter((t) => t.is_critical).length, variance_days: variance.length ? Math.max(...variance.map((v) => v.variance_days ?? 0)) : null },
    variance: variance.sort((a, b) => (b.variance_days ?? -999) - (a.variance_days ?? -999)),
    delays: delays.sort((a, b) => b.days_overdue - a.days_overdue),
    audit,
  };
}