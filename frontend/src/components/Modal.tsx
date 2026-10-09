import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Accessible dialog: portalled, Escape-to-close, scroll-locked, focus moved
 * into the panel. Motion comes from `dialog-in` / `overlay-in`.
 */
export default function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const firstField = contentRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled])',
      );
      (firstField ?? panelRef.current)?.focus();
    }, 20);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 animate-overlay-in bg-ink/40" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-lg animate-dialog-in flex-col overflow-hidden rounded-t-xl border border-line bg-surface shadow-xl focus:outline-none sm:rounded-xl"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
          <div className="min-w-0">
            <h2 className="truncate text-md font-semibold text-ink">{title}</h2>
            {description && <p className="truncate text-xs text-ink-secondary">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="icon-btn -mr-1.5">
            <X size={18} />
          </button>
        </header>
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="shrink-0 border-t border-line px-5 py-3.5">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
