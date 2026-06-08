/**
 * Unit tests — Email Hexagonal Adapter (ADR-019)
 *
 * TDD Red/Green/Refactor — written before implementation.
 *
 * Tests:
 *  - MockEmailAdapter: sends no real HTTP, stores messages, exposes inbox
 *  - ResendEmailAdapter: error handling when RESEND_API_KEY is missing
 *  - emailFactory: returns MockEmailAdapter by default, ResendEmailAdapter in production
 *
 * LGPD: tests never include clinical data (stamps, relations, notes, cycle).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MockEmailAdapter } from '../email/MockEmailAdapter';
import { ResendEmailAdapter } from '../email/ResendEmailAdapter';
import { getEmailAdapter } from '../email/emailFactory';
import type { EmailMessage } from '../email/EmailPort';

// ─── MockEmailAdapter ─────────────────────────────────────────────────────────

describe('MockEmailAdapter', () => {
  let adapter: MockEmailAdapter;

  beforeEach(() => {
    adapter = new MockEmailAdapter();
  });

  it('isAvailable returns true', () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it('sendEmail returns success with a mock messageId', async () => {
    const message: EmailMessage = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    };

    const result = await adapter.sendEmail(message);

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^mock-email-/);
  });

  it('stores sent messages in the inbox', async () => {
    const message: EmailMessage = {
      to: 'admin@billings.app',
      subject: 'Novo feedback',
      html: '<p>Feedback triado</p>',
    };

    await adapter.sendEmail(message);

    const inbox = adapter.getInbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].to).toBe('admin@billings.app');
    expect(inbox[0].subject).toBe('Novo feedback');
  });

  it('getInbox returns a copy — mutations do not affect stored messages', async () => {
    await adapter.sendEmail({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>test</p>',
    });

    const inbox = adapter.getInbox();
    inbox[0].to = 'mutated@test.com'; // mutate the returned copy

    // Original stored message should be unchanged
    expect(adapter.getInbox()[0].to).toBe('user@test.com');
  });

  it('clearInbox removes all messages', async () => {
    await adapter.sendEmail({ to: 'a@test.com', subject: 'A', html: '<p>A</p>' });
    await adapter.sendEmail({ to: 'b@test.com', subject: 'B', html: '<p>B</p>' });

    expect(adapter.getInbox()).toHaveLength(2);

    adapter.clearInbox();

    expect(adapter.getInbox()).toHaveLength(0);
  });

  it('never sends HTTP requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await adapter.sendEmail({ to: 'x@test.com', subject: 'X', html: '<p>X</p>' });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does not include clinical terms in any log', async () => {
    // LGPD / clinical constraint validation
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await adapter.sendEmail({
      to: 'test@test.com',
      subject: 'Feedback de usuário',
      html: '<p>Sugestão de melhoria de UX</p>',
    });

    // The warn call must not expose the full HTML body (which could leak data)
    const warnCalls = consoleWarnSpy.mock.calls.flat().join(' ');
    expect(warnCalls).not.toContain('<p>');

    consoleWarnSpy.mockRestore();
  });
});

// ─── ResendEmailAdapter ───────────────────────────────────────────────────────

describe('ResendEmailAdapter', () => {
  let adapter: ResendEmailAdapter;

  beforeEach(() => {
    adapter = new ResendEmailAdapter();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('isAvailable returns false when RESEND_API_KEY is absent', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(adapter.isAvailable()).toBe(false);
  });

  it('isAvailable returns true when RESEND_API_KEY is set', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    expect(adapter.isAvailable()).toBe(true);
  });

  it('sendEmail returns error when RESEND_API_KEY is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await adapter.sendEmail({
      to: 'test@test.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY');
  });

  it('sendEmail sends POST to Resend API with correct headers', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_abc123');
    vi.stubEnv('EMAIL_FROM', 'Billings <noreply@billings.app>');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'resend-msg-001' }), { status: 200 }),
    );

    const result = await adapter.sendEmail({
      to: 'admin@example.com',
      subject: 'Feedback triado',
      html: '<p>Resumo de triage</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('resend-msg-001');

    const [url, options] = fetchMock.mock.calls[0] as [string, { method?: string; body?: string; headers?: Record<string, string> }];
    expect(url).toBe('https://api.resend.com/emails');
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer re_test_abc123',
    );

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body['to']).toEqual(['admin@example.com']);
    expect(body['from']).toBe('Billings <noreply@billings.app>');

    fetchMock.mockRestore();
  });

  it('sendEmail returns error on HTTP failure', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const result = await adapter.sendEmail({
      to: 'x@test.com',
      subject: 'X',
      html: '<p>X</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    fetchMock.mockRestore();
  });
});

// ─── emailFactory ─────────────────────────────────────────────────────────────
// Note: vi.resetModules() re-imports the module, so instanceof comparisons with
// top-level imports will fail (different class instances from different module
// evaluations). We check constructor.name as a stable string identifier instead.

describe('getEmailAdapter (emailFactory)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns MockEmailAdapter by default (EMAIL_ENV not set)', async () => {
    vi.stubEnv('EMAIL_ENV', '');
    const { getEmailAdapter: freshFactory } = await import('../email/emailFactory');
    const adapter = freshFactory();
    expect(adapter.constructor.name).toBe('MockEmailAdapter');
  });

  it('returns MockEmailAdapter when EMAIL_ENV=mock', async () => {
    vi.stubEnv('EMAIL_ENV', 'mock');
    const { getEmailAdapter: freshFactory } = await import('../email/emailFactory');
    const adapter = freshFactory();
    expect(adapter.constructor.name).toBe('MockEmailAdapter');
  });

  it('returns ResendEmailAdapter when EMAIL_ENV=production', async () => {
    vi.stubEnv('EMAIL_ENV', 'production');
    const { getEmailAdapter: freshFactory } = await import('../email/emailFactory');
    const adapter = freshFactory();
    expect(adapter.constructor.name).toBe('ResendEmailAdapter');
  });
});

// ─── LGPD constraints on email templates ─────────────────────────────────────

describe('Email template LGPD constraints', () => {
  it('feedbackPendingAdminHtml does not contain clinical terms', async () => {
    const { feedbackPendingAdminHtml } = await import(
      '../email/templates/feedbackPendingAdmin'
    );

    const html = feedbackPendingAdminHtml({
      feedbackId: 'uuid-001',
      feedbackTitle: 'Melhorar a usabilidade do gráfico',
      category: 'feature',
      authorRole: 'student',
      triageType: 'app_functionality',
      triageImpact: 'medium',
      triageSummary: 'Usuário sugere melhorar visualização.',
      triageRoadmap: 'Sprint 9',
      triageAgents: 'ui-engineer',
      triageSkills: 'react-component-builder',
      triageCosts: '4h de desenvolvimento',
      adminPanelUrl: 'https://billings-mob.vercel.app/admin/feedback/uuid-001',
    });

    // Must not contain clinical classification terms
    expect(html).not.toMatch(/fértil|infértil|fertil|infertil|seguro|inseguro/i);
    // Must contain the feedback title
    expect(html).toContain('Melhorar a usabilidade do gráfico');
    // Must contain the admin URL
    expect(html).toContain('uuid-001');
  });

  it('feedbackFinalApprovedHtml does not contain clinical terms', async () => {
    const { feedbackFinalApprovedHtml } = await import(
      '../email/templates/feedbackFinalApproved'
    );

    const html = feedbackFinalApprovedHtml({
      userName: 'Maria Silva',
      feedbackTitle: 'Notificação de Ápice no app',
      discountPercent: 50,
    });

    expect(html).not.toMatch(/fértil|infértil|fertil|infertil|seguro|inseguro/i);
    expect(html).toContain('Maria Silva');
    expect(html).toContain('50%');
  });
});

// ─── getEmailAdapter is a singleton ──────────────────────────────────────────

describe('getEmailAdapter singleton behavior', () => {
  it('returns the same instance on repeated calls', () => {
    const first = getEmailAdapter();
    const second = getEmailAdapter();
    expect(first).toBe(second);
  });
});
