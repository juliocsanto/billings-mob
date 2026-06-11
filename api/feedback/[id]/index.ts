/**
 * GET /api/feedback/:id      — detalhe do feedback + comentários
 * POST /api/feedback/:id/comments — adicionar comentário
 * PATCH /api/feedback/:id/approve      — admin aprova (estágio 1)
 * PATCH /api/feedback/:id/reject       — admin rejeita
 * PATCH /api/feedback/:id/mark-deployed — admin marca como deployado
 * PATCH /api/feedback/:id/final-approve — admin confirma deploy + desconto
 *
 * Vercel Serverless Function (Node.js runtime, Hono.js handler).
 * ADR-018: Sistema de Feedback Comunitário com Pipeline de Triage por IA
 * ADR-015: Asaas — desconto na mensalidade do autor
 * ADR-005: Requer Supabase JWT no header Authorization
 *
 * LGPD: feedback é dado público (não clínico).
 * Restrição clínica: nenhum campo clínico (relations, notes, stamps) é acessado aqui.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { handle } from 'hono/vercel';
import { requireAuth, requireAdmin } from '../../_lib/auth';
import { apiRateLimit } from '../../_lib/rateLimit';
import { createServiceClient } from '../../_lib/supabaseClient';
import {
  internalError,
  badRequest,
  notFound,
} from '../../_lib/errorHandler';
import {
  CreateCommentSchema,
  ApproveSchema,
  RejectSchema,
  FEEDBACK_SELECT_COLUMNS,
  FEEDBACK_PUBLIC_SELECT_COLUMNS,
  COMMENT_SELECT_COLUMNS,
} from '../../_lib/schemas/feedbackSchemas';
import { getNotificationService } from '../../_lib/notifications/factory';
import { getBillingAdapter } from '../../_lib/billing/billingFactory';

const app = new Hono();

app.use('*', apiRateLimit);

// ─── GET /api/feedback/:id ────────────────────────────────────────────────────

app.get('/', requireAuth, async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const serviceClient = createServiceClient();

  // Select columns based on role:
  // admin sees triage_result + approval fields; others see public subset
  const selectCols =
    auth.role === 'admin' ? FEEDBACK_SELECT_COLUMNS : FEEDBACK_PUBLIC_SELECT_COLUMNS;

  const { data: feedback, error: fbError } = await serviceClient
    .from('app_feedback')
    .select(selectCols)
    .eq('id', id)
    .single();

  if (fbError || !feedback) {
    return notFound(c, 'Feedback não encontrado');
  }

  // Fetch comments
  const { data: comments, error: cmtError } = await serviceClient
    .from('app_feedback_comments')
    .select(COMMENT_SELECT_COLUMNS)
    .eq('feedback_id', id)
    .order('created_at', { ascending: true });

  if (cmtError) {
    return internalError(c, cmtError);
  }

  return c.json({ feedback, comments: comments ?? [] });
});

// ─── POST /api/feedback/:id/comments ─────────────────────────────────────────

app.post('/comments', requireAuth, zValidator('json', CreateCommentSchema), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const serviceClient = createServiceClient();

  // Verify feedback exists
  const { data: feedback, error: fbError } = await serviceClient
    .from('app_feedback')
    .select('id')
    .eq('id', id)
    .single();

  if (fbError || !feedback) {
    return notFound(c, 'Feedback não encontrado');
  }

  // Resolve author_role
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('role')
    .eq('id', auth.userId)
    .single();

  const authorRole = (profile as { role: string } | null)?.role ?? 'student';

  const { data: comment, error } = await serviceClient
    .from('app_feedback_comments')
    .insert({
      feedback_id: id,
      author_id: auth.userId,
      author_role: authorRole,
      content: body.content,
    })
    .select(COMMENT_SELECT_COLUMNS)
    .single();

  if (error || !comment) {
    return internalError(c, error ?? new Error('Insert returned no data'));
  }

  return c.json(
    {
      id: (comment as { id: string }).id,
      feedbackId: id,
      content: (comment as { content: string }).content,
      createdAt: (comment as { created_at: string }).created_at,
    },
    201,
  );
});

// ─── PATCH /api/feedback/:id/approve ─────────────────────────────────────────

app.patch('/approve', requireAdmin, zValidator('json', ApproveSchema), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const serviceClient = createServiceClient();

  // Verify feedback is in the right status for approval
  const { data: feedback, error: fbError } = await serviceClient
    .from('app_feedback')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fbError || !feedback) {
    return notFound(c, 'Feedback não encontrado');
  }

  const currentStatus = (feedback as { status: string }).status;
  const approvableStatuses = ['pending_admin', 'triaged'];

  if (!approvableStatuses.includes(currentStatus)) {
    return badRequest(
      c,
      `Feedback com status '${currentStatus}' não pode ser aprovado. Status esperado: pending_admin.`,
    );
  }

  const { error: updateError } = await serviceClient
    .from('app_feedback')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: auth.userId,
      approval_note: body.approvalNote ?? null,
    })
    .eq('id', id);

  if (updateError) {
    return internalError(c, updateError);
  }

  // Audit log
  await Promise.resolve(serviceClient.from('audit_log').insert({
    entity_type: 'app_feedback',
    entity_id: id,
    action: 'APPROVE',
    actor_id: auth.userId,
    actor_role: 'admin',
    before_data: { status: currentStatus },
    after_data: { status: 'approved', approval_note: body.approvalNote ?? null },
  })).catch(() => {
    // Audit log failure must not block the response
  });

  return c.json({ success: true });
});

// ─── PATCH /api/feedback/:id/reject ──────────────────────────────────────────

app.patch('/reject', requireAdmin, zValidator('json', RejectSchema), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const serviceClient = createServiceClient();

  const { data: feedback, error: fbError } = await serviceClient
    .from('app_feedback')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fbError || !feedback) {
    return notFound(c, 'Feedback não encontrado');
  }

  const { error: updateError } = await serviceClient
    .from('app_feedback')
    .update({
      status: 'rejected',
      rejection_reason: body.reason,
    })
    .eq('id', id);

  if (updateError) {
    return internalError(c, updateError);
  }

  // Audit log
  await Promise.resolve(serviceClient.from('audit_log').insert({
    entity_type: 'app_feedback',
    entity_id: id,
    action: 'REJECT',
    actor_id: auth.userId,
    actor_role: 'admin',
    before_data: { status: (feedback as { status: string }).status },
    after_data: { status: 'rejected', rejection_reason: body.reason },
  })).catch(() => {});

  return c.json({ success: true });
});

// ─── PATCH /api/feedback/:id/mark-deployed ───────────────────────────────────

app.patch('/mark-deployed', requireAdmin, async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const serviceClient = createServiceClient();

  const { data: feedback, error: fbError } = await serviceClient
    .from('app_feedback')
    .select('id, status, title')
    .eq('id', id)
    .single();

  if (fbError || !feedback) {
    return notFound(c, 'Feedback não encontrado');
  }

  const currentStatus = (feedback as { status: string }).status;
  const deployableStatuses = ['approved', 'implementing'];

  if (!deployableStatuses.includes(currentStatus)) {
    return badRequest(
      c,
      `Feedback com status '${currentStatus}' não pode ser marcado como deployado.`,
    );
  }

  const { error: updateError } = await serviceClient
    .from('app_feedback')
    .update({ status: 'deployed' })
    .eq('id', id);

  if (updateError) {
    return internalError(c, updateError);
  }

  // Audit log
  await Promise.resolve(serviceClient.from('audit_log').insert({
    entity_type: 'app_feedback',
    entity_id: id,
    action: 'MARK_DEPLOYED',
    actor_id: auth.userId,
    actor_role: 'admin',
    before_data: { status: currentStatus },
    after_data: { status: 'deployed' },
  })).catch(() => {});

  // Notify admin to confirm the deploy and issue the final approval
  void (async () => {
    try {
      const adminUrl = `${process.env['APP_BASE_URL'] ?? 'https://billings-web.vercel.app'}/admin/feedback/${id}/final-approve`;
      const notificationService = getNotificationService();
      await notificationService.dispatch({
        type: 'feedback_deployed',
        // recipientId is the admin user's auth.userId — we reuse the same admin
        recipientId: auth.userId!,
        entityId: id!,
        metadata: {
          feedbackTitle: (feedback as { title: string }).title,
          adminPanelUrl: adminUrl,
        },
      });
    } catch {
      // Notification failure must not block the response
    }
  })();

  return c.json({ success: true });
});

// ─── PATCH /api/feedback/:id/final-approve ────────────────────────────────────

app.patch('/final-approve', requireAdmin, async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const serviceClient = createServiceClient();

  const { data: feedback, error: fbError } = await serviceClient
    .from('app_feedback')
    .select('id, status, author_id, title')
    .eq('id', id)
    .single();

  if (fbError || !feedback) {
    return notFound(c, 'Feedback não encontrado');
  }

  const currentStatus = (feedback as { status: string }).status;

  if (currentStatus !== 'deployed') {
    return badRequest(
      c,
      `Feedback com status '${currentStatus}' não pode ser aprovado definitivamente. Status esperado: deployed.`,
    );
  }

  const authorId = (feedback as { author_id: string }).author_id;
  const feedbackTitle = (feedback as { title: string }).title;

  // Apply Asaas discount to author's subscription
  const DISCOUNT_PERCENT = 50;
  let asaasDiscountId: string | undefined;

  // Resolve author's asaas_subscription_id from user_profiles
  const { data: authorProfile } = await serviceClient
    .from('user_profiles')
    .select('asaas_subscription_id, full_name')
    .eq('id', authorId)
    .single();

  const subscriptionId = (authorProfile as { asaas_subscription_id?: string; full_name?: string } | null)
    ?.asaas_subscription_id;

  const authorName = (authorProfile as { full_name?: string } | null)?.full_name ?? 'usuário';

  let discountStatus: 'applied' | 'failed' = 'applied';

  if (subscriptionId) {
    try {
      const billingService = getBillingAdapter();
      const discountResult = await billingService.applySubscriptionDiscount(
        subscriptionId,
        DISCOUNT_PERCENT,
        `feedback_approved: ${id}`,
      );

      if (discountResult.success) {
        asaasDiscountId = discountResult.discountId;
      } else {
        discountStatus = 'failed';
        console.warn('[feedback/final-approve] Asaas discount failed:', discountResult.error);
      }
    } catch (err) {
      discountStatus = 'failed';
      console.warn('[feedback/final-approve] Asaas discount error:', err instanceof Error ? err.message : String(err));
    }
  }

  // Update feedback status
  const { error: updateError } = await serviceClient
    .from('app_feedback')
    .update({
      status: 'final_approved',
      final_approved_at: new Date().toISOString(),
      final_approved_by: auth.userId,
      discount_applied: discountStatus === 'applied',
    })
    .eq('id', id);

  if (updateError) {
    return internalError(c, updateError);
  }

  // Record discount in app_feedback_discounts
  await Promise.resolve(serviceClient
    .from('app_feedback_discounts')
    .insert({
      feedback_id: id,
      beneficiary_id: authorId,
      asaas_discount_id: asaasDiscountId ?? null,
      discount_percent: DISCOUNT_PERCENT,
      status: discountStatus,
    })).catch(() => {});

  // Audit log
  await Promise.resolve(serviceClient.from('audit_log').insert({
    entity_type: 'app_feedback',
    entity_id: id,
    action: 'FINAL_APPROVE',
    actor_id: auth.userId,
    actor_role: 'admin',
    before_data: { status: currentStatus },
    after_data: { status: 'final_approved', discount_applied: discountStatus === 'applied' },
  })).catch(() => {});

  // Notify author (email + WhatsApp) — fire-and-forget
  void (async () => {
    try {
      const notificationService = getNotificationService();
      await notificationService.dispatch({
        type: 'user_feedback_implemented',
        recipientId: authorId!,
        entityId: id!,
        metadata: {
          feedbackTitle,
          userName: authorName,
          discountPercent: DISCOUNT_PERCENT,
        },
      });
    } catch {
      // Notification failure must not block the response
    }
  })();

  return c.json({ success: true });
});

export default app;

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);

// Vercel also needs DELETE for future use — export it even though no DELETE handler exists yet
export const DELETE = handle(app);
