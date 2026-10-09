const NEUTRAL = 'border-line bg-surface-sunken text-ink-secondary';

const STATUS: Record<string, { label: string; className: string; dot: string }> = {
  'Not Started': { label: 'Not Started', className: NEUTRAL, dot: '#98A2B3' },
  Planning: { label: 'Planning', className: NEUTRAL, dot: '#98A2B3' },
  'On Hold': { label: 'On Hold', className: NEUTRAL, dot: '#98A2B3' },
  'In Progress': { label: 'In Progress', className: 'border-[#D7DDFB] bg-tint-blue text-[#3B4BD8]', dot: '#5865F2' },
  Active: { label: 'Active', className: 'border-[#D7DDFB] bg-tint-blue text-[#3B4BD8]', dot: '#5865F2' },
  Completed: { label: 'Completed', className: 'border-[#CBEFE8] bg-tint-mint text-[#0F8A7C]', dot: '#12A594' },
  Blocked: { label: 'Blocked', className: 'border-[#F8D4D2] bg-tint-coral text-[#C43D3D]', dot: '#E5484D' },
  Missed: { label: 'Missed', className: 'border-[#F8D4D2] bg-tint-coral text-[#C43D3D]', dot: '#E5484D' },
  Cancelled: { label: 'Cancelled', className: 'border-line bg-surface-subtle text-ink-muted', dot: '#A6AFC2' },
};

export function statusDot(status: string): string {
  return (STATUS[status] ?? { dot: '#98A2B3' }).dot;
}

export default function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  const meta = STATUS[status] ?? { label: status, className: NEUTRAL, dot: '#98A2B3' };
  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-xs border px-1.5 text-2xs font-semibold ${meta.className} ${className}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.dot }} aria-hidden />
      {meta.label}
    </span>
  );
}
