/**
 * TDD RED phase — WhatsAppCloudAdapter real implementation tests
 *
 * ADR-011: WhatsApp hexagonal adapter.
 * Tests the real Graph API v19.0 integration (fetch-mocked).
 * LGPD: message body must never contain clinical data — enforced upstream.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhatsAppCloudAdapter } from '../WhatsAppCloudAdapter';

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  // Clear env vars before each test
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
});

// ---------------------------------------------------------------------------
// isAvailable()
// ---------------------------------------------------------------------------

describe('WhatsAppCloudAdapter.isAvailable()', () => {
  it('returns true when both env vars are present', () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAtoken';

    const adapter = new WhatsAppCloudAdapter();
    expect(adapter.isAvailable()).toBe(true);
  });

  it('returns false when WHATSAPP_PHONE_NUMBER_ID is absent', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAtoken';
    const adapter = new WhatsAppCloudAdapter();
    expect(adapter.isAvailable()).toBe(false);
  });

  it('returns false when WHATSAPP_ACCESS_TOKEN is absent', () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    const adapter = new WhatsAppCloudAdapter();
    expect(adapter.isAvailable()).toBe(false);
  });

  it('returns false when both env vars are absent', () => {
    const adapter = new WhatsAppCloudAdapter();
    expect(adapter.isAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sendMessage() — missing credentials
// ---------------------------------------------------------------------------

describe('WhatsAppCloudAdapter.sendMessage() — missing credentials', () => {
  it('returns success=false with error=missing_credentials when env vars absent', async () => {
    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({
      to: '+5511999999999',
      body: 'Test message',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('missing_credentials');
  });

  it('does NOT call fetch when env vars are absent', async () => {
    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({ to: '+5511999999999', body: 'Test' });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns success=false when only PHONE_NUMBER_ID is set', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({ to: '+5511999999999', body: 'Test' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('missing_credentials');
  });
});

// ---------------------------------------------------------------------------
// sendMessage() — HTTP request correctness
// ---------------------------------------------------------------------------

describe('WhatsAppCloudAdapter.sendMessage() — HTTP request', () => {
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '987654321';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAmytoken';
  });

  it('calls fetch with the correct Graph API v19.0 URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.abc123' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({ to: '+5511999999999', body: 'Hello' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    expect(url).toBe('https://graph.facebook.com/v19.0/987654321/messages');
  });

  it('sends Authorization: Bearer <token> header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.abc123' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({ to: '+5511999999999', body: 'Hello' });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer EAAmytoken');
  });

  it('sends Content-Type: application/json header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.xyz' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({ to: '+5511999999999', body: 'Hello' });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends POST method', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.post' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({ to: '+5511999999999', body: 'Hello' });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    expect(init.method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// sendMessage() — text message (no templateName)
// ---------------------------------------------------------------------------

describe('WhatsAppCloudAdapter.sendMessage() — text message', () => {
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '987654321';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAmytoken';
  });

  it('sends type=text body when templateName is absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.text01' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({ to: '+5511999999999', body: 'Hello world' });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('Hello world');
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('+5511999999999');
  });
});

// ---------------------------------------------------------------------------
// sendMessage() — template message
// ---------------------------------------------------------------------------

describe('WhatsAppCloudAdapter.sendMessage() — template message', () => {
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '987654321';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAmytoken';
  });

  it('sends type=template body when templateName is present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.tpl01' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({
      to: '+5511999999999',
      body: 'fallback text',
      templateName: 'billings_solicitacao_vinculo',
      templateParams: ['Ana Silva'],
    });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('billings_solicitacao_vinculo');
    expect(body.template.language.code).toBe('pt_BR');
  });

  it('maps templateParams to body component parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.tpl02' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({
      to: '+5511999999999',
      body: 'fallback',
      templateName: 'billings_nova_observacao',
      templateParams: ['Maria', '2026-05-29'],
    });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    const body = JSON.parse(init.body as string);
    const bodyComponent = body.template.components[0];
    expect(bodyComponent.type).toBe('body');
    expect(bodyComponent.parameters).toHaveLength(2);
    expect(bodyComponent.parameters[0]).toEqual({ type: 'text', text: 'Maria' });
    expect(bodyComponent.parameters[1]).toEqual({ type: 'text', text: '2026-05-29' });
  });

  it('sends empty components array when templateParams is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.tpl03' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({
      to: '+5511999999999',
      body: 'fallback',
      templateName: 'billings_vinculo_aceito',
      templateParams: [],
    });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    const body = JSON.parse(init.body as string);
    expect(body.template.components).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sendMessage() — success response
// ---------------------------------------------------------------------------

describe('WhatsAppCloudAdapter.sendMessage() — success', () => {
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '987654321';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAmytoken';
  });

  it('returns success=true and messageId when fetch returns 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.success01' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({ to: '+5511999999999', body: 'Hi' });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('wamid.success01');
  });

  it('returns success=true even when messages array is empty (graceful)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({ to: '+5511999999999', body: 'Hi' });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sendMessage() — HTTP error responses
// ---------------------------------------------------------------------------

describe('WhatsAppCloudAdapter.sendMessage() — HTTP errors', () => {
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '987654321';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAmytoken';
  });

  it('returns success=false when fetch returns 400', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid parameter' } }),
    });

    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({ to: '+5511999999999', body: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid parameter');
  });

  it('returns success=false when fetch returns 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid OAuth access token' } }),
    });

    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({ to: '+5511999999999', body: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns http_<status> as error when response body has no error.message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({ to: '+5511999999999', body: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('http_500');
  });

  it('returns http_<status> when response body json() rejects', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json'); },
    });

    const adapter = new WhatsAppCloudAdapter();
    const result = await adapter.sendMessage({ to: '+5511999999999', body: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('http_503');
  });

  it('calls console.warn on HTTP error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad request' } }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({ to: '+5511999999999', body: 'Hi' });

    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Clinical constraint — message body must never contain clinical terms
// ---------------------------------------------------------------------------

describe('WhatsAppCloudAdapter — clinical constraint', () => {
  const FORBIDDEN_TERMS = [
    'fértil', 'fertil', 'infértil', 'infertil',
    'seguro', 'inseguro', 'stamp', 'muco', 'sangramento',
    'fertile', 'infertile',
  ];

  it('does not introduce clinical terms in the request body it constructs', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '987654321';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAmytoken';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.clinical' }] }),
    });

    const adapter = new WhatsAppCloudAdapter();
    await adapter.sendMessage({
      to: '+5511999999999',
      body: 'Sua aluna registrou uma nova observação.',
      templateName: 'billings_nova_observacao',
      templateParams: ['Ana', '2026-05-29'],
    });

    const [, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; method: string; body: string }];
    const requestBodyStr = (init.body as string).toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
      expect(requestBodyStr).not.toContain(term);
    }
  });
});
