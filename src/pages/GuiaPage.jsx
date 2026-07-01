/**
 * GuiaPage — AI annotation guide (extracted from App.jsx).
 *
 * ADR-016: questions are proxied through a Supabase Edge Function.
 * LGPD: only { question } leaves the device — never cycle data.
 * Clinical constraint: the assistant helps with app usage and MOB notation;
 * cycle interpretation is the instrutora's alone (permanent warning below).
 */
import { ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function GuiaPage({ msgs, input, setInput, aiLoading, sendAI, chatEnd }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-5">
        <h1 className="mb-2 font-display text-xl text-text-main">{t('app.guideTitle')}</h1>
        <div className="mb-2.5 rounded-card border border-warning/40 bg-warning-light px-3.5 py-2.5">
          <p className="text-xs leading-relaxed text-text-sec">
            {t('app.guideWarning')}{' '}
            <strong className="text-warning">{t('app.guideWarningCycleInterpretation')}</strong>{' '}
            {t('app.guideWarningCycleInterpretationSuffix')}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-3">
        {!msgs.length && (
          <div>
            <p className="mb-2.5 font-display text-xs italic text-text-sec">{t('app.guideFAQTitle')}</p>
            {[t('app.guideFAQ1'), t('app.guideFAQ2'), t('app.guideFAQ3'), t('app.guideFAQ4'), t('app.guideFAQ5')].map(
              (q) => (
                <button
                  key={q}
                  onClick={() => sendAI(q)}
                  className="mb-2 block w-full rounded-card border border-border bg-surface px-3.5 py-3 text-left text-sm text-text-sec shadow-card transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {q}
                </button>
              ),
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`mb-2.5 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={[
                'max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'rounded-[16px_16px_4px_16px] bg-primary text-surface dark:text-bg-app'
                  : 'rounded-[16px_16px_16px_4px] border border-border bg-surface text-text-main shadow-card',
              ].join(' ')}
            >
              {m.content}
            </div>
          </div>
        ))}
        {aiLoading && (
          <div role="status" aria-label={t('common.loading')} className="flex gap-1 px-1 pb-3 pt-1">
            {[
              '[animation:dot_1s_0s_infinite]',
              '[animation:dot_1s_0.2s_infinite]',
              '[animation:dot_1s_0.4s_infinite]',
            ].map((animCls, i) => (
              <span
                key={i}
                className={`h-[7px] w-[7px] rounded-full bg-primary motion-reduce:animate-none ${animCls}`}
              />
            ))}
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      <div className="flex gap-2 border-t border-border bg-surface px-5 pb-6 pt-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendAI()}
          placeholder={t('app.guideInputPlaceholder')}
          aria-label={t('app.guideInputPlaceholder')}
          data-testid="guide-question-input"
          className="min-h-[44px] flex-1 rounded-card border border-border bg-bg-app px-3.5 py-2.5 text-base text-text-main outline-none transition-colors placeholder:text-text-sec/70 focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
        <button
          onClick={() => sendAI()}
          disabled={aiLoading || !input.trim()}
          aria-label={t('app.guideSend')}
          className="flex min-h-[44px] items-center justify-center rounded-card bg-primary px-4 text-surface transition-colors disabled:bg-border disabled:text-text-sec dark:text-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
