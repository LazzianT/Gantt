import { ROW_HEIGHT } from './useGanttData';
import type { Dependency } from './api';

export interface DepGeometry {
  left: number;
  width: number;
  row: number;
  critical: boolean;
}

interface DependencyLayerProps {
  dependencies: Dependency[];
  geometry: Map<number, DepGeometry>;
  totalWidth: number;
  totalHeight: number;
}

const COLOR = '#7A8699';
const CRITICAL = '#DC2626';

/** Orthogonal (Manhattan) link from a predecessor anchor to a successor anchor. */
function pathFor(
  type: Dependency['dependencyType'],
  from: DepGeometry,
  to: DepGeometry,
): string | null {
  const y1 = from.row * ROW_HEIGHT + ROW_HEIGHT / 2;
  const y2 = to.row * ROW_HEIGHT + ROW_HEIGHT / 2;
  const fromLeft = type === 'SS' || type === 'SF';
  const toLeft = type === 'FS' || type === 'SS';
  const x1 = fromLeft ? from.left : from.left + from.width;
  const x2 = toLeft ? to.left : to.left + to.width;
  const stub = 8;

  let mx = (x1 + x2) / 2;
  const startSign = fromLeft ? -1 : 1;
  const endSign = toLeft ? -1 : 1;
  if (startSign < 0 && mx > x1 - stub) mx = x1 - stub;
  if (startSign > 0 && mx < x1 + stub) mx = x1 + stub;
  if (endSign < 0 && mx > x2 - stub) mx = x2 - stub;
  if (endSign > 0 && mx < x2 + stub) mx = x2 + stub;

  return `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`;
}

export default function DependencyLayer({
  dependencies,
  geometry,
  totalWidth,
  totalHeight,
}: DependencyLayerProps) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0"
      width={totalWidth}
      height={totalHeight}
    >
      <defs>
        <marker id="gantt-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={COLOR} />
        </marker>
        <marker
          id="gantt-arrow-critical"
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill={CRITICAL} />
        </marker>
      </defs>
      {dependencies.map((dep) => {
        const from = geometry.get(dep.predecessorTaskId);
        const to = geometry.get(dep.successorTaskId);
        if (!from || !to) return null;
        const path = pathFor(dep.dependencyType, from, to);
        if (!path) return null;
        const critical = from.critical || to.critical;
        return (
          <path
            key={dep.id}
            d={path}
            fill="none"
            stroke={critical ? CRITICAL : COLOR}
            strokeWidth={1.5}
            markerEnd={critical ? 'url(#gantt-arrow-critical)' : 'url(#gantt-arrow)'}
          >
            <title>
              {dep.dependencyType}
              {dep.lagDays ? ` +${dep.lagDays}d` : ''}
            </title>
          </path>
        );
      })}
    </svg>
  );
}
