// @vitest-environment jsdom
/**
 * Unit tests — PerfilPage: disclaimer text size (LVL-34)
 *
 * Covers:
 *  - Page renders without crashing
 *  - Disclaimer <p> uses text-sm (not text-xs) after LVL-34 bump
 *  - Clinical constraint: no fertile/infertile classification rendered
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

import { PerfilPage } from '../PerfilPage.jsx';

// ── Mock react-i18next ────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        'app.profileLabel': 'Perfil',
        'app.profileTitle': 'Minha conta',
        'auth.appName': 'Billings Gráfico',
        'auth.signOut': 'Sair',
        'app.myInstructor': 'Minha instrutora',
        'app.noInstructor': 'Sem instrutora',
        'app.noInstructorHint': 'Associe uma instrutora para começar.',
        'app.associateInstructor': 'Associar instrutora',
        'nav.vinculo': 'Vínculo',
        'nav.notificacoes': 'Notificações',
        'app.appearanceSection': 'Aparência',
        'app.remindersSection': 'Lembretes',
        'app.remindersDesc': 'Adicione um lembrete ao seu calendário.',
        'app.downloadReminder': 'Baixar lembrete',
        'app.importantLabel': 'Importante',
        'app.profileDisclaimer':
          'Este aplicativo é um apoio ao registro pessoal. Consulte sempre sua instrutora.',
        'common.selectLanguage': 'Selecionar idioma',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

// ── Mock ICS utils ────────────────────────────────────────────────────────────
vi.mock('../../utils/ics.js', () => ({
  generateDailyReminder: vi.fn(() => ({})),
  downloadICS: vi.fn(),
}));

// ── Mock dates utils ──────────────────────────────────────────────────────────
vi.mock('../../utils/dates.js', () => ({
  fmtShort: (ds) => ds,
}));

// ── Mock UI components ────────────────────────────────────────────────────────
vi.mock('../../components/ui', () => ({
  Button: ({ children, onClick, 'data-testid': testId }) => (
    <button onClick={onClick} data-testid={testId}>
      {children}
    </button>
  ),
  Card: ({ children, className }) => <div className={className}>{children}</div>,
  ThemeToggle: () => <button>Tema</button>,
}));

vi.mock('../../components/LanguageSelector.jsx', () => ({
  LanguageSelector: () => <select aria-label="Idioma" />,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderPage(overrides = {}) {
  return render(
    <PerfilPage
      user={null}
      activeLink={null}
      todayN={1}
      cycleStart="2026-07-01"
      onNavigate={vi.fn()}
      {...overrides}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PerfilPage — disclaimer text size (LVL-34)', () => {
  it('renders without crashing', () => {
    renderPage();
    // Behavioral assertion: disclaimer text renders and its paragraph uses text-sm (LVL-34)
    const disclaimerText = screen.getByText(/Este aplicativo é um apoio/);
    expect(disclaimerText).toBeTruthy();
    const disclaimerPara = disclaimerText.closest('p');
    expect(disclaimerPara?.className).toContain('text-sm');
  });

  it('renders the disclaimer text', () => {
    renderPage();
    expect(screen.getByText(/Este aplicativo é um apoio/)).toBeTruthy();
  });

  it('disclaimer <p> uses text-sm, not text-xs', () => {
    const { container } = renderPage();
    // Find the paragraph containing the disclaimer text
    const disclaimer = container.querySelector('p.text-sm.leading-relaxed.text-text-sec');
    expect(disclaimer).toBeTruthy();
    expect(disclaimer?.className).not.toContain('text-xs');
  });

  it('disclaimer warning card renders "Importante" label', () => {
    renderPage();
    expect(screen.getByText('Importante')).toBeTruthy();
  });
});

describe('PerfilPage — clinical constraint', () => {
  it('does not render any fertility classification label', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});
