/**
 * feedback-triage — Supabase Edge Function (Deno runtime)
 *
 * ADR-018: Pipeline de Triage de Feedback por IA.
 * ADR-019: Email via Resend após triage.
 *
 * Recebe: { feedbackId: string } via POST
 * Executa:
 *   1. Busca feedback com status = 'pending_triage'
 *   2. Classifica o tipo via Claude (billings_method | app_functionality)
 *   3. Gera análise estruturada via prompt especialista
 *   4. Salva triage_result e muda status para 'pending_admin'
 *   5. Notifica admin via WhatsApp e email
 *
 * Auth: header Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *       (chamada apenas pelo cron worker server-side)
 *
 * LGPD: processa apenas título e conteúdo público do feedback.
 *       Nunca acessa tabelas de observações ou ciclos.
 *
 * Restrição clínica (inviolável): system prompts instruem Claude a
 * rejeitar conteúdo com termos fértil/infértil/seguro/inseguro.
 * A edge function NUNCA emite classificações clínicas de ciclo.
 *
 * @module feedback-triage
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3';

// ─── CORS headers ──────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── System prompts ────────────────────────────────────────────────────────────
//
// RESTRIÇÃO CLÍNICA (inviolável):
// - NUNCA classificar ciclo como fértil/infértil/seguro/inseguro
// - Esses termos são PROIBIDOS nos prompts especializados também.
// - Terminologia correta do MOB: Ápice, PBI, muco, sangramento, seco.

const CLASSIFIER_SYSTEM_PROMPT = `Você é classificador de feedback para o app Billings Grafico.
Dado um título e conteúdo de feedback de usuário, decida:
  (A) 'billings_method' — feedback sobre o MÉTODO BILLINGS de ovulação em si (ciclos, interpretação de muco, stamps, Ápice, PBI)
  (B) 'app_functionality' — feedback sobre o FUNCIONAMENTO DO APP (UX, features, performance, bugs, usabilidade)

Responda APENAS com JSON válido, sem markdown, sem explicações:
{"type": "billings_method"} ou {"type": "app_functionality"}`;

const BILLINGS_METHOD_SYSTEM_PROMPT = `Você é especialista no Método Billings de Ovulação (MOB) com 20 anos de experiência clínica e educacional.
Analise este feedback de usuário do app Billings Grafico e produza uma análise estruturada.

RESTRIÇÃO CLÍNICA ABSOLUTA: NUNCA use os termos fértil, infértil, seguro, inseguro — estes são exclusivos da instrutora certificada CENPLAFAM/WOOMB.
Use apenas terminologia do método: stamp, muco, Ápice, sangramento, seco, PBI, ciclo.

Se o feedback mencionar interpretação clínica proibida, classifique impact como 'low' e summary como 'Conteúdo requer orientação de instrutora certificada'.

Responda APENAS com JSON válido, sem markdown, sem comentários:
{
  "impact": "low | medium | high | critical",
  "perceived_value": 0,
  "roadmap": "descrição de onde se encaixa no roadmap do MOB",
  "agents": "agentes do pipeline recomendados",
  "skills": "skills necessárias",
  "costs": "estimativa de custo em tokens Claude + tempo de desenvolvimento",
  "summary": "resumo executivo em 2-3 frases"
}`;

const APP_FUNCTIONALITY_SYSTEM_PROMPT = `Você é especialista em product management e arquitetura de software do app Billings Grafico.
Stack: React 18 PWA + Hono.js (Vercel Serverless) + Supabase PostgreSQL + Edge Functions (Deno).
Dashboard: billings-web (React 18 + TailwindCSS).

Analise este feedback de usuário e produza uma análise técnica detalhada.

Responda APENAS com JSON válido, sem markdown, sem comentários:
{
  "impact": "low | medium | high | critical",
  "perceived_value": 0,
  "roadmap": "onde se encaixa no roadmap do app (ex: Sprint 8, backlog técnico)",
  "agents": "agentes do pipeline recomendados (ex: fullstack-developer, ui-engineer, security-reviewer)",
  "skills": "skills necessárias (ex: sql-migration-writer, api-endpoint-builder, react-component-builder)",
  "costs": "estimativa de custo em tokens Claude + horas de desenvolvimento",
  "summary": "resumo executivo em 2-3 frases"
}`;

// ─── HTML escaping ─────────────────────────────────────────────────────────────

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Validation helpers ────────────────────────────────────────────────────────

export function isValidAuthHeader(header: string | null): boolean {
  return typeof header === 'string' && header.startsWith('Bearer ') && header.length > 7;
}

export function isValidFeedbackId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0;
}

// ─── Claude call helpers ────────────────────────────────────────────────────────

async function classifyFeedbackType(
  anthropic: Anthropic,
  title: string,
  content: string,
): Promise<'billings_method' | 'app_functionality'> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 50,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Título: ${title}\nConteúdo: ${content}`,
      },
    ],
  });

  const rawText = (message.content[0] as any)?.text ?? '{"type":"app_functionality"}';

  try {
    const parsed = JSON.parse(rawText) as { type?: string };
    if (parsed.type === 'billings_method' || parsed.type === 'app_functionality') {
      return parsed.type;
    }
  } catch {
    // Malformed JSON — default to app_functionality
  }

  return 'app_functionality';
}

interface TriageResult {
  impact: string;
  perceived_value: number;
  roadmap: string;
  agents: string;
  skills: string;
  costs: string;
  summary: string;
}

async function generateTriageAnalysis(
  anthropic: Anthropic,
  type: 'billings_method' | 'app_functionality',
  title: string,
  content: string,
): Promise<TriageResult> {
  const systemPrompt =
    type === 'billings_method'
      ? BILLINGS_METHOD_SYSTEM_PROMPT
      : APP_FUNCTIONALITY_SYSTEM_PROMPT;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Título: ${title}\nConteúdo: ${content}`,
      },
    ],
  });

  const rawText = (message.content[0] as any)?.text ?? '{}';

  try {
    const parsed = JSON.parse(rawText) as TriageResult;
    return {
      impact: parsed.impact ?? 'medium',
      perceived_value: parsed.perceived_value ?? 50,
      roadmap: parsed.roadmap ?? '',
      agents: parsed.agents ?? '',
      skills: parsed.skills ?? '',
      costs: parsed.costs ?? '',
      summary: parsed.summary ?? '',
    };
  } catch {
    return {
      impact: 'medium',
      perceived_value: 50,
      roadmap: 'A definir',
      agents: 'fullstack-developer',
      skills: 'api-endpoint-builder',
      costs: 'A estimar',
      summary: 'Análise de IA não disponível — erro de parsing.',
    };
  }
}

// ─── Admin notification helpers ────────────────────────────────────────────────

async function notifyAdminWhatsApp(
  type: string,
  title: string,
  impact: string,
  feedbackId: string,
): Promise<void> {
  const adminPhone = Deno.env.get('ADMIN_PHONE_E164');
  if (!adminPhone) return;

  const whatsAppToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!whatsAppToken || !phoneNumberId) return;

  const body = `[Billings] Novo feedback triado (${type}): "${title}". Impacto: ${impact}. ID: ${feedbackId}`;

  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsAppToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: adminPhone,
      type: 'text',
      text: { body },
    }),
  }).catch(() => {
    // WhatsApp failure must not abort the edge function
  });
}

async function notifyAdminEmail(
  triageType: string,
  title: string,
  feedbackId: string,
  analysis: TriageResult,
  adminPanelUrl: string,
): Promise<void> {
  const adminEmail = Deno.env.get('ADMIN_EMAIL');
  if (!adminEmail) return;

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) return;

  const from = Deno.env.get('EMAIL_FROM') ?? 'Billings Grafico <noreply@billings.app>';

  const safeTitle = escapeHtml(title);
  const safeTriageType = escapeHtml(triageType);
  const safeImpact = escapeHtml(analysis.impact);
  const safeSummary = escapeHtml(analysis.summary);
  const safeRoadmap = escapeHtml(analysis.roadmap);
  const safeAgents = escapeHtml(analysis.agents);
  const safeSkills = escapeHtml(analysis.skills);
  const safeCosts = escapeHtml(analysis.costs);

  const html = `
    <h2>Novo Feedback Triado — Billings Grafico</h2>
    <p><strong>Título:</strong> ${safeTitle}</p>
    <p><strong>Tipo (IA):</strong> ${safeTriageType}</p>
    <hr>
    <h3>Análise de IA</h3>
    <p><strong>Impacto:</strong> ${safeImpact}</p>
    <p><strong>Resumo:</strong> ${safeSummary}</p>
    <p><strong>Roadmap:</strong> ${safeRoadmap}</p>
    <p><strong>Agentes:</strong> ${safeAgents}</p>
    <p><strong>Skills:</strong> ${safeSkills}</p>
    <p><strong>Custo Estimado:</strong> ${safeCosts}</p>
    <hr>
    <p><a href="${adminPanelUrl}" style="background:#16a34a;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">
      Revisar Feedback no Painel Admin
    </a></p>
    <p style="font-size:12px;color:#666;">ID: ${feedbackId}</p>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [adminEmail],
      subject: `[Billings] Feedback para revisão — ${title}`,
      html,
    }),
  }).catch(() => {
    // Email failure must not abort the edge function
  });
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 1. Validate Authorization header (service role key) ────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!isValidAuthHeader(authHeader)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify using Supabase client with the service role key
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // The edge function accepts only service role key to protect it from public access
  const providedToken = authHeader!.replace('Bearer ', '');
  if (providedToken !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 2. Parse request body ──────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { feedbackId } = body;
  if (!isValidFeedbackId(feedbackId)) {
    return new Response(JSON.stringify({ error: 'feedbackId_required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 3. Fetch feedback from database ───────────────────────────────────────
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: feedback, error: fetchError } = await supabase
    .from('app_feedback')
    .select('id, title, content, category, author_id, status')
    .eq('id', feedbackId)
    .eq('status', 'pending_triage')
    .single();

  if (fetchError || !feedback) {
    return new Response(JSON.stringify({ error: 'not_found', feedbackId }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { title, content, category } = feedback as {
    title: string;
    content: string;
    category: string;
  };

  // ── 4. Initialize Anthropic client ────────────────────────────────────────
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  // ── 5. Classify feedback type ──────────────────────────────────────────────
  let triageType: 'billings_method' | 'app_functionality';
  try {
    triageType = await classifyFeedbackType(anthropic, title, content);
  } catch (classifyErr) {
    console.error('[feedback-triage] classification error:', classifyErr);
    triageType = 'app_functionality'; // fallback
  }

  // ── 6. Generate specialized triage analysis ────────────────────────────────
  let analysis: TriageResult;
  try {
    analysis = await generateTriageAnalysis(anthropic, triageType, title, content);
  } catch (analysisErr) {
    console.error('[feedback-triage] analysis error:', analysisErr);
    analysis = {
      impact: 'medium',
      perceived_value: 50,
      roadmap: 'A definir após revisão manual',
      agents: 'fullstack-developer',
      skills: 'api-endpoint-builder',
      costs: 'A estimar',
      summary: 'Análise automática indisponível. Revisão manual necessária.',
    };
  }

  // ── 7. Persist triage result and update status ─────────────────────────────
  const triageResult = {
    type: triageType,
    impact: analysis.impact,
    perceived_value: analysis.perceived_value,
    roadmap: analysis.roadmap,
    agents: analysis.agents,
    skills: analysis.skills,
    costs: analysis.costs,
    summary: analysis.summary,
  };

  const { error: updateError } = await supabase
    .from('app_feedback')
    .update({
      triage_type: triageType,
      triage_result: triageResult,
      triage_at: new Date().toISOString(),
      status: 'pending_admin',
    })
    .eq('id', feedbackId);

  if (updateError) {
    console.error('[feedback-triage] update error:', updateError);
    return new Response(
      JSON.stringify({ error: 'update_failed', feedbackId }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  // ── 8. Notify admin ────────────────────────────────────────────────────────
  const appBaseUrl =
    Deno.env.get('APP_BASE_URL') ?? 'https://billings-web.vercel.app';
  const adminPanelUrl = `${appBaseUrl}/admin/feedback/${feedbackId}`;

  // Fire-and-forget: notification failures must not affect the triage result
  await Promise.allSettled([
    notifyAdminWhatsApp(triageType, title, analysis.impact, feedbackId),
    notifyAdminEmail(triageType, title, feedbackId, analysis, adminPanelUrl),
  ]);

  // ── 9. Return success ──────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      success: true,
      feedbackId,
      triageType,
      impact: analysis.impact,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
