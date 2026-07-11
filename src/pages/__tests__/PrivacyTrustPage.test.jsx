// @vitest-environment jsdom
/**
 * Unit tests — PrivacyTrustPage
 *
 * AC1 — Page renders with data-testid="privacy-trust-page"
 * AC2 — Residency row present + mentions Brasil and sa-east-1
 * AC3 — Full-policy link points to /privacy
 * AC4 — No fertility classification language rendered
 * AC5 — Back button calls onBack
 * AC6 — PerfilPage menu item "menu-privacidade" navigates to 'privacidade'
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

afterEach(cleanup);

import { PrivacyTrustPage } from '../PrivacyTrustPage.jsx';
import { PerfilPage } from '../PerfilPage.jsx';

// ── Shared i18n mock ──────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        // PrivacyTrustPage keys
        'privacyTrust.pageTitle':    'Privacidade & Seus Dados',
        'privacyTrust.sectionLabel': 'Proteções',
        'privacyTrust.heading':      'Proteções reais que aplicamos.',
        'privacyTrust.item1Title':   'Seus dados ficam no Brasil',
        'privacyTrust.item1Body':    'Banco de dados na região sa-east-1 (São Paulo). Dados de saúde nunca saem do território nacional.',
        'privacyTrust.item2Title':   'Só você e sua instrutora têm acesso',
        'privacyTrust.item2Body':    'Row Level Security (RLS) ativo.',
        'privacyTrust.item3Title':   'Dados sensíveis nunca aparecem em logs',
        'privacyTrust.item3Body':    'Os campos relações, notas e sensação são removidos automaticamente.',
        'privacyTrust.item4Title':   'Acesso sempre autenticado',
        'privacyTrust.item4Body':    'Toda chamada à API exige autenticação válida. Sessão expira (≈60 min), JWT.',
        'privacyTrust.item5Title':   'Zero monetização dos seus dados',
        'privacyTrust.item5Body':    'Seus dados jamais são vendidos ou repassados.',
        'privacyTrust.item6Title':   'O app não interpreta o seu ciclo',
        'privacyTrust.item6Body':    'Interpretação clínica é responsabilidade exclusiva da instrutora CENPLAFAM/WOOMB.',
        'privacyTrust.instructorNote': 'O app NÃO classifica dias. Quem interpreta é sua instrutora.',
        'privacyTrust.fullPolicyCta':  'Ler a Política de Privacidade completa',
        // common
        'common.back':               'Voltar',
        // PerfilPage keys
        'app.profileLabel':          'Perfil',
        'app.profileTitle':          'Minha conta',
        'auth.appName':              'Billings Gráfico',
        'auth.signOut':              'Sair',
        'app.myInstructor':          'Minha instrutora',
        'app.noInstructor':          'Sem instrutora',
        'app.noInstructorHint':      'Associe uma instrutora para começar.',
        'app.associateInstructor':   'Associar instrutora',
        'nav.vinculo':               'Vínculo',
        'nav.notificacoes':          'Notificações',
        'nav.privacidade':           'Privacidade',
        'app.appearanceSection':     'Aparência',
        'app.remindersSection':      'Lembretes',
        'app.remindersDesc':         'Adicione um lembrete ao seu calendário.',
        'app.downloadReminder':      'Baixar lembrete',
        'app.importantLabel':        'Importante',
        'app.profileDisclaimer':     'Este aplicativo é um apoio ao registro pessoal.',
        'common.selectLanguage':     'Selecionar idioma',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Mock supabase (needed by PerfilPage) ──────────────────────────────────────
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

// ── Mock ICS utils (needed by PerfilPage) ─────────────────────────────────────
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
  Button: ({ children, onClick, 'data-testid': testId, ...rest }) => (
    <button onClick={onClick} data-testid={testId} {...rest}>
      {children}
    </button>
  ),
  Card: ({ children, className }) => <div className={className ?? ''}>{children}</div>,
  ThemeToggle: () => <button>Tema</button>,
}));

vi.mock('../../components/LanguageSelector.jsx', () => ({
  LanguageSelector: () => <select aria-label="Idioma" />,
}));

// ── PrivacyTrustPage tests ────────────────────────────────────────────────────

describe('PrivacyTrustPage', () => {
  it('AC1: renders with data-testid="privacy-trust-page"', () => {
    const { getByTestId } = render(<PrivacyTrustPage onBack={vi.fn()} />);
    expect(getByTestId('privacy-trust-page')).toBeTruthy();
  });

  it('AC2a: residency row is present (testid privacy-residency)', () => {
    const { getByTestId } = render(<PrivacyTrustPage onBack={vi.fn()} />);
    expect(getByTestId('privacy-residency')).toBeTruthy();
  });

  it('AC2b: residency row body mentions Brasil', () => {
    render(<PrivacyTrustPage onBack={vi.fn()} />);
    const text = screen.getByTestId('privacy-residency').textContent ?? '';
    expect(text).toMatch(/Brasil/i);
  });

  it('AC2c: residency row body mentions sa-east-1', () => {
    render(<PrivacyTrustPage onBack={vi.fn()} />);
    const text = screen.getByTestId('privacy-residency').textContent ?? '';
    expect(text).toMatch(/sa-east-1/);
  });

  it('AC3: full-policy link points to /privacy', () => {
    render(<PrivacyTrustPage onBack={vi.fn()} />);
    const link = screen.getByTestId('privacy-full-policy-link');
    expect(link.getAttribute('href')).toBe('/privacy');
  });

  it('AC3b: full-policy link has discernible text', () => {
    render(<PrivacyTrustPage onBack={vi.fn()} />);
    const link = screen.getByTestId('privacy-full-policy-link');
    expect(link.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('AC4: no fertility classification language rendered', () => {
    const { container } = render(<PrivacyTrustPage onBack={vi.fn()} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bf[eé]rtil\b/i);
    expect(text).not.toMatch(/\binf[eé]rtil\b/i);
    expect(text).not.toMatch(/\bseguro\b/i);
    expect(text).not.toMatch(/\binseguro\b/i);
  });

  it('AC5: back button calls onBack', () => {
    const onBack = vi.fn();
    render(<PrivacyTrustPage onBack={onBack} />);
    const backBtn = screen.getByTestId('privacy-trust-back');
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders all 6 protection items', () => {
    render(<PrivacyTrustPage onBack={vi.fn()} />);
    // Each li is one protection — count them
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(6);
  });

  it('heading (h1) is present', () => {
    render(<PrivacyTrustPage onBack={vi.fn()} />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeTruthy();
    expect(h1.textContent).toContain('Privacidade');
  });
});

// ── PerfilPage — menu item navigation ────────────────────────────────────────

describe('PerfilPage — menu-privacidade item', () => {
  function renderPerfil(overrides = {}) {
    const onNavigate = vi.fn();
    const { container } = render(
      <PerfilPage
        user={null}
        activeLink={null}
        todayN={1}
        cycleStart="2026-07-01"
        onNavigate={onNavigate}
        {...overrides}
      />,
    );
    return { onNavigate, container };
  }

  it('AC6a: menu-privacidade button is present', () => {
    renderPerfil();
    expect(screen.getByTestId('menu-privacidade')).toBeTruthy();
  });

  it('AC6b: clicking menu-privacidade calls onNavigate with "privacidade"', () => {
    const { onNavigate } = renderPerfil();
    fireEvent.click(screen.getByTestId('menu-privacidade'));
    expect(onNavigate).toHaveBeenCalledWith('privacidade');
  });

  it('AC6c: no fertility label in Perfil page', () => {
    const { container } = renderPerfil();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});
