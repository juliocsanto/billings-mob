/**
 * ai-guide — Supabase Edge Function (Deno runtime)
 *
 * ADR-016: Supabase Edge Function proxy for Claude streaming.
 *
 * Receives: { question: string }
 * Returns:  SSE stream with tokens from claude-sonnet-4-6
 * Auth:     Supabase JWT required (Bearer token)
 *
 * LGPD: ONLY { question } transits — no clinical data (observations, stamps,
 *       notes, relations) is ever sent to Anthropic.
 *
 * Clinical constraint: system prompt prohibits fértil/infértil/seguro/inseguro.
 *
 * @module ai-guide
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

// ─── CORS headers ─────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── System prompt (clinical guardrails enforced) ─────────────────────────────
//
// CLINICAL CONSTRAINT (inviolável):
// - NUNCA classificar ciclo como fértil/infértil/seguro/inseguro
// - Esses termos são PROIBIDOS como assertions de estado; apenas presentes na
//   instrução proibitiva ao modelo.
// - Terminologia correta: Ápice, PBI, muco, sangramento, seco.

export const SYSTEM_PROMPT = `Você é um guia educativo do Método de Ovulação Billings (MOB).
Seu papel é ajudar usuárias que já fizeram consultoria com instrutora certificada a entender e usar este aplicativo de registro.
NUNCA interprete o ciclo de uma usuária específica.
NUNCA use os termos: fértil, infértil, seguro, inseguro — estes termos são exclusivos da instrutora certificada.
Terminologia correta: Ápice (não pico), PBI (Ponto Básico Inferior), muco, sangramento, seco.
Seja acolhedora, concisa e sempre em português brasileiro.
Quando a pergunta requerer avaliação clínica individual, diga: "Para interpretação do seu ciclo, consulte sua instrutora certificada."`;

// ─── Validation helpers (exported for unit testing) ──────────────────────────

/** Returns true when the Authorization header is a valid Bearer token. */
export function isValidAuthHeader(header: string | null): boolean {
  return typeof header === 'string' && header.startsWith('Bearer ') && header.length > 7;
}

/** Returns true when the question is a non-empty trimmed string. */
export function isValidQuestion(question: unknown): boolean {
  return typeof question === 'string' && question.trim().length > 0;
}

/**
 * LGPD safety extractor — returns only { question } from the request body.
 * All other fields are discarded and never forwarded to Anthropic.
 */
export function extractSafeBody(body: Record<string, unknown>): { question: string } | null {
  const { question } = body;
  if (!isValidQuestion(question)) return null;
  return { question: (question as string).trim() };
}

/** Builds the SSE response headers merged with CORS. */
export function buildSSEHeaders(cors: Record<string, string>): Record<string, string> {
  return {
    ...cors,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── 1. Validate JWT ────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!isValidAuthHeader(authHeader)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify JWT with Supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const jwt = authHeader!.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 2. Parse and validate body — LGPD: only question transits ─────────────
  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const safe = extractSafeBody(rawBody);
  if (!safe) {
    return new Response(JSON.stringify({ error: 'question required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 3. Stream response via Anthropic ───────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: safe.question }],
  });

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream as any) {
          if (
            event.type === 'content_block_delta' &&
            event.delta?.type === 'text_delta'
          ) {
            const data = `data: ${JSON.stringify({ token: event.delta.text })}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          }
        }
      } catch {
        // Swallow stream errors — client will see incomplete response
      } finally {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: buildSSEHeaders(corsHeaders),
  });
});
