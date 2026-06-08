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

// Note: requireAdmin middleware tests are in auth.test.ts where supabaseClient is correctly mocked.
