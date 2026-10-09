import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

/** Imperative confirmation dialog: `const ok = await confirm({ title });` */
export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

interface State extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const [state, setState] = useState<Omit<State, 'resolve'> | null>(null);

  const confirm = useCallback<Confirm>((options) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        tone: options.tone,
      });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && <ConfirmView options={state} onResolve={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmView({
  options,
  onResolve,
}: {
  options: Omit<State, 'resolve'>;
  onResolve: (value: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = options.tone === 'danger';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onResolve(false);
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 20);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
    };
  }, [onResolve]);

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-end justify-center sm:items-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={options.title}
    >
      <div className="absolute inset-0 animate-overlay-in bg-ink/40" onClick={() => onResolve(false)} />
      <div className="relative flex w-full max-w-md animate-dialog-in flex-col overflow-hidden rounded-t-xl border border-line bg-surface shadow-xl sm:rounded-xl">
        <div className="flex gap-3 px-5 pt-5">
          {danger && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle size={18} aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-md font-semibold text-ink">{options.title}</h2>
            {options.description && (
              <p className="mt-1 text-sm text-ink-secondary">{options.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-5">
          <button type="button" onClick={() => onResolve(false)} className="btn-secondary">
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResolve(true)}
            className={
              danger
                ? 'btn bg-danger text-white hover:bg-danger/90 active:translate-y-[0.5px]'
                : 'btn-primary'
            }
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
