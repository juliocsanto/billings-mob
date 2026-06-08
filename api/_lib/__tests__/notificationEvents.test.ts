/**
 * Unit tests — NotificationEvent + buildPayload for feedback events (ADR-018)
 *
 * TDD Red/Green/Refactor — written before implementation.
 *
 * Tests:
 *  - buildPayload handles feedback_triaged, feedback_deployed, user_feedback_implemented
 *  - buildWhatsAppTemplate handles new event types
 *  - No clinical terms in any payload
 *
 * LGPD: no clinical data in notification metadata.
 */

import { describe, it, expect } from 'vitest';
import { buildPayload, buildWhatsAppTemplate } from '../notifications/buildPayload';
import type { NotificationEvent } from '../notifications/NotificationEvent';

// ─── buildPayload — feedback events ──────────────────────────────────────────

describe('buildPayload — feedback events (ADR-018)', () => {
  it('feedback_triaged: builds correct title and body for admin notification', () => {
    const event: NotificationEvent = {
      type: 'feedback_triaged',
      recipientId: 'admin-uuid',
      entityId: 'feedback-uuid-001',
      metadata: {
        feedbackTitle: 'Melhorar gráfico de ciclo',
        triageImpact: 'high',
      },
    };

    const payload = buildPayload(event);

    expect(payload.title).toContain('feedback');
    expect(payload.body).toContain('Melhorar gráfico de ciclo');
    expect(payload.body).toContain('high');
  });

  it('feedback_deployed: builds correct message for admin to confirm deploy', () => {
    const event: NotificationEvent = {
      type: 'feedback_deployed',
      recipientId: 'admin-uuid',
      entityId: 'feedback-uuid-002',
      metadata: {
        feedbackTitle: 'Notificação de Ápice',
      },
    };

    const payload = buildPayload(event);

    expect(payload.title).toContain('deploy');
    expect(payload.body).toContain('Notificação de Ápice');
  });

  it('user_feedback_implemented: builds correct congratulation message for user', () => {
    const event: NotificationEvent = {
      type: 'user_feedback_implemented',
      recipientId: 'user-uuid',
      entityId: 'feedback-uuid-003',
      metadata: {
        feedbackTitle: 'Tema escuro para o app',
        userName: 'Maria Silva',
        discountPercent: 50,
      },
    };

    const payload = buildPayload(event);

    expect(payload.title).toContain('implementada');
    expect(payload.body).toContain('Maria Silva');
    expect(payload.body).toContain('50%');
    expect(payload.body).toContain('Tema escuro para o app');
  });

  it('user_feedback_implemented: defaults to 50% when discountPercent is not provided', () => {
    const event: NotificationEvent = {
      type: 'user_feedback_implemented',
      recipientId: 'user-uuid',
      entityId: 'feedback-uuid-004',
      metadata: {
        feedbackTitle: 'Bug fix na sincronização',
      },
    };

    const payload = buildPayload(event);
    expect(payload.body).toContain('50%');
  });

  it('feedback_triaged: gracefully handles missing feedbackTitle', () => {
    const event: NotificationEvent = {
      type: 'feedback_triaged',
      recipientId: 'admin-uuid',
      entityId: 'feedback-uuid-005',
      metadata: {},
    };

    const payload = buildPayload(event);
    expect(payload.title).toBeTruthy();
    expect(payload.body).toBeTruthy();
  });
});

// ─── buildPayload — clinical term constraint ──────────────────────────────────

describe('buildPayload — clinical constraint (no fértil/infértil/seguro/inseguro)', () => {
  const feedbackEventTypes: NotificationEvent['type'][] = [
    'feedback_triaged',
    'feedback_deployed',
    'user_feedback_implemented',
  ];

  it.each(feedbackEventTypes)(
    'buildPayload for %s does not emit clinical terms',
    (type) => {
      const event: NotificationEvent = {
        type,
        recipientId: 'test-uuid',
        entityId: 'test-entity',
        metadata: {
          feedbackTitle: 'Test feedback',
          triageImpact: 'high',
          userName: 'Test User',
          discountPercent: 50,
        },
      };

      const payload = buildPayload(event);
      const allText = `${payload.title} ${payload.body}`;

      expect(allText).not.toMatch(/fértil|infértil|fertil|infertil|seguro|inseguro/i);
    },
  );
});

// ─── buildWhatsAppTemplate — feedback events ──────────────────────────────────

