import { CalendarCheck, LayoutGrid, TrendingUp, Sparkles, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type PrimaryTab = 'hoje' | 'grafico' | 'analise' | 'guia' | 'perfil';

interface Props {
  /** current tab id — secondary tabs (vinculo/notificacoes/feedback) highlight Perfil */
  tab: string;
  onNavigate: (tab: PrimaryTab) => void;
}

const PERFIL_GROUP = ['perfil', 'vinculo', 'notificacoes', 'feedback'];

/**
 * Single bottom navigation (replaces the old duplicated header+footer 8-tab
 * bars). Five primary destinations; Vínculo, Notificações and Feedback live
 * inside Perfil. Safe-area aware (iOS home indicator).
 */
export function BottomNav({ tab, onNavigate }: Props) {
  const { t } = useTranslation();
  const items: { id: PrimaryTab; label: string; Icon: typeof CalendarCheck }[] = [
    { id: 'hoje', label: t('nav.hoje'), Icon: CalendarCheck },
    { id: 'grafico', label: t('nav.grafico'), Icon: LayoutGrid },
    { id: 'analise', label: t('nav.analise'), Icon: TrendingUp },
    { id: 'guia', label: t('nav.guia'), Icon: Sparkles },
    { id: 'perfil', label: t('nav.perfil'), Icon: User },
  ];

  return (
    <nav
      aria-label={t('nav.perfil')}
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div role="tablist" className="flex">
        {items.map(({ id, label, Icon }) => {
          const active = id === 'perfil' ? PERFIL_GROUP.includes(tab) : tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              data-testid={`nav-${id}`}
              onClick={() => onNavigate(id)}
              className={[
                'relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                active ? 'text-primary' : 'text-text-sec',
              ].join(' ')}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
              <span className={`text-xs ${active ? 'font-bold' : 'font-normal'}`}>{label}</span>
              <span
                aria-hidden="true"
                className={[
                  'absolute bottom-0 h-0.5 w-6 rounded-full transition-all duration-200 motion-reduce:transition-none',
                  active ? 'bg-primary' : 'bg-transparent',
                ].join(' ')}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
