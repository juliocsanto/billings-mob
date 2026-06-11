/**
 * PerfilPage — account hub (extracted from App.jsx, Sprint 6 UI refresh).
 *
 * Aggregates: account (e-mail, sign-out, language, theme), "Minha instrutora"
 * (the REAL instructor link via useInstructorLink — the old localStorage-only
 * name/e-mail form was removed in the 2026-06 audit, C-3: it duplicated and
 * contradicted the Vínculo flow), entry points to Vínculo / Notificações /
 * Feedback, calendar reminders and the usage disclaimer.
 */
import { Bell, MessageSquareText, Link2, ChevronRight, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { generateDailyReminder, downloadICS } from '../utils/ics.js';
import { fmtShort } from '../utils/dates.js';
import { Button, Card, ThemeToggle } from '../components/ui';
import { LanguageSelector } from '../components/LanguageSelector.jsx';

export function PerfilPage({ user, activeLink, todayN, cycleStart, onNavigate }) {
  const { t } = useTranslation();

  const menuItems = [
    { id: 'vinculo', label: t('nav.vinculo'), Icon: Link2, testId: 'menu-vinculo' },
    { id: 'notificacoes', label: t('nav.notificacoes'), Icon: Bell, testId: 'menu-notificacoes' },
    { id: 'feedback', label: 'Feedback', Icon: MessageSquareText, testId: 'menu-feedback' },
  ];

  return (
    <div className="pb-28">
      <header className="border-b border-border bg-surface px-5 pb-4 pt-6">
        <p className="mb-1 font-display text-xs uppercase tracking-[0.14em] text-text-sec">
          {t('app.profileLabel')}
        </p>
        <h1 className="font-display text-2xl italic text-text-main">{t('app.profileTitle')}</h1>
      </header>

      <div className="px-5 pt-5">
        {/* Account */}
        {user && (
          <Card className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-text-main">{user.email}</p>
              <p className="mt-0.5 text-xs text-text-sec">{t('auth.appName')}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              data-testid="sign-out"
              onClick={() => supabase.auth.signOut()}
              className="shrink-0 text-text-sec"
            >
              <LogOut size={16} aria-hidden="true" />
              {t('auth.signOut')}
            </Button>
          </Card>
        )}

        {/* Minha instrutora — real link state (Vínculo flow) */}
        <h2 className="mb-3 font-display text-lg text-text-main">{t('app.myInstructor')}</h2>
        <Card className="mb-4">
          {activeLink ? (
            <>
              <div className="mb-3 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-primary/30 bg-primaryLight text-lg text-primary"
                >
                  {activeLink.instructor_name?.charAt(0) ?? '○'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-text-main">{activeLink.instructor_name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-success">
                    <span aria-hidden="true">✓</span> {t('app.activeAssociation')}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                fullWidth
                data-testid="share-whatsapp"
                className="mb-2"
                onClick={() =>
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(
                      t('app.whatsappMessage', {
                        name: activeLink.instructor_name,
                        day: todayN,
                        date: fmtShort(cycleStart),
                      }),
                    )}`,
                    '_blank',
                  )
                }
              >
                {t('app.shareWhatsApp')}
              </Button>
              <Button
                variant="ghost"
                fullWidth
                data-testid="manage-vinculo"
                className="text-text-sec"
                onClick={() => onNavigate('vinculo')}
              >
                {t('app.manageLink')}
              </Button>
            </>
          ) : (
            <div className="text-center">
              <p className="mb-1 font-display text-base text-text-sec">{t('app.noInstructor')}</p>
              <p className="mb-4 text-xs text-text-sec">{t('app.noInstructorHint')}</p>
              <Button fullWidth data-testid="go-vinculo" onClick={() => onNavigate('vinculo')}>
                {t('app.associateInstructor')}
              </Button>
            </div>
          )}
        </Card>

        {/* Menu */}
        <Card padded={false} className="mb-4 divide-y divide-border overflow-hidden">
          {menuItems.map(({ id, label, Icon, testId }) => (
            <button
              key={id}
              data-testid={testId}
              onClick={() => onNavigate(id)}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primaryLight/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <Icon size={18} aria-hidden="true" className="shrink-0 text-text-sec" />
              <span className="flex-1 text-sm font-semibold text-text-main">{label}</span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-sec" />
            </button>
          ))}
        </Card>

        {/* Appearance */}
        <h2 className="mb-3 font-display text-lg text-text-main">{t('app.appearanceSection')}</h2>
        <div className="mb-2">
          <ThemeToggle />
        </div>
        <Card className="mb-4 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-text-main">{t('common.selectLanguage')}</span>
          <LanguageSelector />
        </Card>

        {/* Reminders */}
        <h2 className="mb-3 font-display text-lg text-text-main">{t('app.remindersSection')}</h2>
        <Card className="mb-4">
          <p className="mb-3.5 text-sm leading-relaxed text-text-sec">{t('app.remindersDesc')}</p>
          <Button
            fullWidth
            data-testid="download-reminder"
            onClick={() => downloadICS(generateDailyReminder({ hour: 21 }))}
          >
            {t('app.downloadReminder')}
          </Button>
        </Card>

        {/* Disclaimer */}
        <div className="rounded-card border border-warning/40 bg-warning-light px-3.5 py-3">
          <p className="text-xs leading-relaxed text-text-sec">
            <strong className="text-warning">{t('app.importantLabel')}</strong> — {t('app.profileDisclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}