describe('buildWhatsAppTemplate — feedback events', () => {
  it('feedback_triaged: returns correct template name and params', () => {
    const event: NotificationEvent = {
      type: 'feedback_triaged',
      recipientId: 'admin-uuid',
      entityId: 'feedback-uuid-001',
      metadata: {
        feedbackTitle: 'Melhorar gráfico',
        triageImpact: 'medium',
      },
    };

    const template = buildWhatsAppTemplate(event);

    expect(template).not.toBeNull();
    expect(template?.templateName).toBe('billings_feedback_triado');
    expect(template?.templateParams).toContain('Melhorar gráfico');
    expect(template?.templateParams).toContain('medium');
  });

  it('feedback_deployed: returns correct template', () => {
    const event: NotificationEvent = {
      type: 'feedback_deployed',
      recipientId: 'admin-uuid',
      entityId: 'feedback-uuid-002',
      metadata: { feedbackTitle: 'Nova feature' },
    };

    const template = buildWhatsAppTemplate(event);

    expect(template).not.toBeNull();
    expect(template?.templateName).toBe('billings_feedback_deployado');
    expect(template?.templateParams).toContain('Nova feature');
  });

  it('user_feedback_implemented: returns correct template with discount', () => {
    const event: NotificationEvent = {
      type: 'user_feedback_implemented',
      recipientId: 'user-uuid',
      entityId: 'feedback-uuid-003',
      metadata: {
        feedbackTitle: 'Tema escuro',
        userName: 'Ana',
        discountPercent: 50,
      },
    };

    const template = buildWhatsAppTemplate(event);

    expect(template).not.toBeNull();
    expect(template?.templateName).toBe('billings_feedback_implementado');
    expect(template?.templateParams).toContain('Ana');
    expect(template?.templateParams).toContain('Tema escuro');
    expect(template?.templateParams).toContain('50');
  });

  it('all feedback template params contain no clinical terms', () => {
    const events: NotificationEvent[] = [
      {
        type: 'feedback_triaged',
        recipientId: 'a',
        entityId: 'b',
        metadata: { feedbackTitle: 'Test', triageImpact: 'low' },
      },
      {
        type: 'feedback_deployed',
        recipientId: 'a',
        entityId: 'b',
        metadata: { feedbackTitle: 'Test' },
      },
      {
        type: 'user_feedback_implemented',
        recipientId: 'a',
        entityId: 'b',
        metadata: { feedbackTitle: 'Test', userName: 'User', discountPercent: 50 },
      },
    ];

    for (const event of events) {
      const template = buildWhatsAppTemplate(event);
      const paramText = template?.templateParams?.join(' ') ?? '';
      expect(paramText).not.toMatch(/fértil|infértil|fertil|infertil|seguro|inseguro/i);
    }
  });
});

// ─── requireAdmin — auth middleware ──────────────────────────────────────────

describe('requireAdmin middleware', () => {
  it('calls next() when auth context has role admin', async () => {
    const { requireAdmin } = await import('../auth');
    const mockAuth = { userId: 'admin-uuid', role: 'admin' as const, jwt: 'tok' };

    // Simulate a Context that already has auth set (requireAuth passed)
    // requireAdmin chains requireAuth first; mock supabase so requireAuth passes
    const { vi } = await import('vitest');
    const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'admin-uuid', user_metadata: {} } }, error: null });
    const mockSingle = vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    const mockSupabase = { auth: { getUser: mockGetUser }, from: mockFrom };

    const { Hono } = await import('hono');
    const { vi: _vi } = await import('vitest');

    // Create a mini app to test requireAdmin end-to-end
    // We need to mock createAuthenticatedClient used inside requireAuth
    // The simplest behavioral test: inject auth via c.set and verify next() runs
    // Use a Hono test app where we set auth manually and call requireAdmin directly
    const app = new Hono();
    app.use('/test', async (c, next) => {
      // Pre-set auth context as if requireAuth already ran
      c.set('auth', mockAuth);
      await next();
    });

    let nextCalled = false;
    // requireAdmin verifies c.get('auth').role; but it chains requireAuth first.
    // We test it indirectly: when auth.role is 'admin', requireAdmin must call next().
    // Since requireAdmin calls requireAuth internally which hits Supabase,
    // we test the role-check logic via a minimal Context simulation.
    const mockNext = async () => { nextCalled = true; };
    const fakeCtx = {
      req: { header: () => 'Bearer valid-token' },
      json: (body: unknown, status?: number) => ({ body, status }),
      get: (key: string) => key === 'auth' ? mockAuth : undefined,
      set: () => {},
    };

    // Patch createAuthenticatedClient to return mock supabase
    const supabaseClientModule = await import('../supabaseClient');
    const spy = vi.spyOn(supabaseClientModule, 'createAuthenticatedClient')
      .mockReturnValue(mockSupabase as unknown as ReturnType<typeof supabaseClientModule.createAuthenticatedClient>);

    await requireAdmin(fakeCtx as unknown as import('hono').Context, mockNext);

    expect(nextCalled).toBe(true);
    spy.mockRestore();
  });

  it('returns 403 when auth context has role student', async () => {
    const { requireAdmin } = await import('../auth');
    const { vi } = await import('vitest');

    const mockStudentAuth = { userId: 'student-uuid', role: 'student' as const, jwt: 'tok' };
    const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'student-uuid', user_metadata: {} } }, error: null });
    const mockSingle = vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
    const mockSupabase = { auth: { getUser: mockGetUser }, from: mockFrom };

    const supabaseClientModule = await import('../supabaseClient');
    const spy = vi.spyOn(supabaseClientModule, 'createAuthenticatedClient')
      .mockReturnValue(mockSupabase as unknown as ReturnType<typeof supabaseClientModule.createAuthenticatedClient>);

    let nextCalled = false;
    const mockNext = async () => { nextCalled = true; };
    const responses: Array<{ status?: number }> = [];
    const fakeCtx = {
      req: { header: () => 'Bearer valid-token' },
      json: (body: unknown, status?: number) => { responses.push({ status }); return { body, status }; },
      get: (key: string) => key === 'auth' ? mockStudentAuth : undefined,
      set: () => {},
    };

    await requireAdmin(fakeCtx as unknown as import('hono').Context, mockNext);

    expect(nextCalled).toBe(false);
    expect(responses.some((r) => r.status === 403)).toBe(true);
    spy.mockRestore();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const { requireAdmin } = await import('../auth');

    let nextCalled = false;
    const mockNext = async () => { nextCalled = true; };
    const responses: Array<{ status?: number }> = [];
    const fakeCtx = {
      req: { header: () => undefined },
      json: (body: unknown, status?: number) => { responses.push({ status }); return { body, status }; },
      get: () => undefined,
      set: () => {},
    };

    await requireAdmin(fakeCtx as unknown as import('hono').Context, mockNext);

    expect(nextCalled).toBe(false);
    expect(responses.some((r) => r.status === 401)).toBe(true);
  });
});
