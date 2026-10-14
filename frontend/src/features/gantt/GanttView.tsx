import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent,
} from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import Skeleton from '../../components/Skeleton';
import { ToastProvider, useToast } from '../../components/Toast';
import { fullDate } from '../../lib/format';
import GanttToolbar from './GanttToolbar';
import TodayMarker from './TodayMarker';
import { useGanttInteractions, type GanttInteractions } from './useGanttInteractions';
import {
  ROW_HEIGHT,
  barBox,
  useGanttData,
  type Axis,
  type BarBox,
  type GanttRow,
  type Scale,
} from './useGanttData';

const HEADER_HEIGHT = 48;
const OVERSCAN = 24;
const PAN_THRESHOLD = 3;
const LABEL_WIDE = 320;
const LABEL_NARROW = 200;

const BAR_TOP = 8;
const BAR_HEIGHT = 16;

/** Drag editing breaks on touch and cramped widths; the design makes the Gantt read-only below md. */
function useEditable(): boolean {
  const [editable, setEditable] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const apply = () => setEditable(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return editable;
}

interface RowProps {
  row: GanttRow;
  index: number;
  axis: Axis;
  labelWidth: number;
  totalWidth: number;
  selected: boolean;
  criticalOnly: boolean;
  showBaseline: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  interactions: GanttInteractions | null;
}

const Row = memo(function Row({
  row,
  index,
  axis,
  labelWidth,
  totalWidth,
  selected,
  criticalOnly,
  showBaseline,
  onSelect,
  onToggle,
  interactions,
}: RowProps) {
  const box = barBox(row, axis);
  const critical = row.isCritical;
  const dim = criticalOnly && !critical && row.type === 'Task';

  const label = `${row.name}, ${row.type}, ${fullDate(row.start)} to ${fullDate(row.finish)}, ${
    row.durationDays
  } days, ${Math.round(row.progress)}% complete${critical ? ', critical path' : ''}`;

  return (
    <div
      role="row"
      aria-rowindex={index + 1}
      aria-label={label}
      aria-selected={selected}
      data-selected={selected || undefined}
      onClick={() => onSelect(row.id)}
      style={{ height: ROW_HEIGHT }}
      className={`group flex ${selected ? 'bg-brand-soft/60' : 'hover:bg-surface-subtle/50'}`}
    >
      <div
        className={`sticky left-0 z-rowFrozen flex h-8 shrink-0 cursor-pointer items-center gap-1 border-r border-line-hairline px-2 ${
          selected ? 'bg-brand-soft' : 'bg-surface group-hover:bg-surface-subtle'
        }`}
        style={{ width: labelWidth }}
      >
        {row.hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(row.id);
            }}
            aria-label={row.collapsed ? `Expand ${row.name}` : `Collapse ${row.name}`}
            aria-expanded={!row.collapsed}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-ink-muted hover:bg-surface-sunken hover:text-ink-secondary focus-visible:outline-none focus-visible:shadow-focus"
          >
            {row.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="w-9 shrink-0 text-2xs tabular text-ink-muted">{row.wbs}</span>
        <span
          className={`min-w-0 flex-1 truncate text-xs ${
            row.type === 'Summary' ? 'font-semibold text-ink' : 'text-ink'
          }`}
          title={row.name}
        >
          {row.name}
        </span>
        {row.isCritical && <AlertTriangle size={12} className="shrink-0 text-[#DC2626]" aria-hidden />}
      </div>

      <div className="relative shrink-0" style={{ width: totalWidth }}>
        {showBaseline && row.baseline && (
          <div
            className="absolute rounded-xs bg-sched-baseline"
            style={{
              left: barBox({ ...row, start: row.baseline.start, finish: row.baseline.finish }, axis).left,
              width: barBox({ ...row, start: row.baseline.start, finish: row.baseline.finish }, axis).width,
              top: 24,
              height: 6,
            }}
          />
        )}
        {renderBar(row, box, { criticalOnly, dim, interactions })}
      </div>
    </div>
  );
});

function ResizeHandle({
  row,
  side,
  interactions,
}: {
  row: GanttRow;
  side: 'start' | 'end';
  interactions: GanttInteractions;
}) {
  return (
    <button
      type="button"
      aria-label={side === 'end' ? `Resize ${row.name}` : `Resize start ${row.name}`}
      title="Drag to change duration"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (side === 'end') interactions.onResizePointerDown(event, row);
        else interactions.onResizeStartPointerDown(event, row);
      }}
      className={`absolute inset-y-0 ${side === 'end' ? 'right-0' : 'left-0'} w-1.5 cursor-ew-resize touch-none opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus`}
    >
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-xs bg-white/80" />
    </button>
  );
}

