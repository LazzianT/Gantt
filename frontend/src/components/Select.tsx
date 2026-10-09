import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  dot?: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export default function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  disabled,
  className = '',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
  }, [open, options, value]);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    setDropUp(!!rect && rect.bottom + 280 > window.innerHeight);
    setOpen(true);
  }

  function pick(option: SelectOption<T>) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        toggle();
        return;
      }
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        toggle();
        return;
      }
      setActive((index) => (index - 1 + options.length) % options.length);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      const option = options[active];
      if (option) pick(option);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="field flex cursor-pointer items-center justify-between gap-2 pr-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.dot && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: selected.dot }}
              aria-hidden
            />
          )}
          <span className="truncate">{selected?.label ?? '—'}</span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-ink-muted transition-transform duration-fast ease-standard ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          role="listbox"
          tabIndex={-1}
          className={`animate-menu-in absolute left-0 right-0 z-popover max-h-60 overflow-auto rounded-md border border-line bg-surface py-1 shadow-md focus:outline-none ${
            dropUp ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'
          }`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(option)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
                    index === active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-surface-subtle'
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: option.dot ?? '#98A2B3' }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected && <Check size={14} className="shrink-0 text-brand" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
