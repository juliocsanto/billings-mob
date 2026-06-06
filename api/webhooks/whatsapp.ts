/**
 * WhatsApp Cloud API Webhook — ADR-011
 *
 * Two endpoints:
 *
 * GET  /api/webhooks/whatsapp
 *   Meta verification handshake — echoes hub.challenge when token matches.
 *   Env var: WHATSAPP_WEBHOOK_VERIFY_TOKEN
 *
 * POST /api/webhooks/whatsapp
 *   Delivery receipt and inbound message handler.
 *   Verifies HMAC-SHA256 signature in X-Hub-Signature-256 header (AH-001 P1 CRÍTICO).
 *   Env var: WHATSAPP_APP_SECRET
 *   Fail-closed: if secret is not configured, returns 403.
 *
 * Security: uses crypto.timingSafeEqual to prevent timing-based signature oracle attacks.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createHmac, timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';

const app = new Hono();

// ---------------------------------------------------------------------------
// GET — Meta webhook verification handshake
// ---------------------------------------------------------------------------

app.get('/', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return c.text(challenge ?? '', 200);
  }

  return c.json({ error: 'forbidden' }, 403);
});

// ---------------------------------------------------------------------------
// POST — receive delivery receipts and inbound messages
// Requires valid HMAC-SHA256 signature before any processing (AH-001)
// ---------------------------------------------------------------------------

/**
 * Verifies the X-Hub-Signature-256 header from Meta.
 *
 * @param rawBody - The raw request body as a string.
 * @param signatureHeader - The value of X-Hub-Signature-256 header (format: "sha256=<hex>").
 * @param secret - WHATSAPP_APP_SECRET from environment.
 * @returns true if the signature is valid, false otherwise.
 */
function verifyHmacSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signatureHeader.slice('sha256='.length);
  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');

  // Both buffers must be the same length for timingSafeEqual
  if (receivedHex.length !== expectedHex.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(receivedHex, 'hex'));
}

app.post('/', async (c) => {
  const secret = process.env.WHATSAPP_APP_SECRET;

  // Fail-closed: if secret is not configured, deny all requests
  if (!secret) {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  const rawBody = await c.req.text();
  const signatureHeader = c.req.header('X-Hub-Signature-256') ?? '';

  if (!signatureHeader || !verifyHmacSignature(rawBody, signatureHeader, secret)) {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  // MVP: acknowledge receipt immediately.
  // Future Sprint: parse statuses → update notification_rate_limits delivery column.
  return c.json({ status: 'received' }, 200);
});

export default app;

export const GET = handle(app);
export const POST = handle(app);
