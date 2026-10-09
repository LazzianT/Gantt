const HEALTH: Record<string, { className: string; dot: string }> = {
  'On Track': { className: 'border-[#CBEFE8] bg-tint-mint text-[#0F8A7C]', dot: '#12A594' },
  'At Risk': { className: 'border-[#F4E1AE] bg-tint-amber text-[#9A6B00]', dot: '#E5A100' },
  Delayed: { className: 'border-[#F7D6BC] bg-[#FFEEE0] text-[#B0592A]', dot: '#E5692B' },
  Critical: { className: 'border-[#F8D4D2] bg-tint-coral text-[#C43D3D]', dot: '#E5484D' },
};

export function healthDot(health: string): string {
  return HEALTH[health]?.dot ?? '#98A2B3';
}

export default function HealthPill({ health, className = '' }: { health: string; className?: string }) {
  const meta = HEALTH[health];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-xs border px-1.5 text-2xs font-semibold ${meta.className} ${className}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.dot }} aria-hidden />
      {health}
    </span>
  );
}
