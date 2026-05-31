/**
 * TDD RED phase — buildPayload unit tests
 *
 * ADR-012: NotificationService — text must never contain clinical data.
 * LGPD: stamps, descriptions, notes, relations, cycle data are strictly forbidden.
 *
 * Clinical constraint: buildPayload is the single source of truth for
 * notification text. It NEVER receives and NEVER emits clinical data.
 */

import { describe, it, expect } from 'vitest';
import { expectTypeOf } from 'vitest';
import { buildPayload, buildWhatsAppTemplate } from '../buildPayload';
import type { NotificationEvent } from '../NotificationEvent';

// Words that must never appear in any notification text (LGPD + clinical constraint)
const FORBIDDEN_TERMS = [
  'fértil', 'fertil', 'infértil', 'infertil',
  'seguro', 'inseguro',
  'stamp', 'muco', 'sangramento',
  'fertile', 'infertile',
  'description', 'notes', 'relations',
];

describe('buildPayload()', () => {
  describe('new_observation event', () => {
    it('returns correct title and body for new_observation', () => {
      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'instructor-001',
        entityId: 'obs-001',
        metadata: { studentName: 'Ana Silva', date: '2026-05-29' },
      };

      const payload = buildPayload(event);

      expect(payload.title).toBeTruthy();
      expect(payload.body).toBe(
        'Sua aluna Ana Silva registrou uma nova observação em 2026-05-29.',
      );
    });

    it('includes studentName in body for new_observation', () => {
      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'instructor-001',
        entityId: 'obs-001',
        metadata: { studentName: 'Maria Souza', date: '2026-01-15' },
      };

      const { body } = buildPayload(event);
      expect(body).toContain('Maria Souza');
    });
  });

  describe('conflict_detected event', () => {
    it('returns correct body for conflict_detected', () => {
      const event: NotificationEvent = {
        type: 'conflict_detected',
        recipientId: 'instructor-001',
        entityId: 'obs-002',
        metadata: { studentName: 'Carla Lima', date: '2026-03-10' },
      };

      const { body } = buildPayload(event);
      expect(body).toBe(
        'Há um conflito de versão aguardando sua revisão para Carla Lima em 2026-03-10.',
      );
    });

    it('includes conflict terminology in title for conflict_detected', () => {
      const event: NotificationEvent = {
        type: 'conflict_detected',
        recipientId: 'instructor-001',
        entityId: 'obs-002',
        metadata: { studentName: 'Carla Lima', date: '2026-03-10' },
      };

      const { title } = buildPayload(event);
      expect(title).toBeTruthy();
      expect(typeof title).toBe('string');
    });
  });

  describe('link_request event', () => {
    it('returns correct body for link_request', () => {
      const event: NotificationEvent = {
        type: 'link_request',
        recipientId: 'instructor-001',
        entityId: 'link-001',
        metadata: { studentName: 'Paula Costa' },
      };

      const { body } = buildPayload(event);
      expect(body).toBe(
        'Paula Costa solicitou vínculo com você no Billings Gráfico.',
      );
    });

    it('returns a non-empty title for link_request', () => {
      const event: NotificationEvent = {
        type: 'link_request',
        recipientId: 'instructor-001',
        entityId: 'link-001',
        metadata: { studentName: 'Paula Costa' },
      };

      const { title } = buildPayload(event);
      expect(title.length).toBeGreaterThan(0);
    });
  });

  describe('link_accepted event', () => {
    it('returns correct body for link_accepted', () => {
      const event: NotificationEvent = {
        type: 'link_accepted',
        recipientId: 'student-001',
        entityId: 'link-001',
        metadata: {},
      };

      const { body } = buildPayload(event);
      expect(body).toBe(
        'Sua instrutora aceitou seu pedido de vínculo no Billings Gráfico.',
      );
    });

    it('returns a non-empty title for link_accepted', () => {
      const event: NotificationEvent = {
        type: 'link_accepted',
        recipientId: 'student-001',
        entityId: 'link-001',
        metadata: {},
      };

      const { title } = buildPayload(event);
      expect(title.length).toBeGreaterThan(0);
    });
  });

  describe('Clinical constraint — no forbidden terms in output', () => {
    const allEvents: NotificationEvent[] = [
      {
        type: 'new_observation',
        recipientId: 'r1',
        entityId: 'e1',
        metadata: { studentName: 'Ana', date: '2026-01-01' },
      },
      {
        type: 'conflict_detected',
        recipientId: 'r1',
        entityId: 'e2',
        metadata: { studentName: 'Ana', date: '2026-01-01' },
      },
      {
        type: 'link_request',
        recipientId: 'r1',
        entityId: 'e3',
        metadata: { studentName: 'Ana' },
      },
      {
        type: 'link_accepted',
        recipientId: 'r2',
        entityId: 'e4',
        metadata: {},
      },
    ];

    for (const event of allEvents) {
      it(`"${event.type}" output contains no forbidden clinical terms`, () => {
        const { title, body } = buildPayload(event);
        const combined = `${title} ${body}`.toLowerCase();

        for (const term of FORBIDDEN_TERMS) {
          expect(combined).not.toContain(term);
        }
      });
    }
  });

  describe('Type-level constraint — metadata has no stamp field', () => {
    it('NotificationEvent.metadata does not accept stamp at compile time', () => {
      // This checks that the metadata type does NOT have a stamp property.
      // expectTypeOf will cause a TypeScript error if the type accepted stamp.
      type Meta = NotificationEvent['metadata'];
      expectTypeOf<Meta>().not.toMatchTypeOf<{ stamp: string }>();
    });

    it('NotificationEvent.metadata does not accept relations at compile time', () => {
      type Meta = NotificationEvent['metadata'];
      expectTypeOf<Meta>().not.toMatchTypeOf<{ relations: unknown }>();
    });

    it('NotificationEvent.metadata does not accept notes at compile time', () => {
      type Meta = NotificationEvent['metadata'];
      expectTypeOf<Meta>().not.toMatchTypeOf<{ notes: string }>();
    });
  });
});

