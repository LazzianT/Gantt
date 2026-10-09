const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(iso: string | null | undefined): [string, string, string] | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d || Number.isNaN(Number(m))) return null;
  return [y, m, d];
}

/** "Mar 03" — no timezone shift; ISO date prefixes parsed as-is. */
export function shortDate(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${MONTHS[Number(p[1]) - 1]} ${p[2]}` : '—';
}

/** "Mar 03, 2026" */
export function fullDate(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${MONTHS[Number(p[1]) - 1]} ${p[2]}, ${p[0]}` : '—';
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const minutes = Math.round(Math.abs(Date.now() - t) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}
