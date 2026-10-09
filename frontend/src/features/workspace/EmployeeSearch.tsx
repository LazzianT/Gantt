import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { searchEmployees, type EmployeeSearchResult } from './api';

interface Props {
  onSelect: (employee: EmployeeSearchResult) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export default function EmployeeSearch({
  onSelect,
  placeholder = 'Search employees…',
  disabled,
  autoFocus,
  className = '',
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmployeeSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const request = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++request.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchEmployees(term)
        .then((list) => {
          if (request.current !== id) return;
          setResults(list);
          setActive(list.length ? 0 : -1);
        })
        .catch(() => {
          if (request.current === id) setResults([]);
        })
        .finally(() => {
          if (request.current === id) setLoading(false);
        });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function choose(employee: EmployeeSearchResult) {
    onSelect(employee);
    setQuery('');
    setResults([]);
    setOpen(false);
    setActive(-1);
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

  const term = query.trim();

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <Search size={15} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-expanded={open && term.length > 0}
        aria-controls="employee-search-results"
        aria-autocomplete="list"
        autoFocus={autoFocus}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="field pl-7"
      />
      {open && term.length > 0 && (
        <ul
          id="employee-search-results"
          role="listbox"
          className="animate-fade-in absolute left-0 right-0 top-9 z-popover max-h-64 overflow-auto rounded-md border border-line bg-surface py-1 shadow-sm"
        >
          {loading ? (
            <li className="px-2 py-1.5 text-xs text-ink-muted">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-ink-muted">No employees match “{term}”.</li>
          ) : (
            results.map((employee, index) => (
              <li key={employee.nip} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(employee)}
                  className={`flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm ${
                    index === active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-surface-subtle'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{employee.name}</span>
                  <span className="shrink-0 text-2xs text-ink-muted">{employee.nip}</span>
                </button>
                {(employee.position || employee.departmentName) && (
                  <p className="px-2 pb-1 text-2xs text-ink-muted">
                    {[employee.position, employee.departmentName].filter(Boolean).join(' · ')}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
