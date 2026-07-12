/**
 * PrivacyTrustPage — in-app trust screen (distinct from the legal /privacy policy).
 *
 * Communicates REAL technical protections as user-facing differentiators.
 * Reachable from PerfilPage menu via onNavigate('privacidade').
 *
 * Clinical constraint: this page contains NO reference to cycles as fertile,
 * infertile, safe, or unsafe. The instructorNote explicitly states the app does
 * NOT classify days — this is a compliance disclaimer, not a classification.
 *
 * LGPD: mentions that sensitive fields (relations, notes, sensation) are scrubbed
 * from logs — no clinical values are rendered here.
 *
 * Verified facts (2026-07-11):
 *  - Supabase region sa-east-1 (São Paulo) — ACTIVE_HEALTHY
 *  - RLS enforced via createAuthenticatedClient
 *  - sensitiveFields scrubbed in sanitizeAuditData.ts + errorHandler.ts
 *  - JWT auth + session expiry (~60 min)
 *  - No advertising / data-selling
 *  - No clinical day classification by the app
 */
import { MapPin, Lock, EyeOff, ShieldCheck, Ban, UserCheck, ChevronLeft, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui';

// ── Protection item config — order matches spec (6 items) ────────────────────
const PROTECTIONS = [
  { key: 'item1', Icon: MapPin,       testId: 'privacy-residency'  },
  { key: 'item2', Icon: Lock,         testId: 'privacy-rls'        },
  { key: 'item3', Icon: EyeOff,       testId: 'privacy-scrub'      },
  { key: 'item4', Icon: ShieldCheck,  testId: 'privacy-auth'       },
  { key: 'item5', Icon: Ban,          testId: 'privacy-no-sell'    },
  { key: 'item6', Icon: UserCheck,    testId: 'privacy-instructor' },
];

// ── Component ─────────────────────────────────────────────────────────────────
/**
 * @param {{ onBack: () => void }} props
 */
export function PrivacyTrustPage({ onBack }) {
  const { t } = useTranslation();

  return (
    <div data-testid="privacy-trust-page" className="pb-28">
      {/* Header */}
      <header className="border-b border-border bg-surface px-5 pb-4 pt-6">
        <button
          data-testid="privacy-trust-back"
          onClick={onBack}
          aria-label={t('common.back')}
          className="mb-3 flex items-center gap-1 text-sm text-text-sec transition-colors duration-150 hover:text-text-main focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {t('common.back')}
        </button>
        <p className="mb-1 font-display text-xs uppercase tracking-[0.14em] text-text-sec">
          {t('privacyTrust.sectionLabel')}
        </p>
        <h1 className="font-display text-2xl italic text-text-main">
          {t('privacyTrust.pageTitle')}
        </h1>
      </header>

      <div className="px-5 pt-5">
        {/* Lead */}
        <p className="mb-5 text-sm leading-relaxed text-text-sec">
          {t('privacyTrust.heading')}
        </p>

        {/* Protection cards */}
        <ul className="mb-6 list-none space-y-3" aria-label={t('privacyTrust.sectionLabel')}>
          {PROTECTIONS.map(({ key, Icon, testId }) => (
            <li key={key} data-testid={testId}>
              <Card className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primaryLight text-primary"
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-main">
                    {t(`privacyTrust.${key}Title`)}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-text-sec">
                    {t(`privacyTrust.${key}Body`)}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        {/* Clinical authority note — app does NOT classify days */}
        <div className="mb-6 rounded-card border border-warning/40 bg-warning-light px-3.5 py-3">
          <p className="text-sm leading-relaxed text-text-sec">
            {t('privacyTrust.instructorNote')}
          </p>
        </div>

        {/* Link to full legal policy */}
        <a
          data-testid="privacy-full-policy-link"
          href="/privacy"
          className="flex items-center justify-center gap-2 rounded text-sm font-semibold text-primary underline underline-offset-2 transition-colors duration-150 hover:text-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {t('privacyTrust.fullPolicyCta')}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
