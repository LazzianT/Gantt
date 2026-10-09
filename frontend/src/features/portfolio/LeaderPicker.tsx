import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, UserRound, X } from 'lucide-react';
import { searchEmployees } from '../tasks/api';
import type { EmployeeSearchResult } from '../tasks/types';

export interface LeaderValue {
  nip: string;
  name: string;
}

interface Props {
  value: LeaderValue | null;
  onChange: (value: LeaderValue | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  className?: string;
  /** 'cell' renders a compact control sized for table rows. */
  variant?: 'default' | 'cell';
}

export default function LeaderPicker({
  value,
  onChange,
  placeholder = 'Search by name or NIP…',
  ariaLabel,
  id,
  className = '',
  variant = 'default',
}: Props) {
  const compact = variant === 'cell';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmployeeSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [editing, setEditing] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240, up: false });
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const didMount = useRef(false);
  const listId = useId();

  const showInput = !value || editing;
  const term = query.trim();

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  useEffect(() => {
    if (!showInput || !term) {
      setResults([]);
      setLoading(false);
      return;
    }
    const requestId = ++request.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchEmployees(term)
        .then((list) => {
          if (request.current !== requestId) return;
          setResults(list);
          setActive(list.length ? 0 : -1);
        })
        .catch(() => {
          if (request.current === requestId) setResults([]);
        })
        .finally(() => {
          if (request.current === requestId) setLoading(false);
        });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, showInput, term]);

  function place() {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(240, rect.width);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const up = rect.bottom + 280 > window.innerHeight;
    setPos({ top: up ? rect.top - 4 : rect.bottom + 4, left, width, up });
  }

  useEffect(() => {
    if (!open || term.length === 0) return;
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, term]);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (boxRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setEditing(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function choose(employee: EmployeeSearchResult) {
    onChange({ nip: employee.nip, name: employee.name });
    setQuery('');
    setResults([]);
    setOpen(false);
    setActive(-1);
    setEditing(false);
  }

  function clear() {
    onChange(null);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function openEditor() {
    setEditing(true);
    setOpen(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && open && active >= 0 && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {!showInput && value ? (
        <div className={`field flex items-center gap-2 ${compact ? 'field-compact gap-1.5 pr-1' : 'pr-1.5'}`}>
          <UserRound size={compact ? 13 : 15} className="shrink-0 text-brand" aria-hidden />
          <button
            ref={buttonRef}
            type="button"
            onClick={openEditor}
            className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
          >
            <span className={`truncate text-ink ${compact ? 'text-xs font-medium' : 'font-semibold'}`}>{value.name}</span>
            {!compact && <span className="shrink-0 text-2xs text-ink-muted">{value.nip}</span>}
          </button>
          <button type="button" aria-label={`Clear ${value.name}`} onClick={clear} className={`icon-btn ${compact ? 'h-5 w-5' : 'h-6 w-6'}`}>
            <X size={compact ? 12 : 14} />
          </button>
        </div>
      ) : (
        <>
          <Search
            size={compact ? 13 : 15}
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-muted ${compact ? 'left-2' : 'left-2.5'}`}
            aria-hidden
          />
          <input
            ref={inputRef}
            id={id}
            type="search"
            role="combobox"
            aria-expanded={open && term.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={ariaLabel ?? placeholder}
            value={query}
            placeholder={compact ? 'Search…' : placeholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={`field ${compact ? 'field-compact' : ''} pl-8 pr-8`}
          />
          <ChevronDown
            size={compact ? 12 : 15}
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-muted ${compact ? 'right-2' : 'right-2.5'}`}
            aria-hidden
          />
        </>
      )}

      {open &&
        term.length > 0 &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className={`fixed z-popover max-h-64 animate-menu-in overflow-auto rounded-md border border-line bg-surface py-1 shadow-md ${
              pos.up ? '-translate-y-full' : ''
            }`}
          >
            {loading ? (
              <li className="px-2.5 py-2 text-xs text-ink-muted">Searching…</li>
            ) : results.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-ink-muted">No employees match “{term}”.</li>
            ) : (
              results.map((employee, index) => (
                <li key={employee.nip} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(employee)}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left ${
                      index === active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-surface-subtle'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-2xs font-semibold text-ink-secondary">
                      {employee.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{employee.name}</span>
                      {(employee.position || employee.departmentName) && (
                        <span className="block truncate text-2xs text-ink-muted">
                          {[employee.position, employee.departmentName].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-2xs text-ink-muted">{employee.nip}</span>
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
