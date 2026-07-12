import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TOTAL_STEPS = 5;
const TITLE_ID = 'onboarding-title';

/**
 * First-use onboarding overlay — 5 neutral educational screens.
 *
 * Accessibility: role=dialog + aria-modal, focus trap, Escape = skip,
 * focus restored to opener on close, respects prefers-reduced-motion.
 *
 * Clinical constraint (non-negotiable): NO fertility classification
 * language. Content only describes observation categories and the
 * instructor's interpretive role. See ARCHITECTURE.md clinical safety
 * constraint.
 *
 * @param {{ onFinish: () => void }} props
 */
export function OnboardingFlow({ onFinish }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const panelRef = useRef(null);

  // Focus the first focusable element whenever the step changes.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector(FOCUSABLE);
    first?.focus();
  }, [step]);

  // Focus trap + Escape to close, body scroll lock, focus restore.
  useEffect(() => {
    const opener = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onFinish();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE));
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

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      opener?.focus();
    };
  }, [onFinish]);

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  };

  const isLast = step === TOTAL_STEPS - 1;
  const stepNum = step + 1; // 1-based for i18n keys and data-testid

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-text-main/50 dark:bg-black/60">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        data-testid="onboarding-overlay"
        className="bg-surface-raised shadow-modal w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card animate-fade-in motion-reduce:animate-none pb-[env(safe-area-inset-bottom)]"
      >
        {/* ── Header: skip affordance + progress dots ── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <button
            type="button"
            data-testid="onboarding-skip"
            onClick={onFinish}
            aria-label={t('onboarding.skip')}
            className="text-sm font-medium text-text-sec hover:text-text-main transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded px-2 py-1"
          >
            {t('onboarding.skip')}
          </button>

          {/* Progress dots (decorative — aria-live sr text below handles announcement) */}
          <div
            className="flex gap-1.5"
            aria-hidden="true"
          >
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={[
                  'inline-block h-2 rounded-full transition-all duration-200 motion-reduce:transition-none',
                  i === step ? 'w-4 bg-primary' : 'w-2 bg-border',
                ].join(' ')}
              />
            ))}
          </div>

          {/* Screen-reader step announcement */}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {t('onboarding.progressAria', { current: stepNum, total: TOTAL_STEPS })}
          </span>
        </div>

        {/* ── Step content ── */}
        <div
          className="px-5 pt-5 pb-2 min-h-[180px]"
          data-testid={`onboarding-step-${stepNum}`}
        >
          <h2 id={TITLE_ID} className="text-xl font-bold text-text-main mb-3">
            {t(`onboarding.step${stepNum}Title`)}
          </h2>
          <p className="text-sm leading-relaxed text-text-sec">
            {t(`onboarding.step${stepNum}Body`)}
          </p>
        </div>

        {/* ── Footer: next / finish ── */}
        <div className="px-5 py-4">
          {isLast ? (
            <button
              type="button"
              data-testid="onboarding-finish"
              onClick={onFinish}
              className="w-full inline-flex items-center justify-center bg-primary text-surface dark:text-bg-app font-bold py-3 rounded-btn hover:bg-primary/90 transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('onboarding.finish')}
            </button>
          ) : (
            <button
              type="button"
              data-testid="onboarding-next"
              onClick={handleNext}
              className="w-full inline-flex items-center justify-center bg-primary text-surface dark:text-bg-app font-bold py-3 rounded-btn hover:bg-primary/90 transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('onboarding.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
