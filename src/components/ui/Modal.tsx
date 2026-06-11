import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** bottom sheet on small screens (default) or centered dialog */
  variant?: 'sheet' | 'center';
  children: React.ReactNode;
  'data-testid'?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: role=dialog + aria-modal, focus trap, Escape and backdrop
 * click to close, focus restored to the opener on unmount.
 */
export function Modal({
  open,
  onClose,
  title,
  variant = 'sheet',
  children,
  'data-testid': testId,
}: ModalProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={[
        'fixed inset-0 z-50 flex bg-text-main/50 dark:bg-black/60',
        variant === 'sheet' ? 'items-end sm:items-center justify-center' : 'items-center justify-center',
      ].join(' ')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid={testId ? `${testId}-backdrop` : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        data-testid={testId}
        className={[
          'bg-surface-raised shadow-modal w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in',
          variant === 'sheet'
            ? 'rounded-t-2xl sm:rounded-card pb-[env(safe-area-inset-bottom)]'
            : 'rounded-card mx-4',
        ].join(' ')}
      >
        <div className="sticky top-0 bg-surface-raised flex items-center justify-between gap-4 px-5 pt-4 pb-3 border-b border-border">
          <h2 id={titleId.current} className="text-lg font-bold text-text-main">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-sec hover:bg-primaryLight hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
