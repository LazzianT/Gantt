import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { ApiError } from '../../lib/api';
import { shortDate } from '../../lib/format';
import { createDependency, patchTask } from './api';
import { ROW_HEIGHT, barBox, type Axis, type GanttRow } from './useGanttData';
import type { ToastKind } from '../../components/Toast';

export type DragMode = 'move' | 'resize' | 'link';

interface DragState {
  mode: DragMode;
  pointerId: number;
  row: GanttRow;
  barEl: HTMLElement;
  startX: number;
  dx: number;
  origLeft: number;
  origWidth: number;
  targetId: number | null;
}

interface Options {
  axis: Axis;
  rowIndex: Map<number, number>;
  reload: () => void;
  notify: (kind: ToastKind, message: string) => void;
}

export interface GanttInteractions {
  onBarPointerDown: (event: ReactPointerEvent, row: GanttRow) => void;
  onResizePointerDown: (event: ReactPointerEvent, row: GanttRow) => void;
  onLinkPointerDown: (event: ReactPointerEvent, row: GanttRow) => void;
  linkTargetId: number | null;
  linkPathRef: RefObject<SVGPathElement>;
  linkSvgRef: RefObject<SVGSVGElement>;
}

/**
 * Pointer drag/resize/link for Gantt bars. Preview is written straight to the DOM,
 * so no React re-render happens per pointermove; the API is called once on pointerup.
 */
export function useGanttInteractions({ axis, rowIndex, reload, notify }: Options): GanttInteractions {
  const [linkTargetId, setLinkTargetId] = useState<number | null>(null);
  const linkPathRef = useRef<SVGPathElement>(null);
  const linkSvgRef = useRef<SVGSVGElement>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      reducedMotion.current = media.matches;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  const clearLink = useCallback(() => {
    linkPathRef.current?.setAttribute('d', '');
    setLinkTargetId(null);
  }, []);

  const commit = useCallback(
    async (state: DragState) => {
      try {
        if (state.mode === 'move') {
          if (Math.abs(state.dx) < 2) return;
          const iso = axis.dateForX(state.origLeft + state.dx);
          if (iso === state.row.start) return;
          await patchTask(state.row.id, { start_date: iso });
          notify('success', `${state.row.name} moved to ${shortDate(iso)}`);
          reload();
        } else if (state.mode === 'resize') {
          const days = Math.max(0, Math.round((state.origWidth + state.dx) / axis.pxPerWorkingDay));
          if (days === state.row.durationDays) return;
          await patchTask(state.row.id, { duration_days: days });
          notify('success', `${state.row.name}: ${days} day${days === 1 ? '' : 's'}`);
          reload();
        } else {
          if (state.targetId == null) return;
          await createDependency(state.targetId, {
            predecessor_task_id: state.row.id,
            dependency_type: 'FS',
            lag_days: 0,
          });
          notify('success', `Linked ${state.row.name}`);
          reload();
        }
      } catch (err) {
        notify('error', err instanceof ApiError ? err.message : 'The change could not be saved');
      }
    },
    [axis, notify, reload],
  );

  const begin = useCallback(
    (event: ReactPointerEvent, row: GanttRow, mode: DragMode) => {
      if (event.button !== 0) return;
      const barEl = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-bar]');
      if (!barEl) return;
      event.preventDefault();
      event.stopPropagation();

      const box = barBox(row, axis);
      const state: DragState = {
        mode,
        pointerId: event.pointerId,
        row,
        barEl,
        startX: event.clientX,
        dx: 0,
        origLeft: box.left,
        origWidth: box.width,
        targetId: null,
      };
      let frame = 0;
      let latest: PointerEvent | null = null;

      const targetUnder = (clientX: number, clientY: number): number | null => {
        const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-task-id]');
        if (!el) return null;
        const id = Number(el.dataset.taskId);
        if (!Number.isFinite(id) || id === row.id || el.dataset.taskType === 'Summary') return null;
        return id;
      };

      const drawLink = (clientX: number, clientY: number) => {
        const svg = linkSvgRef.current;
        const path = linkPathRef.current;
        if (!svg || !path) return;
        const rect = svg.getBoundingClientRect();
        const x1 = box.left + box.width;
        const y1 = (rowIndex.get(row.id) ?? 0) * ROW_HEIGHT + ROW_HEIGHT / 2;
        const x2 = clientX - rect.left;
        const y2 = clientY - rect.top;
        path.setAttribute('d', `M ${x1} ${y1} H ${x1 + 8} V ${y2} H ${x2}`);
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== state.pointerId) return;
        latest = e;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!latest) return;
          state.dx = latest.clientX - state.startX;
          if (mode === 'move') {
            if (!reducedMotion.current) barEl.style.transform = `translateX(${state.dx}px)`;
          } else if (mode === 'resize') {
            barEl.style.width = `${Math.max(8, state.origWidth + state.dx)}px`;
          } else {
            const id = targetUnder(latest.clientX, latest.clientY);
            state.targetId = id;
            setLinkTargetId((prev) => (prev === id ? prev : id));
            drawLink(latest.clientX, latest.clientY);
          }
        });
      };

      const finish = (e: PointerEvent) => {
        if (e.pointerId !== state.pointerId) return;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        if (latest) state.dx = latest.clientX - state.startX;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        barEl.style.transform = '';
        barEl.style.width = '';
        barEl.style.cursor = '';
        clearLink();
        void commit(state);
      };

      barEl.style.cursor = mode === 'resize' ? 'ew-resize' : mode === 'link' ? 'crosshair' : 'grabbing';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [axis, clearLink, commit, rowIndex],
  );

  const onBarPointerDown = useCallback((e: ReactPointerEvent, row: GanttRow) => begin(e, row, 'move'), [begin]);
  const onResizePointerDown = useCallback((e: ReactPointerEvent, row: GanttRow) => begin(e, row, 'resize'), [begin]);
  const onLinkPointerDown = useCallback((e: ReactPointerEvent, row: GanttRow) => begin(e, row, 'link'), [begin]);

  return useMemo(
    () => ({ onBarPointerDown, onResizePointerDown, onLinkPointerDown, linkTargetId, linkPathRef, linkSvgRef }),
    [onBarPointerDown, onResizePointerDown, onLinkPointerDown, linkTargetId],
  );
}
