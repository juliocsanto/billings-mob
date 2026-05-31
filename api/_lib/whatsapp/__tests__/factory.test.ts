/**
 * TDD — RED phase
 * factory.ts unit tests
 *
 * ADR-011: env-based adapter selection; singleton guarantee
 * WHATSAPP_ADAPTER='mock'  → WhatsAppMockAdapter
 * WHATSAPP_ADAPTER='cloud' → WhatsAppCloudAdapter
 * (no env var)             → WhatsAppMockAdapter (safe default)
 *
 * Each test suite resets module state by re-importing the factory module
 * after manipulating process.env, using Vitest's vi.resetModules().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Save original env value to restore after tests
const ORIGINAL_ENV = process.env['WHATSAPP_ADAPTER'];

describe('getWhatsAppAdapter factory', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['WHATSAPP_ADAPTER'];
  });

  afterEach(() => {
    vi.resetModules();
    if (ORIGINAL_ENV === undefined) {
      delete process.env['WHATSAPP_ADAPTER'];
    } else {
      process.env['WHATSAPP_ADAPTER'] = ORIGINAL_ENV;
    }
  });

  it('returns a MockAdapter instance when WHATSAPP_ADAPTER=mock', async () => {
    process.env['WHATSAPP_ADAPTER'] = 'mock';

    const { getWhatsAppAdapter } = await import('../factory');
    const { WhatsAppMockAdapter } = await import('../WhatsAppMockAdapter');

    const adapter = getWhatsAppAdapter();
    expect(adapter).toBeInstanceOf(WhatsAppMockAdapter);
  });

  it('returns a CloudAdapter instance when WHATSAPP_ADAPTER=cloud', async () => {
    process.env['WHATSAPP_ADAPTER'] = 'cloud';

    const { getWhatsAppAdapter } = await import('../factory');
    const { WhatsAppCloudAdapter } = await import('../WhatsAppCloudAdapter');

    const adapter = getWhatsAppAdapter();
    expect(adapter).toBeInstanceOf(WhatsAppCloudAdapter);
  });

  it('returns a MockAdapter by default when WHATSAPP_ADAPTER is not set', async () => {
    // env var is deleted in beforeEach
    const { getWhatsAppAdapter } = await import('../factory');
    const { WhatsAppMockAdapter } = await import('../WhatsAppMockAdapter');

    const adapter = getWhatsAppAdapter();
    expect(adapter).toBeInstanceOf(WhatsAppMockAdapter);
  });

  it('returns a MockAdapter by default when WHATSAPP_ADAPTER is an unknown value', async () => {
    process.env['WHATSAPP_ADAPTER'] = 'unknown_value';

    const { getWhatsAppAdapter } = await import('../factory');
    const { WhatsAppMockAdapter } = await import('../WhatsAppMockAdapter');

    const adapter = getWhatsAppAdapter();
    expect(adapter).toBeInstanceOf(WhatsAppMockAdapter);
  });

  it('returns the same instance on multiple calls (singleton)', async () => {
    process.env['WHATSAPP_ADAPTER'] = 'mock';

    const { getWhatsAppAdapter } = await import('../factory');

    const first = getWhatsAppAdapter();
    const second = getWhatsAppAdapter();
    const third = getWhatsAppAdapter();

    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('singleton holds across different adapter types within the same module load', async () => {
    process.env['WHATSAPP_ADAPTER'] = 'cloud';

    const { getWhatsAppAdapter } = await import('../factory');

    const first = getWhatsAppAdapter();
    const second = getWhatsAppAdapter();

    expect(first).toBe(second);
  });

  it('returned adapter satisfies the WhatsAppPort interface contract', async () => {
    process.env['WHATSAPP_ADAPTER'] = 'mock';

    const { getWhatsAppAdapter } = await import('../factory');
    const adapter = getWhatsAppAdapter();

    expect(typeof adapter.sendMessage).toBe('function');
    expect(typeof adapter.isAvailable).toBe('function');
  });
});