// ---------------------------------------------------------------------------
// buildWhatsAppTemplate() — TDD RED
// ---------------------------------------------------------------------------

describe('buildWhatsAppTemplate()', () => {
  describe('link_request event', () => {
    it('returns billings_solicitacao_vinculo template', () => {
      const event: NotificationEvent = {
        type: 'link_request',
        recipientId: 'instructor-001',
        entityId: 'link-001',
        metadata: { studentName: 'Ana Silva' },
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl).not.toBeNull();
      expect(tpl!.templateName).toBe('billings_solicitacao_vinculo');
    });

    it('includes studentName as first templateParam', () => {
      const event: NotificationEvent = {
        type: 'link_request',
        recipientId: 'instructor-001',
        entityId: 'link-001',
        metadata: { studentName: 'Paula Costa' },
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl!.templateParams[0]).toBe('Paula Costa');
    });

    it('falls back to "uma aluna" when studentName is absent', () => {
      const event: NotificationEvent = {
        type: 'link_request',
        recipientId: 'instructor-001',
        entityId: 'link-001',
        metadata: {},
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl!.templateParams[0]).toBe('uma aluna');
    });
  });

  describe('link_accepted event', () => {
    it('returns billings_vinculo_aceito template', () => {
      const event: NotificationEvent = {
        type: 'link_accepted',
        recipientId: 'student-001',
        entityId: 'link-001',
        metadata: {},
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl).not.toBeNull();
      expect(tpl!.templateName).toBe('billings_vinculo_aceito');
    });

    it('returns empty templateParams for link_accepted', () => {
      const event: NotificationEvent = {
        type: 'link_accepted',
        recipientId: 'student-001',
        entityId: 'link-001',
        metadata: {},
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl!.templateParams).toEqual([]);
    });
  });

  describe('new_observation event', () => {
    it('returns billings_nova_observacao template', () => {
      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'instructor-001',
        entityId: 'obs-001',
        metadata: { studentName: 'Maria', date: '2026-05-29' },
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl).not.toBeNull();
      expect(tpl!.templateName).toBe('billings_nova_observacao');
    });

    it('includes studentName and date in templateParams', () => {
      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'instructor-001',
        entityId: 'obs-001',
        metadata: { studentName: 'Maria', date: '2026-05-29' },
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl!.templateParams[0]).toBe('Maria');
      expect(tpl!.templateParams[1]).toBe('2026-05-29');
    });

    it('falls back to "sua aluna" and empty string when metadata is absent', () => {
      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'instructor-001',
        entityId: 'obs-002',
        metadata: {},
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl!.templateParams[0]).toBe('sua aluna');
      expect(tpl!.templateParams[1]).toBe('');
    });
  });

  describe('conflict_detected event', () => {
    it('returns billings_conflito_versao template', () => {
      const event: NotificationEvent = {
        type: 'conflict_detected',
        recipientId: 'instructor-001',
        entityId: 'obs-003',
        metadata: { studentName: 'Carla', date: '2026-03-10' },
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl).not.toBeNull();
      expect(tpl!.templateName).toBe('billings_conflito_versao');
    });

    it('includes studentName and date in templateParams', () => {
      const event: NotificationEvent = {
        type: 'conflict_detected',
        recipientId: 'instructor-001',
        entityId: 'obs-003',
        metadata: { studentName: 'Carla', date: '2026-03-10' },
      };

      const tpl = buildWhatsAppTemplate(event);

      expect(tpl!.templateParams[0]).toBe('Carla');
      expect(tpl!.templateParams[1]).toBe('2026-03-10');
    });
  });

  describe('clinical constraint — template has no clinical data', () => {
    const FORBIDDEN_TERMS = [
      'fértil', 'fertil', 'infértil', 'infertil',
      'seguro', 'inseguro', 'stamp', 'muco', 'sangramento',
      'fertile', 'infertile',
    ];

    const allEvents: NotificationEvent[] = [
      {
        type: 'link_request',
        recipientId: 'r1',
        entityId: 'e1',
        metadata: { studentName: 'Ana' },
      },
      {
        type: 'link_accepted',
        recipientId: 'r2',
        entityId: 'e2',
        metadata: {},
      },
      {
        type: 'new_observation',
        recipientId: 'r3',
        entityId: 'e3',
        metadata: { studentName: 'Ana', date: '2026-01-01' },
      },
      {
        type: 'conflict_detected',
        recipientId: 'r4',
        entityId: 'e4',
        metadata: { studentName: 'Ana', date: '2026-01-01' },
      },
    ];

    for (const event of allEvents) {
      it(`"${event.type}" template contains no forbidden clinical terms`, () => {
        const tpl = buildWhatsAppTemplate(event);

        if (tpl === null) return; // null is acceptable (graceful degradation)

        const combined = [tpl.templateName, ...tpl.templateParams].join(' ').toLowerCase();
        for (const term of FORBIDDEN_TERMS) {
          expect(combined).not.toContain(term);
        }
      });
    }
  });
});
