export type ProgressTone = 'brand' | 'amber' | 'danger' | 'health';

const HEALTH_FILL: Record<string, string> = {
  'On Track': 'bg-teal',
  'At Risk': 'bg-warning',
  Delayed: 'bg-health-delayed',
  Critical: 'bg-danger',
};

const TONE_FILL: Record<Exclude<ProgressTone, 'health'>, string> = {
  brand: 'bg-brand',
  amber: 'bg-warning',
  danger: 'bg-danger',
};

interface ProgressBarProps {
  value: number;
  size?: 'xs' | 'sm';
  tone?: ProgressTone;
  health?: string;
  label?: string;
  className?: string;
  ariaLabel?: string;
}

export default function ProgressBar({
  value,
  size = 'sm',
  tone = 'brand',
  health,
  label,
  className = '',
  ariaLabel = 'Progress',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const fill = tone === 'health' ? (HEALTH_FILL[health ?? ''] ?? TONE_FILL.brand) : TONE_FILL[tone];
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={label}
        className={`min-w-[24px] flex-1 overflow-hidden rounded-full bg-surface-sunken ${
          size === 'xs' ? 'h-1' : 'h-1.5'
        }`}
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-slow ease-out ${fill}`}
          style={{ width: `${clamped}%` }}
        />
      </span>
      {label && <span className="shrink-0 text-xs tabular text-ink-secondary">{label}</span>}
    </span>
  );
}
