/**
 * TDD — GREEN phase (CloudAdapter coverage)
 *
 * WhatsAppCloudAdapter is a stub pending Meta Business approval (ADR-011).
 * These tests document the stub contract so coverage stays above threshold
 * and intent is explicit: the adapter is a no-op until the full implementation.
 */

import { describe, it, expect, vi } from 'vitest';
import { WhatsAppCloudAdapter } from '../WhatsAppCloudAdapter';

describe('WhatsAppCloudAdapter (stub)', () => {
  it('sendMessage returns success=false', async () => {
    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({
      to: '+5511999999999',
      body: 'Test message',
    });

    expect(result.success).toBe(false);
  });

  it('sendMessage returns a not_implemented error string', async () => {
    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({
      to: '+5511999999999',
      body: 'Test message',
    });

    expect(result.error).toBe('not_implemented: Meta approval pending');
  });

  it('sendMessage does not return a messageId', async () => {
    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({
      to: '+5511999999999',
      body: 'Test message',
    });

    expect(result.messageId).toBeUndefined();
  });

  it('isAvailable returns false', () => {
    const adapter = new WhatsAppCloudAdapter();
    expect(adapter.isAvailable()).toBe(false);
  });

  it('emits a console.warn when sendMessage is called', async () => {
    const adapter = new WhatsAppCloudAdapter();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await adapter.sendMessage({ to: '+5511999999999', body: 'Test' });

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('not implemented');

    warnSpy.mockRestore();
  });
});
