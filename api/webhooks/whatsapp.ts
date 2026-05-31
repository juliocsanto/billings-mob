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
 *   MVP: acknowledges receipt (200) without processing payload.
 *   Future: process delivery statuses to update notification_rate_limits.
 *
 * Security note: in production, add HMAC-SHA256 signature verification on POST
 * (X-Hub-Signature-256 header) before parsing the body.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';

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
// ---------------------------------------------------------------------------

app.post('/', async (_c) => {
  // MVP: acknowledge receipt immediately.
  // Future Sprint: parse statuses → update notification_rate_limits delivery column.
  return _c.json({ status: 'received' }, 200);
});

export default app;

export const GET = handle(app);
export const POST = handle(app);
