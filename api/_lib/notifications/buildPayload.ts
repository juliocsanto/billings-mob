/**
 * buildPayload / buildWhatsAppTemplate — ADR-012
 *
 * Pure functions (no side effects) that map a NotificationEvent to
 * notification text or WhatsApp template references.
 *
 * LGPD / Clinical constraint:
 * - These functions are the SINGLE source of truth for notification text.
 * - They NEVER receive clinical data (stamp, mucus, bleeding, relations, notes).
 * - They NEVER emit clinical classifications (fertile, infertile, safe, unsafe).
 * - Text is generic and non-identifying beyond a first name.
 *
 * No handler may construct notification text inline — always use these functions.
 */

import type { NotificationEvent } from './NotificationEvent';

export interface NotificationPayload {
  title: string;
  body: string;
}

/**
 * Builds a safe, non-clinical notification payload from a NotificationEvent.
 *
 * @param event - The notification event (no clinical fields in metadata).
 * @returns A { title, body } object ready for WhatsApp or FCM.
 */
export function buildPayload(event: NotificationEvent): NotificationPayload {
  const { type, metadata } = event;
  const name = metadata.studentName ?? 'Aluna';
  const date = metadata.date ?? '';

  switch (type) {
    case 'new_observation':
      return {
        title: 'Nova observação registrada',
        body: `Sua aluna ${name} registrou uma nova observação em ${date}.`,
      };

    case 'conflict_detected':
      return {
        title: 'Conflito de versão detectado',
        body: `Há um conflito de versão aguardando sua revisão para ${name} em ${date}.`,
      };

    case 'link_request':
      return {
        title: 'Nova solicitação de vínculo',
        body: `${name} solicitou vínculo com você no Billings Gráfico.`,
      };

    case 'link_accepted':
      return {
        title: 'Vínculo aceito',
        body: 'Sua instrutora aceitou seu pedido de vínculo no Billings Gráfico.',
      };

    // ── Feedback events (ADR-018) ──────────────────────────────────────────

    case 'feedback_triaged':
      return {
        title: 'Novo feedback aguarda sua revisão',
        body: `Feedback "${metadata.feedbackTitle ?? 'sem título'}" foi triado pela IA (impacto: ${metadata.triageImpact ?? 'desconhecido'}). Acesse o painel admin para aprovar ou rejeitar.`,
      };

    case 'feedback_deployed':
      return {
        title: 'Feature deployada — confirmação pendente',
        body: `A feature "${metadata.feedbackTitle ?? 'sem título'}" foi deployada. Confirme no painel admin para notificar o usuário e liberar o desconto.`,
      };

    case 'user_feedback_implemented':
      return {
        title: 'Sua sugestão foi implementada!',
        body: `Parabéns, ${metadata.userName ?? 'usuário'}! Sua sugestão "${metadata.feedbackTitle ?? ''}" foi implementada. Você receberá ${metadata.discountPercent ?? 50}% de desconto na próxima mensalidade.`,
      };
  }
}

// ---------------------------------------------------------------------------
// WhatsApp template mapping
// ---------------------------------------------------------------------------

/**
 * A reference to a Meta-approved WhatsApp message template.
 *
 * Templates `billings_nova_observacao` and `billings_conflito_versao` are not
 * yet approved — the CloudAdapter will attempt to send them and return an error
 * if Meta rejects them (graceful degradation per ADR-011).
 */
export interface WhatsAppTemplate {
  /** Exact template name as registered in Meta Business Manager */
  templateName: string;
  /** Positional parameters {{1}}, {{2}} … mapped in order */
  templateParams: string[];
}

/**
 * Maps a NotificationEvent to a WhatsApp template reference.
 *
 * Returns null only when there is no template defined for the event type,
 * which should never happen given the current exhaustive event union.
 *
 * LGPD / Clinical constraint:
 * - templateName is a generic identifier — no clinical meaning.
 * - templateParams contain only first name and ISO date — no clinical data.
 */
export function buildWhatsAppTemplate(event: NotificationEvent): WhatsAppTemplate | null {
  switch (event.type) {
    case 'link_request':
      return {
        templateName: 'billings_solicitacao_vinculo',
        templateParams: [event.metadata.studentName ?? 'uma aluna'],
      };

    case 'link_accepted':
      return {
        templateName: 'billings_vinculo_aceito',
        templateParams: [],
      };

    case 'new_observation':
      return {
        templateName: 'billings_nova_observacao',
        templateParams: [
          event.metadata.studentName ?? 'sua aluna',
          event.metadata.date ?? '',
        ],
      };

    case 'conflict_detected':
      return {
        templateName: 'billings_conflito_versao',
        templateParams: [
          event.metadata.studentName ?? 'sua aluna',
          event.metadata.date ?? '',
        ],
      };

    case 'feedback_triaged':
      return {
        templateName: 'billings_feedback_triado',
        templateParams: [
          event.metadata.feedbackTitle ?? 'Feedback',
          event.metadata.triageImpact ?? 'desconhecido',
        ],
      };

    case 'feedback_deployed':
      return {
        templateName: 'billings_feedback_deployado',
        templateParams: [
          event.metadata.feedbackTitle ?? 'Feature',
        ],
      };

    case 'user_feedback_implemented':
      return {
        templateName: 'billings_feedback_implementado',
        templateParams: [
          event.metadata.userName ?? 'usuário',
          event.metadata.feedbackTitle ?? 'sua sugestão',
          String(event.metadata.discountPercent ?? 50),
        ],
      };

    default:
      return null;
  }
}
