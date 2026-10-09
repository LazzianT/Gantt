interface TodayMarkerProps {
  x: number;
  height: number;
}

// Drawn under the sticky header (which owns a higher stacking order) so the line never covers it.
export default function TodayMarker({ x, height }: TodayMarkerProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0"
      style={{ left: x, height, zIndex: 5 }}
    >
      <div className="absolute inset-y-0 w-px bg-sched-today" />
      <div className="absolute -left-[3px] top-0 h-1.5 w-[7px] rounded-xs bg-sched-today" />
    </div>
  );
}
