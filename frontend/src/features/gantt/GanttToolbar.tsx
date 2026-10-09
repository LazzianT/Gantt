import type { ReactNode } from 'react';
import {
  CalendarDays,
  ChevronsDownUp,
  ChevronsUpDown,
  Minus,
  Plus,
  RefreshCw,
  Route,
  Ruler,
} from 'lucide-react';
import type { Scale } from './useGanttData';

const SCALES: Scale[] = ['Day', 'Week', 'Month', 'Quarter'];
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

interface GanttToolbarProps {
  scale: Scale;
  onScale: (scale: Scale) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  compressed: boolean;
  onCompressed: (compressed: boolean) => void;
  criticalOnly: boolean;
  onCriticalOnly: (value: boolean) => void;
  hasBaseline: boolean;
  showBaseline: boolean;
  onShowBaseline: (value: boolean) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onToday: () => void;
  onRefresh: () => void;
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 items-center justify-center gap-1 rounded-sm px-2 text-xs font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 ${
        active ? 'bg-brand-soft text-brand' : 'text-ink-secondary hover:bg-surface-subtle'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px bg-line" aria-hidden />;
}

export default function GanttToolbar({
  scale,
  onScale,
  zoom,
  onZoom,
  compressed,
  onCompressed,
  criticalOnly,
  onCriticalOnly,
  hasBaseline,
  showBaseline,
  onShowBaseline,
  onExpandAll,
  onCollapseAll,
  onToday,
  onRefresh,
}: GanttToolbarProps) {
  const step = (delta: number) =>
    onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + delta) * 20) / 20)));

  return (
    <div className="flex h-12 shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface px-3">
      <div
        role="group"
        aria-label="Time scale"
        className="flex items-center gap-0.5 rounded-sm border border-line bg-surface-subtle p-0.5"
      >
        {SCALES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={scale === option}
            onClick={() => onScale(option)}
            className={`h-6 rounded-xs px-2 text-xs font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus ${
              scale === option ? 'bg-surface text-brand shadow-xs' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <Divider />

      <div role="group" aria-label="Zoom" className="flex items-center gap-0.5">
        <ToolButton label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => step(-0.05)}>
          <Minus size={15} />
        </ToolButton>
        <span className="w-10 text-center text-2xs tabular text-ink-muted">{Math.round(zoom * 100)}%</span>
        <ToolButton label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => step(0.05)}>
          <Plus size={15} />
        </ToolButton>
      </div>

      <Divider />

      <ToolButton label="Working days only" active={compressed} onClick={() => onCompressed(!compressed)}>
        Working days
      </ToolButton>
      <ToolButton label="Critical path" active={criticalOnly} onClick={() => onCriticalOnly(!criticalOnly)}>
        <Route size={15} />
        Critical
      </ToolButton>
      <ToolButton
        label={hasBaseline ? 'Show baseline' : 'No baseline captured yet'}
        active={showBaseline}
        disabled={!hasBaseline}
        onClick={() => onShowBaseline(!showBaseline)}
      >
        <Ruler size={15} />
        Baseline
      </ToolButton>

      <Divider />

      <ToolButton label="Expand all" onClick={onExpandAll}>
        <ChevronsUpDown size={15} />
      </ToolButton>
      <ToolButton label="Collapse all" onClick={onCollapseAll}>
        <ChevronsDownUp size={15} />
      </ToolButton>

      <div className="ml-auto flex items-center gap-1">
        <ToolButton label="Scroll to today" onClick={onToday}>
          <CalendarDays size={15} />
          Today
        </ToolButton>
        <ToolButton label="Refresh schedule" onClick={onRefresh}>
          <RefreshCw size={15} />
        </ToolButton>
      </div>
    </div>
  );
}
