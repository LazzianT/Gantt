import { BarChart3, ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { fullDate } from '../../lib/format';

interface ProjectRow {
  project_id: number;
  code: string;
  name: string;
  status: string;
  health: string;
  target_end_date: string | null;
  weighted_progress: number;
  overdue_tasks: number;
}

export default function ReportsIndexPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api<ProjectRow[]>('/portfolio')
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load projects.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-6 lg:px-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <BarChart3 size={20} aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Reports</h1>
            <p className="mt-1 text-sm text-ink-secondary">Choose a project to open its schedule and audit reports.</p>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={load} aria-label="Refresh reports">
          <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
        </button>
      </header>

      {error && <p role="alert" className="mt-5 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && projects.length === 0 ? (
        <div aria-busy="true" className="mt-6 space-y-2">{[1, 2, 3].map((row) => <div key={row} className="skeleton h-16 rounded-xl" />)}</div>
      ) : projects.length === 0 ? (
        <p className="mt-8 text-center text-sm text-ink-muted">No projects available.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b border-line bg-surface-subtle text-left text-xs font-semibold text-ink-muted"><th className="px-4 py-3">Project</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Overdue</th><th className="px-4 py-3">Target end</th><th className="px-4 py-3" /></tr></thead>
            <tbody>{projects.map((project) => <tr key={project.project_id} className="border-b border-line-hairline last:border-0 hover:bg-surface-subtle"><td className="px-4 py-3"><p className="font-semibold text-ink">{project.name}</p><p className="text-xs text-ink-muted">{project.code}</p></td><td className="px-4 py-3 text-xs text-ink-secondary">{project.status}</td><td className="px-4 py-3 text-xs tabular text-ink-secondary">{Math.round(project.weighted_progress)}%</td><td className={`px-4 py-3 text-xs tabular ${project.overdue_tasks > 0 ? 'font-semibold text-danger' : 'text-ink-secondary'}`}>{project.overdue_tasks}</td><td className="px-4 py-3 text-xs text-ink-secondary">{fullDate(project.target_end_date)}</td><td className="px-4 py-3 text-right"><Link className="btn-secondary gap-1" to={`/projects/${project.project_id}?tab=reports`}>Open <ExternalLink size={14} /></Link></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}