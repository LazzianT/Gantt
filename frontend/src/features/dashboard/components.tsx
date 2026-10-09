import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { relativeTime } from '../../lib/format';

/** `on_hold` / "On Hold" → "On Hold"; feeds StatusPill/HealthPill which key on Title Case. */
export function labelize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function RelativeTime({ iso }: { iso: string | null | undefined }) {
  const text = relativeTime(iso);
  if (!text) return null;
  return (
    <time dateTime={iso ?? undefined} title={iso ?? undefined} className="shrink-0 text-2xs text-ink-muted">
      {text}
    </time>
  );
}

export function StatCard({
  label,
  value,
  hint,
  to,
  tone = 'default',
  children,
}: {
  label: string;
  value: number | string;
  hint?: string;
  to?: string;
  tone?: 'default' | 'danger';
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <div
        className={`mt-2 text-2xl font-bold leading-none tabular ${
          tone === 'danger' ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {hint && <p className="mt-1.5 text-2xs text-ink-muted">{hint}</p>}
      {children}
    </>
  );

  const className =
    'block rounded-xl border border-line bg-surface p-4 shadow-xs transition-[box-shadow,border-color] duration-fast ease-out hover:border-brand/30 hover:shadow-sm focus-visible:outline-none focus-visible:shadow-focus';

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs ${className}`}>
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </header>
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-muted">{children}</p>;
}

export function CriticalFlag() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-xs border border-danger/20 bg-danger-soft px-1.5 text-2xs font-semibold text-danger">
      Critical
    </span>
  );
}
