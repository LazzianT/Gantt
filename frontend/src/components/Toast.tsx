import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

export type ToastKind = 'success' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  notify: (kind: ToastKind, message: string) => void;
}

const noop = () => {};
const ToastContext = createContext<ToastApi>({ notify: noop });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const ACCENT: Record<ToastKind, string> = { success: '#16A34A', error: '#DC2626' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++nextId.current;
      setToasts((current) => [...current, { id, kind, message }]);
      // Errors persist until dismissed; successes clear themselves.
      if (kind === 'success') window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const error = toast.kind === 'error';
  const Icon = error ? AlertTriangle : CheckCircle2;

  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className="animate-toast-in pointer-events-auto flex items-start gap-2 rounded-md border border-line bg-surface py-2 pl-3 pr-2 shadow-md"
      style={{ borderLeft: `3px solid ${ACCENT[toast.kind]}` }}
    >
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: ACCENT[toast.kind] }} aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-ink">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-ink-muted hover:bg-surface-subtle hover:text-ink-secondary focus-visible:outline-none focus-visible:shadow-focus"
      >
        <X size={14} />
      </button>
    </div>
  );
}
