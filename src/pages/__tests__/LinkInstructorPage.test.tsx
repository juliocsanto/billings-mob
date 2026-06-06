// @vitest-environment jsdom
/**
 * TDD RED → GREEN → REFACTOR for S4-05: LinkInstructorPage
 *
 * Acceptance Criteria:
 *  AC1 — email search field renders on the page
 *  AC2 — loading spinner appears while search is in progress
 *  AC3 — error message when instructor is not found (Supabase returns null)
 *  AC4 — instructor card renders when search finds a result
 *  AC5 — "Solicitar vínculo" button fires POST /api/instructor-student-links
 *
 * Clinical constraint: page never mentions fertil, infertil, ciclo fértil, or
 * any interpretation of fertility status.
 *
 * LGPD: no data from other students is rendered; only instructor's name is shown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// ── Mock react-i18next so components render with pt-BR values ─────────────────
vi.mock('react-i18next', () => {
  const ptBR: Record<string, string> = {
    'linkInstructor.back': 'Voltar',
    'linkInstructor.sectionLabel': 'Vínculo',
    'linkInstructor.pageTitle': 'Minha instrutora',
    'linkInstructor.searchLabel': 'Buscar instrutora por e-mail',
    'linkInstructor.searchPlaceholder': 'email da instrutora',
    'linkInstructor.emailAriaLabel': 'E-mail da instrutora',
    'linkInstructor.searchButton': 'Buscar',
    'linkInstructor.searching': 'Buscando...',
    'linkInstructor.requestButton': 'Solicitar vínculo',
    'linkInstructor.requestSent': 'Solicitação enviada',
    'linkInstructor.requestSuccess': 'Solicitação enviada com sucesso. Aguarde a aprovação da instrutora.',
    'linkInstructor.existingLinks': 'Vínculos existentes',
    'linkInstructor.emptyState': 'Nenhum vínculo ainda',
    'linkInstructor.emptyStateBody': 'Busque a instrutora pelo e-mail cadastrado e envie uma solicitação.',
    'linkInstructor.disclaimer': 'A instrutora receberá uma notificação e deverá aprovar o vínculo antes de ter acesso aos seus registros.',
    'linkInstructor.disclaimerTitle': 'Aviso',
    'linkInstructor.certifiedInstructor': 'Instrutora certificada',
    'linkInstructor.instructor': 'Instrutora',
    'linkStatus.pending': 'Pendente',
    'linkStatus.active': 'Ativo',
    'linkStatus.revoked': 'Revogado',
    'common.loading': 'Carregando...',
  };
  return {
    useTranslation: () => ({
      t: (key: string) => ptBR[key] ?? key,
      i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
    }),
  };
});

// ── Mock useInstructorLink so we can control all async state ──────────────────
vi.mock('../../hooks/useInstructorLink', () => ({
  useInstructorLink: vi.fn(),
}));

import { useInstructorLink } from '../../hooks/useInstructorLink';
import { LinkInstructorPage } from '../LinkInstructorPage';

// ── Helper: default mock state (idle, no results) ─────────────────────────────
function defaultMock() {
  return {
    loading: false,
    error: null,
    instructor: null,
    links: [],
    searchInstructor: vi.fn(),
    requestLink: vi.fn(),
    getMyLinks: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useInstructorLink).mockReturnValue(defaultMock());
});

afterEach(() => {
  cleanup();
});

// ── AC1: email search field renders ───────────────────────────────────────────
describe('AC1 — renders email search field', () => {
  it('renders an email input and a Buscar button', () => {
    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );

    const input = container.querySelector('input[type="email"]');
    expect(input).not.toBeNull();

    const btns = container.querySelectorAll('button');
    const buscarBtn = Array.from(btns).find(b => b.textContent?.toLowerCase().includes('buscar'));
    expect(buscarBtn).toBeDefined();
  });

  it('renders a section heading about linking instructor', () => {
    render(<LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />);
    // The header renders "Minha instrutora" as the page title
    const headings = screen.getAllByText('Minha instrutora');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });
});

// ── AC2: loading state while search is running ────────────────────────────────
describe('AC2 — shows loading indicator during search', () => {
  it('shows loading text when loading=true', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      loading: true,
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );

    // The page should surface a loading indicator with role="status"
    const loader = container.querySelector('[role="status"]');
    expect(loader).not.toBeNull();
  });

  it('calls searchInstructor with entered email when Buscar is clicked', async () => {
    const mockSearch = vi.fn();
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      searchInstructor: mockSearch,
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );

    const input = container.querySelector('input[type="email"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    // Change the controlled input value
    fireEvent.change(input, { target: { value: 'instrutora@billings.app' } });

    // Now the Buscar button should be enabled — find the first one in this container
    const buttons = container.querySelectorAll('button');
    const buscarBtn = Array.from(buttons).find(b => b.textContent?.toLowerCase().includes('buscar'));
    expect(buscarBtn).toBeDefined();
    fireEvent.click(buscarBtn!);

    expect(mockSearch).toHaveBeenCalledWith('instrutora@billings.app');
  });
});

// ── AC3: error when instructor not found ──────────────────────────────────────
describe('AC3 — error when instructor not found', () => {
  it('renders error message when error state is set', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      error: 'Instrutora não encontrada',
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );
    expect(container.textContent).toMatch(/instrutora não encontrada/i);
  });

  it('renders error for already linked state', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      error: 'Já existe um vínculo com esta instrutora',
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );
    expect(container.textContent).toMatch(/já existe um vínculo/i);
  });

  it('renders error for pending request state', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      error: 'Solicitação já enviada e aguardando aprovação',
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );
    expect(container.textContent).toMatch(/solicitação já enviada/i);
  });
});

// ── AC4: instructor card when found ───────────────────────────────────────────
describe('AC4 — instructor card renders when found', () => {
  const foundInstructor = { id: 'instr-001', display_name: 'Maria Instrutora' };

  it('displays instructor name in a card', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      instructor: foundInstructor,
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );
    expect(container.textContent).toContain('Maria Instrutora');
  });

  it('shows a "Solicitar vínculo" button when instructor is found', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      loading: false,
      instructor: foundInstructor,
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );

    // The instructor name must appear
    expect(container.textContent).toContain('Maria Instrutora');

    // The button label before clicking is "Solicitar vínculo"
    const btns = container.querySelectorAll('button');
    const requestBtn = Array.from(btns).find(b => b.textContent?.toLowerCase().includes('solicitar'));
    expect(requestBtn).toBeDefined();
  });

  it('does NOT show instructor card when instructor is null', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      loading: false,
      instructor: null,
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );

    expect(container.textContent).not.toContain('Maria Instrutora');
    // No "Solicitar" button should be present
    const btns = container.querySelectorAll('button');
    const requestBtn = Array.from(btns).find(b => b.textContent?.toLowerCase().includes('solicitar'));
    expect(requestBtn).toBeUndefined();
  });
});

// ── AC5: POST is fired when "Solicitar vínculo" clicked ───────────────────────
describe('AC5 — Solicitar vínculo fires POST', () => {
  const foundInstructor = { id: 'instr-001', display_name: 'Maria Instrutora' };

  it('calls requestLink with instructor id when button is clicked', async () => {
    const mockRequestLink = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      loading: false,
      instructor: foundInstructor,
      requestLink: mockRequestLink,
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );

    const btns = container.querySelectorAll('button');
    const requestBtn = Array.from(btns).find(b => b.textContent?.toLowerCase().includes('solicitar'));
    expect(requestBtn).toBeDefined();
    fireEvent.click(requestBtn!);

    expect(mockRequestLink).toHaveBeenCalledWith('instr-001');
  });

  it('shows success message after request is sent', async () => {
    const mockRequestLink = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      loading: false,
      instructor: foundInstructor,
      requestLink: mockRequestLink,
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );

    const btns = container.querySelectorAll('button');
    const requestBtn = Array.from(btns).find(b => b.textContent?.toLowerCase().includes('solicitar'));
    expect(requestBtn).toBeDefined();
    fireEvent.click(requestBtn!);

    await waitFor(() => {
      expect(mockRequestLink).toHaveBeenCalledWith('instr-001');
    });
    // After click, success banner should appear in the container
    await waitFor(() => {
      expect(container.textContent).toMatch(/solicitação enviada com sucesso/i);
    });
  });
});

// ── Links list: existing links section ────────────────────────────────────────
describe('existing links list', () => {
  it('renders pending link with status label', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      links: [
        {
          id: 'link-001',
          instructor_id: 'instr-001',
          status: 'pending',
          instructor_name: 'Ana Lima',
        },
      ],
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );
    expect(container.textContent).toContain('Ana Lima');
    expect(container.textContent).toMatch(/pendente/i);
  });

  it('renders active link with status label', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      links: [
        {
          id: 'link-002',
          instructor_id: 'instr-002',
          status: 'active',
          instructor_name: 'Carla Ferreira',
        },
      ],
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );
    expect(container.textContent).toContain('Carla Ferreira');
    expect(container.textContent).toMatch(/ativo/i);
  });
});

// ── Clinical constraint ────────────────────────────────────────────────────────
describe('clinical constraint — no fertility interpretation', () => {
  it('never renders fertile/infertile labels', () => {
    vi.mocked(useInstructorLink).mockReturnValue({
      ...defaultMock(),
      instructor: { id: 'instr-001', display_name: 'Maria Instrutora' },
      links: [{ id: 'l1', instructor_id: 'instr-001', status: 'active', instructor_name: 'Maria Instrutora' }],
    });

    const { container } = render(
      <LinkInstructorPage session={{ access_token: 'tok_123', user: { id: 'u1' } } as never} />,
    );

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/fértil|fertil|infértil|infertil/i);
  });
});