function renderBar(
  row: GanttRow,
  box: BarBox,
  opts: { criticalOnly: boolean; dim: boolean; interactions: GanttInteractions | null },
) {
  const critical = row.isCritical;
  const { interactions } = opts;
  const dragProps = interactions
    ? { onPointerDown: (event: ReactPointerEvent) => interactions.onBarPointerDown(event, row) }
    : {};

  if (row.type === 'Milestone') {
    const done = row.progress >= 100;
    const color = critical ? '#DC2626' : '#D4A843';
    return (
      <span
        data-bar
        data-task-id={row.id}
        data-task-type={row.type}
        {...dragProps}
        className={`absolute ${interactions ? 'cursor-grab touch-none' : ''}`}
        style={{ left: box.left, top: 10, width: 12, height: 12 }}
        title={row.name}
      >
        <span
          className="absolute inset-0 rotate-45 border"
          style={{ borderColor: color, backgroundColor: done ? color : 'transparent' }}
        />
      </span>
    );
  }

  if (row.type === 'Summary') {
    return (
      <span className="absolute" style={{ left: box.left, width: box.width, top: BAR_TOP }}>
        <span className="absolute inset-x-0 top-0 h-2 rounded-xs bg-sched-summary" />
        <span className="absolute left-0 top-0 h-3.5 w-0.5 bg-sched-summary" />
        <span className="absolute right-0 top-0 h-3.5 w-0.5 bg-sched-summary" />
      </span>
    );
  }

  const track = critical ? 'bg-sched-criticalSoft' : 'bg-sched-barTrack';
  const fill = critical ? 'bg-sched-critical' : 'bg-sched-progress';
  return (
    <span
      data-bar
      data-task-id={row.id}
      data-task-type={row.type}
      {...dragProps}
      className={`absolute ${interactions ? 'cursor-grab touch-none' : ''}`}
      style={{ left: box.left, width: box.width, top: BAR_TOP, height: BAR_HEIGHT, opacity: opts.dim ? 0.4 : 1 }}
      title={`${row.name} · ${Math.round(row.progress)}% · float ${row.totalFloat}d`}
    >
      <span className={`absolute inset-0 rounded-xs ${track}`} />
      <span
        role="progressbar"
        aria-valuenow={Math.round(row.progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`absolute inset-y-0 left-0 rounded-xs ${fill}`}
        style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }}
      />
      {interactions && (
        <>
          <ResizeHandle row={row} side="start" interactions={interactions} />
          <ResizeHandle row={row} side="end" interactions={interactions} />
        </>
      )}
    </span>
  );
}

