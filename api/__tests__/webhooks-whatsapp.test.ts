/**
 * Integration tests — GET/POST /api/webhooks/whatsapp
 *
 * Tests the Meta webhook handshake (GET) and delivery receipt (POST).
 * POST handler requires HMAC-SHA256 signature verification (AH-001 P1 CRÍTICO).
 *
 * ADR-011: WhatsApp Cloud API webhook verification.
 * Security: X-Hub-Signature-256 header must be present and valid for all POST requests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// Set env vars before importing the route
const VERIFY_TOKEN = 'test-webhook-verify-token-123';
const TEST_SECRET = 'test-app-secret-hmac-key-456';

function computeHmac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

beforeEach(() => {
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  process.env.WHATSAPP_APP_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
});

// Dynamic import after env is set
async function getApp() {
  // Re-import fresh each time to pick up env vars
  const mod = await import('../webhooks/whatsapp?t=' + Date.now());
  return mod.default;
}

// ---------------------------------------------------------------------------
// GET — Meta webhook verification handshake
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// POST — HMAC-SHA256 signature verification (AH-001 P1 CRÍTICO)
// ---------------------------------------------------------------------------

describe('POST /webhooks/whatsapp — HMAC-SHA256 signature verification', () => {
  it('returns 200 with status=received when HMAC signature is valid', async () => {
    const app = await getApp();
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ status: 'delivered' }] } }] }],
    });
    const sig = computeHmac(TEST_SECRET, body);

    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${sig}`,
      },
      body,
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { status: string };
    expect(json.status).toBe('received');
  });

  it('returns 403 with error=invalid_signature when X-Hub-Signature-256 header is missing', async () => {
    const app = await getApp();
    const body = JSON.stringify({ object: 'whatsapp_business_account' });

    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_signature');
  });

  it('returns 403 with error=invalid_signature when HMAC signature is incorrect', async () => {
    const app = await getApp();
    const body = JSON.stringify({ object: 'whatsapp_business_account' });
    const wrongSig = computeHmac('wrong-secret', body);

    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${wrongSig}`,
      },
      body,
    });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_signature');
  });

  it('returns 403 fail-closed when WHATSAPP_APP_SECRET env var is not configured', async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const app = await getApp();
    const body = JSON.stringify({ object: 'whatsapp_business_account' });

    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${computeHmac('any-secret', body)}`,
      },
      body,
    });

    expect(res.status).toBe(403);
  });

  it('returns 403 when signature header has wrong format (no sha256= prefix)', async () => {
    const app = await getApp();
    const body = JSON.stringify({ object: 'whatsapp_business_account' });
    const sig = computeHmac(TEST_SECRET, body);

    // Missing "sha256=" prefix — malformed header
    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': sig, // no prefix
      },
      body,
    });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_signature');
  });

  it('returns 200 for empty JSON body with valid HMAC', async () => {
    const app = await getApp();
    const body = JSON.stringify({});
    const sig = computeHmac(TEST_SECRET, body);

    const res = await app.request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${sig}`,
      },
      body,
    });

    expect(res.status).toBe(200);
  });
});
