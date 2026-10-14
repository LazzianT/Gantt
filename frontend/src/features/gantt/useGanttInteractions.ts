import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ApiError } from '../../lib/api';
import { shortDate } from '../../lib/format';
import { patchTask } from './api';
import { barBox, type Axis, type GanttRow } from './useGanttData';
import type { ToastKind } from '../../components/Toast';

export type DragMode = 'move' | 'resize' | 'resize-start';

interface DragState {
  mode: DragMode;
  pointerId: number;
  row: GanttRow;
  barEl: HTMLElement;
  startX: number;
  dx: number;
  origLeft: number;
  origWidth: number;
}

interface Options {
  axis: Axis;
  reload: () => void;
  notify: (kind: ToastKind, message: string) => void;
}

export interface GanttInteractions {
  onBarPointerDown: (event: ReactPointerEvent, row: GanttRow) => void;
  onResizePointerDown: (event: ReactPointerEvent, row: GanttRow) => void;
  onResizeStartPointerDown: (event: ReactPointerEvent, row: GanttRow) => void;
}

/**
 * Pointer drag/resize for Gantt bars. Preview is written straight to the DOM,
 * so no React re-render happens per pointermove; the API is called once on pointerup.
 */
export function useGanttInteractions({ axis, reload, notify }: Options): GanttInteractions {
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

  const commit = useCallback(
    async (state: DragState) => {
      try {
        if (state.mode === 'move') {
          if (Math.abs(state.dx) < 2) return;
          const iso = axis.dateForX(state.origLeft + state.dx);
          if (iso === state.row.start) return;
          // Translate the whole bar: shift start and finish by the same number of working days so
          // the duration (and therefore the bar width) stays put.
          const shift = axis.workingIndex(iso) - axis.workingIndex(state.row.start);
          const finish = axis.workingDateAt(axis.workingIndex(state.row.finish) + shift);
          await patchTask(state.row.id, { start_date: iso, finish_date: finish });
          notify('success', `${state.row.name} moved to ${shortDate(iso)}`);
          reload();
        } else if (state.mode === 'resize') {
          const days = Math.max(0, Math.round((state.origWidth + state.dx) / axis.pxPerWorkingDay));
          if (days === state.row.durationDays) return;
          await patchTask(state.row.id, { duration_days: days });
          notify('success', `${state.row.name}: ${days} day${days === 1 ? '' : 's'}`);
          reload();
        } else {
          // Left-edge resize: keep the finish put and shift the start, so the finish date stays
          // identical and only the started date + duration change together.
          const startIdx = axis.workingIndex(axis.dateForX(state.origLeft + state.dx));
          const finishIdx = axis.workingIndex(state.row.finish);
          const days = Math.max(1, finishIdx - startIdx + 1);
          const newStart = axis.workingDateAt(finishIdx - days + 1);
          if (newStart === state.row.start) return;
          await patchTask(state.row.id, { start_date: newStart, duration_days: days });
          notify('success', `${state.row.name}: ${days} day${days === 1 ? '' : 's'}`);
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
      };
      let frame = 0;
      let latest: PointerEvent | null = null;

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
            const newWidth = Math.max(8, state.origWidth - state.dx);
            barEl.style.left = `${state.origLeft + (state.origWidth - newWidth)}px`;
            barEl.style.width = `${newWidth}px`;
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
        // Only undo the preview property we mutated. `width`/`left` are owned by React
        // (renderBar), so never blank them outright: restore the rendered value.
        if (mode === 'move') barEl.style.transform = '';
        else if (mode === 'resize') barEl.style.width = `${state.origWidth}px`;
        else {
          barEl.style.left = `${state.origLeft}px`;
          barEl.style.width = `${state.origWidth}px`;
        }
        barEl.style.cursor = '';
        void commit(state);
      };

      barEl.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [axis, commit],
  );

  const onBarPointerDown = useCallback((e: ReactPointerEvent, row: GanttRow) => begin(e, row, 'move'), [begin]);
  const onResizePointerDown = useCallback((e: ReactPointerEvent, row: GanttRow) => begin(e, row, 'resize'), [begin]);
  const onResizeStartPointerDown = useCallback(
    (e: ReactPointerEvent, row: GanttRow) => begin(e, row, 'resize-start'),
    [begin],
  );

  return useMemo(
    () => ({ onBarPointerDown, onResizePointerDown, onResizeStartPointerDown }),
    [onBarPointerDown, onResizePointerDown, onResizeStartPointerDown],
  );
}
