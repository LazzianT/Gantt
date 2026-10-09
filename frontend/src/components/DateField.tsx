import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { fullDate } from '../lib/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const POPOVER_WIDTH = 256;

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  min?: string;
  max?: string;
  className?: string;
  /** Allow typing a date as dd/mm/yyyy in addition to picking from the calendar. */
  allowTyping?: boolean;
  /** 'cell' renders a compact control sized for table rows. */
  variant?: 'default' | 'cell';
}

function padded(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${padded(m)}-${padded(d)}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** ISO -> dd/mm/yyyy */
function toDisplay(iso: string): string {
  const parts = parseIso(iso);
  return parts ? `${padded(parts.d)}/${padded(parts.m)}/${parts.y}` : '';
}

/** dd/mm/yyyy (or d/m/yyyy) -> ISO, or null when invalid. */
function fromDisplay(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  if (m < 1 || m > 12) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) return null;
  return toIso(y, m, d);
}

function todayIso(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function shiftMonth(view: { y: number; m: number }, delta: number): { y: number; m: number } {
  const total = view.m - 1 + delta;
  return { y: view.y + Math.floor(total / 12), m: ((total % 12) + 12) % 12 + 1 };
}

function buildGrid(y: number, m: number): (string | null)[] {
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(toIso(y, m, d));
  return cells;
}

function shiftDay(iso: string, delta: number): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const next = new Date(parts.y, parts.m - 1, parts.d + delta);
  return toIso(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

export default function DateField({
  value,
  onChange,
  placeholder = 'Pick a date',
  ariaLabel,
  id,
  min,
  max,
  className = '',
  allowTyping = false,
  variant = 'default',
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });
  const [text, setText] = useState(() => toDisplay(value));
  const boxRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);

  const base = parseIso(value);
  const [view, setView] = useState(() => {
    const now = new Date();
    return base ? { y: base.y, m: base.m } : { y: now.getFullYear(), m: now.getMonth() + 1 };
  });
  const [cursor, setCursor] = useState(() => value || todayIso());

  const grid = useMemo(() => buildGrid(view.y, view.m), [view]);

  useEffect(() => {
    if (typingRef.current) return;
    setText(toDisplay(value));
  }, [value]);

  function place() {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    const up = rect.bottom + 360 > window.innerHeight;
    setPos({ top: up ? rect.top - 4 : rect.bottom + 4, left, up });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const anchor = parseIso(value) ?? parseIso(todayIso())!;
    setView({ y: anchor.y, m: anchor.m });
    setCursor(value || toIso(anchor.y, anchor.m, anchor.d));
    dialogRef.current?.focus();
  }, [open, value]);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (boxRef.current?.contains(target) || dialogRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function inRange(iso: string): boolean {
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
  }

  function pick(iso: string) {
    if (!inRange(iso)) return;
    onChange(iso);
    setText(toDisplay(iso));
    setOpen(false);
  }

  function commitTyping() {
    const trimmed = text.trim();
    if (trimmed === '') {
      if (value) onChange('');
      return;
    }
    const parsed = fromDisplay(trimmed);
    if (parsed && inRange(parsed)) {
      onChange(parsed);
      setText(toDisplay(parsed));
    } else {
      setText(toDisplay(value));
    }
  }

  function move(delta: number) {
    const next = shiftDay(cursor, delta);
    setCursor(next);
    const parts = parseIso(next);
    if (parts && (parts.y !== view.y || parts.m !== view.m)) setView({ y: parts.y, m: parts.m });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-7);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(7);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(cursor);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const controlClass = `field flex items-center gap-2 ${variant === 'cell' ? 'field-compact' : ''}`;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {allowTyping ? (
        <div className={controlClass}>
          <CalendarDays size={variant === 'cell' ? 13 : 15} className="shrink-0 text-ink-muted" aria-hidden />
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="numeric"
            aria-label={ariaLabel}
            placeholder={placeholder}
            value={text}
            onFocus={() => {
              typingRef.current = true;
            }}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => {
              typingRef.current = false;
              commitTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTyping();
              } else if (event.key === 'Escape') {
                setText(toDisplay(value));
                inputRef.current?.blur();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-inherit tabular outline-none placeholder:text-ink-muted"
          />
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={ariaLabel ? `Open calendar: ${ariaLabel}` : 'Open calendar'}
            onClick={toggle}
            className="icon-btn -mr-1 h-6 w-6 shrink-0"
          >
            <ChevronDown
              size={variant === 'cell' ? 13 : 15}
              className={`transition-transform duration-fast ease-standard ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        </div>
      ) : (
        <button
          type="button"
          id={id}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={toggle}
          className={`${controlClass} w-full cursor-pointer justify-between pr-2.5 text-left`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays size={15} className="shrink-0 text-ink-muted" aria-hidden />
            <span className={`truncate ${value ? 'text-ink' : 'text-ink-muted'}`}>
              {value ? fullDate(value) : placeholder}
            </span>
          </span>
          <ChevronDown
            size={15}
            className={`shrink-0 text-ink-muted transition-transform duration-fast ease-standard ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-label={ariaLabel ?? 'Choose date'}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
            className={`fixed z-popover animate-menu-in rounded-lg border border-line bg-surface p-3 shadow-md focus:outline-none ${
              pos.up ? '-translate-y-full' : ''
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView((v) => shiftMonth(v, -1))}
                className="icon-btn h-7 w-7"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-ink">
                {MONTHS[view.m - 1]} {view.y}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView((v) => shiftMonth(v, 1))}
                className="icon-btn h-7 w-7"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((weekday) => (
                <span
                  key={weekday}
                  className="flex h-7 items-center justify-center text-2xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {weekday}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((iso, index) =>
                iso === null ? (
                  <span key={`blank-${index}`} />
                ) : (
                  <button
                    key={iso}
                    type="button"
                    disabled={!inRange(iso)}
                    onClick={() => pick(iso)}
                    aria-pressed={iso === value}
                    className={`flex h-7 items-center justify-center rounded-sm text-xs tabular transition-colors duration-fast ease-standard ${
                      iso === value
                        ? 'bg-brand font-semibold text-white'
                        : iso === cursor
                          ? 'bg-brand-soft font-semibold text-brand'
                          : 'text-ink hover:bg-surface-sunken'
                    } ${!inRange(iso) ? 'cursor-not-allowed text-ink-disabled hover:bg-transparent' : ''}`}
                  >
                    {Number(iso.slice(8, 10))}
                  </button>
                ),
              )}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-line-hairline pt-2">
              <button
                type="button"
                onClick={() => pick(todayIso())}
                className="text-xs font-semibold text-brand hover:text-brand-hover"
              >
                Today
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setText('');
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-ink-muted hover:text-ink-secondary"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