function TimelineHeader({ axis, labelWidth }: { axis: Axis; labelWidth: number }) {
  return (
    <div className="sticky top-0 z-toolbar flex shrink-0 border-b border-line bg-surface" style={{ height: HEADER_HEIGHT }}>
      <div
        className="sticky left-0 z-rowFrozen flex h-full shrink-0 items-center border-r border-line bg-surface px-3 text-2xs font-semibold uppercase tracking-wide text-ink-muted"
        style={{ width: labelWidth }}
      >
        Task
      </div>
      <div className="relative h-full" style={{ width: axis.totalWidth }}>
        {axis.coarse.map((group) => (
          <div
            key={group.key}
            className="absolute top-0 h-6 overflow-hidden border-b border-r border-line-hairline px-2 text-2xs font-semibold leading-6 text-ink-secondary"
            style={{ left: group.left, width: group.width }}
          >
            {group.label}
          </div>
        ))}
        {axis.fine.map((group) => (
          <div
            key={group.key}
            className="absolute top-6 h-6 overflow-hidden border-r border-line-hairline text-center text-2xs leading-6 text-ink-muted"
            style={{ left: group.left, width: group.width }}
          >
            {group.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function GridLayer({ axis, compressed, height }: { axis: Axis; compressed: boolean; height: number }) {
  return (
    <div className="absolute left-0 top-0" style={{ width: axis.totalWidth, height }}>
      {!compressed &&
        axis.days
          .filter((day) => !day.isWorking)
          .map((day) => (
            <div
              key={day.date}
              className={`absolute inset-y-0 ${day.isWeekend ? 'bg-sched-weekend' : 'bg-sched-nonworking'}`}
              style={{ left: day.left, width: day.width }}
            />
          ))}
      {axis.fine.map((group) => (
        <div
          key={group.key}
          className="absolute inset-y-0 border-l border-line-hairline"
          style={{ left: group.left }}
        />
      ))}
      <div className="absolute inset-y-0 border-l border-line-hairline" style={{ left: axis.totalWidth }} />
    </div>
  );
}

export default function GanttView({ projectId }: { projectId: number }) {
  return (
    <ToastProvider>
      <GanttViewInner projectId={projectId} />
    </ToastProvider>
  );
}

function GanttViewInner({ projectId }: { projectId: number }) {
  const { notify } = useToast();
  const editable = useEditable();
  const [scale, setScale] = useState<Scale>('Day');
  const [zoom, setZoom] = useState(1);
  const [compressed, setCompressed] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const data = useGanttData(projectId, { scale, compressed, zoom, collapsed });
  const { rows, axis } = data;
  const interactions = useGanttInteractions({
    axis,
    reload: data.reload,
    notify,
  });
  const { scrollRef, scrollTop, viewportH, onScroll } = useGanttViewport(data.loading, rows.length);

  const [panning, setPanning] = useState(false);
  const panState = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number } | null>(
    null,
  );
  const didPan = useRef(false);

  const onPanPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.pointerType === 'touch') return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-bar]') || target.closest('button')) return;
      const el = scrollRef.current;
      if (!el) return;
      didPan.current = false;
      panState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: el.scrollLeft,
        top: el.scrollTop,
      };
      el.setPointerCapture(event.pointerId);
      setPanning(true);
    },
    [scrollRef],
  );

  const onPanPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = panState.current;
      const el = scrollRef.current;
      if (!state || !el || state.pointerId !== event.pointerId) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) didPan.current = true;
      el.scrollLeft = state.left - dx;
      el.scrollTop = state.top - dy;
    },
    [scrollRef],
  );

  const endPan = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = panState.current;
      if (!state || state.pointerId !== event.pointerId) return;
      scrollRef.current?.releasePointerCapture(event.pointerId);
      panState.current = null;
      setPanning(false);
    },
    [scrollRef],
  );

  const [labelW, setLabelW] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024 ? LABEL_NARROW : LABEL_WIDE,
  );
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const apply = () => setLabelW(media.matches ? LABEL_WIDE : LABEL_NARROW);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  const bodyHeight = rows.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.min(Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN, Math.max(0, rows.length - 1)));
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);
  const visible = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);

  const scrollRowIntoView = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const top = index * ROW_HEIGHT;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
        el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
      }
    },
    [scrollRef],
  );

  const selectIndex = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      setSelectedId(row.id);
      scrollRowIntoView(index);
    },
    [rows, scrollRowIntoView],
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = selectedId == null ? -1 : rows.findIndex((row) => row.id === selectedId);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectIndex(Math.min(rows.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectIndex(index <= 0 ? 0 : index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectIndex(rows.length - 1);
    }
  }

  function scrollToToday() {
    const el = scrollRef.current;
    if (!el || axis.todayX == null) return;
    el.scrollTo({ left: Math.max(0, labelW + axis.todayX - el.clientWidth / 2), behavior: 'smooth' });
  }

  const toggle = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const busy = data.loading && rows.length === 0;

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <GanttToolbar
        scale={scale}
        onScale={setScale}
        zoom={zoom}
        onZoom={setZoom}
        compressed={compressed}
        onCompressed={setCompressed}
        criticalOnly={criticalOnly}
        onCriticalOnly={setCriticalOnly}
        hasBaseline={data.hasBaseline}
        showBaseline={showBaseline}
        onShowBaseline={setShowBaseline}
        onExpandAll={() => setCollapsed(new Set())}
        onCollapseAll={() => setCollapsed(new Set(data.collapsibleIds))}
        onToday={scrollToToday}
        onRefresh={data.reload}
      />

      {data.error && (
        <div
          role="alert"
          className="mx-3 mt-3 flex items-center gap-3 rounded-sm border border-[#FECACA] bg-[#FEE2E2] px-3 py-2 text-sm text-[#B91C1C]"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">{data.error}</span>
          <button type="button" onClick={data.reload} className="btn-secondary h-7 border-[#FECACA] bg-white">
            Retry
          </button>
        </div>
      )}

      {busy ? (
        <GanttSkeleton />
      ) : rows.length === 0 ? (
        <EmptySchedule />
      ) : (
        <div
          ref={scrollRef}
          role="grid"
          aria-label="Gantt chart"
          aria-rowcount={rows.length}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          onPointerDown={onPanPointerDown}
          onPointerMove={onPanPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onClickCapture={(event) => {
            if (didPan.current) {
              didPan.current = false;
              event.stopPropagation();
              event.preventDefault();
            }
          }}
          className={`min-h-0 flex-1 overflow-auto focus:outline-none ${
            panning ? 'cursor-grabbing select-none' : 'cursor-grab'
          }`}
        >
          <div className="relative" style={{ width: labelW + axis.totalWidth }}>
            <TimelineHeader axis={axis} labelWidth={labelW} />
            <div className="relative" style={{ height: bodyHeight }}>
              <div className="absolute top-0" style={{ left: labelW }}>
                <GridLayer axis={axis} compressed={compressed} height={bodyHeight} />
              </div>
              {axis.todayX != null && <TodayMarker x={labelW + axis.todayX} height={bodyHeight} />}
              <div style={{ height: startIndex * ROW_HEIGHT }} />
              {visible.map((row, offset) => (
                <Row
                  key={row.id}
                  row={row}
                  index={startIndex + offset}
                  axis={axis}
                  labelWidth={labelW}
                  totalWidth={axis.totalWidth}
                  selected={selectedId === row.id}
                  criticalOnly={criticalOnly}
                  showBaseline={showBaseline}
                  onSelect={setSelectedId}
                  onToggle={toggle}
                  interactions={editable ? interactions : null}
                />
              ))}
              <div style={{ height: (rows.length - endIndex) * ROW_HEIGHT }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function useGanttViewport(loading: boolean, rowCount: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight || 480);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, rowCount]);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return { scrollRef, scrollTop, viewportH, onScroll };
}

function GanttSkeleton() {
  return (
    <div aria-busy="true" className="min-h-0 flex-1 overflow-hidden">
      <p className="sr-only">Calculating schedule…</p>
      <div className="flex h-12 items-center border-b border-line bg-surface px-3">
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 border-b border-line-hairline px-3" style={{ height: ROW_HEIGHT }}>
          <Skeleton className="h-3 w-40" />
          <span className="skeleton block h-4" style={{ width: 120 + ((index * 37) % 200) }} />
        </div>
      ))}
    </div>
  );
}

function EmptySchedule() {
  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center">
      <h2 className="text-sm font-semibold text-ink">No tasks to chart</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Add tasks in the Tasks tab to see them scheduled here from the server engine.
      </p>
    </div>
  );
}
