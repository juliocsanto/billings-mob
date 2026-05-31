/**
 * Integration tests — GET/POST /api/webhooks/whatsapp
 *
 * Tests the Meta webhook handshake (GET) and delivery receipt (POST).
 * No auth middleware — Meta signs the payload with HMAC; MVP just acknowledges.
 *
 * ADR-011: WhatsApp Cloud API webhook verification.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Set verify token before importing the route
const VERIFY_TOKEN = 'test-webhook-verify-token-123';

beforeEach(() => {
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
});

afterEach(() => {
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
});

// Dynamic import after env is set
async function getApp() {
  // Re-import fresh each time to pick up env vars
  const mod = await import('../webhooks/whatsapp?t=' + Date.now());
  return mod.default;
}

describe('GET /webhooks/whatsapp — Meta verification handshake', () => {
  it('returns 200 and the challenge string when mode=subscribe and token matches', async () => {
    const app = await getApp();

    const res = await app.request(
      '/?hub.mode=subscribe&hub.verify_token=' + VERIFY_TOKEN + '&hub.challenge=challenge_abc123',
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('challenge_abc123');
  });

  it('returns 403 when token does not match', async () => {
    const app = await getApp();

    const res = await app.request(
      '/?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_xyz',
    );

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('forbidden');
  });

  it('returns 403 when mode is not subscribe', async () => {
    const app = await getApp();

    const res = await app.request(
      '/?hub.mode=unsubscribe&hub.verify_token=' + VERIFY_TOKEN + '&hub.challenge=challenge_xyz',
    );

    expect(res.status).toBe(403);
  });

  it('returns 403 when verify_token env var is not set', async () => {
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    const app = await getApp();

    const res = await app.request(
      '/?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=chal',
    );

    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/whatsapp — delivery receipt acknowledgement', () => {
  it('returns 200 with status=received for any POST body', async () => {
    const app = await getApp();

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('received');
  });

  it('returns 200 even for an empty POST body', async () => {
    const app = await getApp();

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
});
