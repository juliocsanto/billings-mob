/**
 * InstructorLinkNudge — a gentle prompt for an aluna without an active instructor
 * link to connect with one, so she can receive the clinical interpretation that
 * ONLY the certified instrutora provides.
 *
 * Clinical constraint (non-negotiable): this component makes NO fertility
 * inference. It is about obtaining the instrutora's interpretation — never about
 * classifying any day as fertile/infertile/safe/unsafe.
 *
 * States (driven by deriveInstructorLinkStatus):
 *   'none'    → CTA card inviting the aluna to link with an instructor.
 *   'pending' → subtle "invitation sent, awaiting" note.
 *   'active'  → renders nothing (she already has an instructor).
 */
import { UserPlus, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from './ui';

/**
 * @param {{ status: 'none' | 'pending' | 'active', onNavigate?: (tab: string) => void }} props
 */
export function InstructorLinkNudge({ status, onNavigate }) {
  const { t } = useTranslation();

  if (status === 'active') return null;

  if (status === 'pending') {
    return (
      <Card className="mb-3.5" data-testid="instructor-link-nudge-pending">
        <p className="flex items-center gap-2 text-xs leading-relaxed text-text-sec">
          <Clock size={16} aria-hidden="true" className="shrink-0" />
          {t('app.instructorNudgePending')}
        </p>
      </Card>
    );
  }

  // status === 'none' (also the safe default)
  return (
    <Card className="mb-3.5" data-testid="instructor-link-nudge">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primaryLight text-primary"
        >
          <UserPlus size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-main">{t('app.instructorNudgeTitle')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-sec">{t('app.instructorNudgeBody')}</p>
          <Button
            size="sm"
            className="mt-3"
            data-testid="instructor-link-nudge-cta"
            onClick={() => onNavigate?.('vinculo')}
          >
            {t('app.instructorNudgeCta')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
