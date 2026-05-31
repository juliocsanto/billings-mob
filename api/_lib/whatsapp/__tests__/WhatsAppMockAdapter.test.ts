/**
 * TDD — RED phase
 * WhatsAppMockAdapter unit tests
 *
 * ADR-011: WhatsApp hexagonal port pattern
 * LGPD: mock messages must never contain clinical data (stamps, cycles, fertile/infertile)
 *
 * Clinical constraint: the system NEVER outputs fertile/infertile classification.
 * These tests verify that MockAdapter does not produce such labels.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WhatsAppMockAdapter } from '../WhatsAppMockAdapter';
import type { WhatsAppMessage } from '../WhatsAppPort';

describe('WhatsAppMockAdapter', () => {
  let adapter: WhatsAppMockAdapter;

  beforeEach(() => {
    adapter = new WhatsAppMockAdapter();
    adapter.clearInbox();
  });

  describe('sendMessage()', () => {
    it('returns success=true with a messageId starting with "mock-"', async () => {
      const message: WhatsAppMessage = {
        to: '+5511999999999',
        body: 'Olá, sua aula está confirmada.',
      };

      const result = await adapter.sendMessage(message);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toMatch(/^mock-/);
    });

    it('returns a unique messageId on each call', async () => {
      const message: WhatsAppMessage = {
        to: '+5511999999999',
        body: 'Mensagem de teste',
      };

      const r1 = await adapter.sendMessage(message);
      const r2 = await adapter.sendMessage(message);

      expect(r1.messageId).not.toBe(r2.messageId);
    });

    it('does not return an error field on success', async () => {
      const result = await adapter.sendMessage({
        to: '+5511888888888',
        body: 'Confirmação de vínculo',
      });

      expect(result.error).toBeUndefined();
    });

    it('accepts an optional previewUrl field without error', async () => {
      const result = await adapter.sendMessage({
        to: '+5511777777777',
        body: 'Veja seu relatório',
        previewUrl: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getInbox()', () => {
    it('starts empty', () => {
      expect(adapter.getInbox()).toHaveLength(0);
    });

    it('accumulates sent messages in order', async () => {
      const m1: WhatsAppMessage = { to: '+5511111111111', body: 'Primeira' };
      const m2: WhatsAppMessage = { to: '+5522222222222', body: 'Segunda' };
      const m3: WhatsAppMessage = { to: '+5533333333333', body: 'Terceira' };

      await adapter.sendMessage(m1);
      await adapter.sendMessage(m2);
      await adapter.sendMessage(m3);

      const inbox = adapter.getInbox();
      expect(inbox).toHaveLength(3);
      expect(inbox[0]).toEqual(m1);
      expect(inbox[1]).toEqual(m2);
      expect(inbox[2]).toEqual(m3);
    });

    it('returns a copy so external mutation does not affect the internal inbox', async () => {
      await adapter.sendMessage({ to: '+5511111111111', body: 'Test' });

      const inbox = adapter.getInbox();
      inbox.push({ to: '+0000000000', body: 'injected' });

      expect(adapter.getInbox()).toHaveLength(1);
    });
  });

  describe('clearInbox()', () => {
    it('removes all messages from the inbox', async () => {
      await adapter.sendMessage({ to: '+5511111111111', body: 'Msg A' });
      await adapter.sendMessage({ to: '+5511111111111', body: 'Msg B' });

      adapter.clearInbox();

      expect(adapter.getInbox()).toHaveLength(0);
    });

    it('allows subsequent messages to accumulate after clearing', async () => {
      await adapter.sendMessage({ to: '+5511111111111', body: 'Before clear' });
      adapter.clearInbox();
      await adapter.sendMessage({ to: '+5511111111111', body: 'After clear' });

      expect(adapter.getInbox()).toHaveLength(1);
      expect(adapter.getInbox()[0].body).toBe('After clear');
    });
  });

  describe('isAvailable()', () => {
    it('returns true', () => {
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  // Clinical constraint: adapter must never emit fertile/infertile labels
  describe('Clinical constraint (LGPD)', () => {
    const forbiddenTerms = [
      'fertil', 'fértil', 'infertil', 'infértil',
      'seguro', 'inseguro',
      'fertile', 'infertile',
    ];

    it('does not produce forbidden clinical classification terms in messageId', async () => {
      const result = await adapter.sendMessage({
        to: '+5511999999999',
        body: 'Confirmação de cadastro',
      });

      for (const term of forbiddenTerms) {
        expect(result.messageId?.toLowerCase()).not.toContain(term);
      }
    });

    it('does not inject clinical data into the message body', async () => {
      const original = 'Mensagem neutra';
      await adapter.sendMessage({ to: '+5511999999999', body: original });

      const inbox = adapter.getInbox();
      for (const term of forbiddenTerms) {
        expect(inbox[0].body.toLowerCase()).not.toContain(term);
      }
    });
  });
});
