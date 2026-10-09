import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ApiError } from '../../lib/api';

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-3 mt-3 flex items-center gap-3 rounded-sm border border-[#FECACA] bg-[#FEE2E2] px-3 py-2 text-sm text-[#B91C1C]"
    >
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onRetry} className="btn-secondary h-7 border-[#FECACA] bg-white">
        Retry
      </button>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-xs text-ink-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TabToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-toolbar flex h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3">
      {children}
    </div>
  );
}

/** Loads a value on mount and whenever `deps` change; keeps the last run to avoid stale closures. */
export function useAsync<T>(run: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const reload = useCallback(
    async (spinner = true) => {
      if (spinner) setLoading(true);
      setError(null);
      try {
        setData(await runRef.current());
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      } finally {
        if (spinner) setLoading(false);
      }
    },
    deps,
  );

  useEffect(() => {
    void reload(true);
  }, [reload]);

  return { data, setData, loading, error, setError, reload };
}
