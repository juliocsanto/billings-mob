// @vitest-environment jsdom
/**
 * TDD — RED phase: tests written before implementation (S7-11).
 *
 * Unit tests for the new sendAI function in App.jsx.
 *
 * ACs tested:
 * AC3 — sendAI with null session → shows guideNeedApiKeyMsg
 * AC4 — sendAI with 401 response from Edge → shows guideErrorConnection
 * AC5 — sendAI body contains ONLY { question } — no observations, stamps,
 *        notes, relations (LGPD assertion)
 *
 * LGPD: only { question } is sent to the Edge Function.
 * Clinical constraint: NEVER stamps/observations forwarded to Anthropic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

// jsdom does not implement scrollIntoView — mock it globally
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// ── Mock react-i18next ────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        'common.loading': 'Carregando...',
        'nav.hoje': 'Hoje',
        'nav.grafico': 'Gráfico',
        'nav.analise': 'Análise',
        'nav.guia': 'Guia',
        'nav.vinculo': 'Vínculo',
        'nav.notificacoes': 'Notificações',
        'nav.perfil': 'Perfil',
        'app.guideTitle': 'Guia de anotações',
        'app.guideWarning': 'Ajuda com o uso do app.',
        'app.guideWarningCycleInterpretation': 'Interpretação do ciclo',
        'app.guideWarningCycleInterpretationSuffix': 'é exclusiva da sua instrutora.',
        'app.guideFAQTitle': 'Perguntas frequentes',
        'app.guideFAQ1': 'O que é o Ápice?',
        'app.guideFAQ2': 'O que é PBI?',
        'app.guideFAQ3': 'Como registrar muco?',
        'app.guideFAQ4': 'O que é sangramento de manchas?',
        'app.guideFAQ5': 'Como editar um dia passado?',
        'app.guideInputPlaceholder': 'Escreva sua dúvida...',
        'app.guideNeedApiKeyMsg': 'Para usar o Guia IA, faça login no aplicativo.',
        'app.guideErrorResponse': 'Erro ao processar resposta.',
        'app.guideErrorConnection': 'Erro de conexão. Tente novamente.',
        'common.save': 'Salvar',
        'app.phaseSangramento': 'Sangramento',
        'app.phaseSeco': 'Seco',
        'app.phaseApice': 'Ápice',
        'stamps.muco': 'Muco',
      };
      return map[key] ?? key;
    },
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// ── Mock Supabase ─────────────────────────────────────────────────────────────
// Use vi.hoisted so these are available when vi.mock factory runs (hoisted to top)
const { mockGetSession, mockGetUser } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

// ── Mock storage utils ────────────────────────────────────────────────────────
vi.mock('../utils/storage', () => ({
  loadUserData: vi.fn(() => null),
  saveUserData: vi.fn(),
  loadApiKey: vi.fn(() => ''),
  saveApiKey: vi.fn(),
  getLastOpenDate: vi.fn(() => null),
  setLastOpenDate: vi.fn(),
}));

// ── Mock other imports ────────────────────────────────────────────────────────
vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn(),
}));

vi.mock('../pdf/ChartPDF.jsx', () => ({
  ChartDocument: () => null,
}));

vi.mock('../utils/ics', () => ({
  generateDailyReminder: vi.fn(() => ({})),
  downloadICS: vi.fn(),
}));

vi.mock('../utils/analysis', () => ({
  computeMultiCycleStats: vi.fn(() => ({})),
  getApiceDay: vi.fn(() => null),
}));

vi.mock('../components/DayDetailModal.jsx', () => ({
  DayDetailModal: () => null,
}));

vi.mock('../pages/LinkInstructorPage.tsx', () => ({
  LinkInstructorPage: () => null,
}));

vi.mock('../pages/NotificationPreferencesPage.tsx', () => ({
  NotificationPreferencesPage: () => null,
}));

// ── fetch mock ────────────────────────────────────────────────────────────────
// Routed by URL: hydration GETs from useObservationData (/api/cycles,
// /api/observations) answer with empty data; Edge Function calls consume the
// per-test `edgeResponses` queue (replaces the old mockResolvedValueOnce
// pattern, which the hydration calls would otherwise consume first).
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
const edgeResponses = [];
function queueEdgeResponse(res) {
  edgeResponses.push(res);
}
function edgeFetchCall() {
  return mockFetch.mock.calls.find(([url]) => String(url).includes('/functions/v1/ai-guide'));
}
function installFetchRouting() {
  mockFetch.mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/api/cycles') || u.includes('/api/observations')) {
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    }
    if (edgeResponses.length > 0) return edgeResponses.shift();
    return { ok: false, status: 500, body: null };
  });
}

// ── Import subject under test ─────────────────────────────────────────────────
import App from '../App.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────
const mockUser = { id: 'user-123', email: 'test@example.com' };
const mockSession = { access_token: 'mock-jwt-token', user: mockUser };

function buildSSEStream(tokens, done = true) {
  const chunks = tokens.map(t => `data: ${JSON.stringify({ token: t })}\n\n`);
  if (done) chunks.push('data: [DONE]\n\n');
  let index = 0;
  const encoder = new TextEncoder();
  return {
    getReader: () => ({
      read: vi.fn().mockImplementation(async () => {
        if (index < chunks.length) {
          return { done: false, value: encoder.encode(chunks[index++]) };
        }
        return { done: true, value: undefined };
      }),
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sendAI — Supabase Edge Function integration (S7-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    edgeResponses.length = 0;
    installFetchRouting();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  describe('AC3 — null session shows login required message', () => {
    it('displays guideNeedApiKeyMsg when session is null', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

      render(<App user={null} session={null} />);

      // Navigate to Guia tab
      const guiaTab = screen.getAllByRole('tab').find(el => el.textContent?.includes('Guia'));
      expect(guiaTab).toBeDefined();
      fireEvent.click(guiaTab);

      // Wait for the FAQ to appear
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Escreva sua dúvida...')).toBeInTheDocument();
      });

      // Click first FAQ question
      const faqButton = screen.getByText('O que é o Ápice?');
      fireEvent.click(faqButton);

      // Should show login required message
      await waitFor(() => {
        expect(screen.getByText('Para usar o Guia IA, faça login no aplicativo.')).toBeInTheDocument();
      });

      // fetch should never be called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('AC4 — 401 response from Edge shows error message', () => {
    it('displays guideErrorConnection when Edge Function returns 401', async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      queueEdgeResponse({
        ok: false,
        status: 401,
        body: null,
      });

      render(<App user={mockUser} session={mockSession} />);

      const guiaTab = screen.getAllByRole('tab').find(el => el.textContent?.includes('Guia'));
      fireEvent.click(guiaTab);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Escreva sua dúvida...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Escreva sua dúvida...');
      fireEvent.change(input, { target: { value: 'O que é PBI?' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Erro de conexão. Tente novamente.')).toBeInTheDocument();
      });
    });
  });

  describe('AC5 — LGPD: sendAI body contains ONLY { question }', () => {
    it('sends only { question } to the Edge Function — no observations/stamps/notes/relations', async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      queueEdgeResponse({
        ok: true,
        status: 200,
        body: buildSSEStream(['Olá!', ' Posso ajudar.']),
      });

      render(<App user={mockUser} session={mockSession} />);

      const guiaTab = screen.getAllByRole('tab').find(el => el.textContent?.includes('Guia'));
      fireEvent.click(guiaTab);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Escreva sua dúvida...')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Escreva sua dúvida...');
      fireEvent.change(input, { target: { value: 'O que é muco?' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Verify the body sent to the Edge Function
      const [url, options] = edgeFetchCall();

      // Must target the Edge Function, not the Anthropic API directly
      expect(url).toContain('/functions/v1/ai-guide');
      expect(url).not.toContain('api.anthropic.com');

      // Body must contain ONLY { question }
      const body = JSON.parse(options.body);
      expect(Object.keys(body)).toEqual(['question']);
      expect(body.question).toBe('O que é muco?');

      // LGPD: these fields must never be in the body
      expect(body).not.toHaveProperty('observations');
      expect(body).not.toHaveProperty('stamps');
      expect(body).not.toHaveProperty('notes');
      expect(body).not.toHaveProperty('relations');
      expect(body).not.toHaveProperty('obs');
      expect(body).not.toHaveProperty('history');
      expect(body).not.toHaveProperty('cycleStart');
      expect(body).not.toHaveProperty('userId');
    });

    it('Authorization header uses JWT from session, not an API key', async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      queueEdgeResponse({
        ok: true,
        status: 200,
        body: buildSSEStream(['Resposta.']),
      });

      render(<App user={mockUser} session={mockSession} />);

      const guiaTab = screen.getAllByRole('tab').find(el => el.textContent?.includes('Guia'));
      fireEvent.click(guiaTab);

      await waitFor(() => screen.getByPlaceholderText('Escreva sua dúvida...'));

      const input = screen.getByPlaceholderText('Escreva sua dúvida...');
      fireEvent.change(input, { target: { value: 'O que é seco?' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());

      const [, options] = edgeFetchCall();
      // Must use Supabase JWT, not an Anthropic API key
      expect(options.headers['Authorization']).toBe(`Bearer ${mockSession.access_token}`);
      expect(options.headers['Authorization']).not.toContain('sk-ant-');
    });
  });

  describe('Streaming — tokens accumulated in real time', () => {
    it('accumulates SSE tokens into the assistant message', async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      queueEdgeResponse({
        ok: true,
        status: 200,
        body: buildSSEStream(['Ápice', ' é o', ' dia de pico.']),
      });

      render(<App user={mockUser} session={mockSession} />);

      const guiaTab = screen.getAllByRole('tab').find(el => el.textContent?.includes('Guia'));
      fireEvent.click(guiaTab);

      await waitFor(() => screen.getByPlaceholderText('Escreva sua dúvida...'));

      const input = screen.getByPlaceholderText('Escreva sua dúvida...');
      fireEvent.change(input, { target: { value: 'O que é Ápice?' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Ápice é o dia de pico.')).toBeInTheDocument();
      });
    });
  });
});
