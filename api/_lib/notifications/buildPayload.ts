/**
 * buildPayload — ADR-012
 *
 * Pure function (no side effects) that maps a NotificationEvent to a
 * notification title + body text.
 *
 * LGPD / Clinical constraint:
 * - This function is the SINGLE source of truth for notification text.
 * - It NEVER receives clinical data (stamp, mucus, bleeding, relations, notes).
 * - It NEVER emits clinical classifications (fertile, infertile, safe, unsafe).
 * - Text is generic and non-identifying beyond a first name.
 *
 * No handler may construct notification text inline — always use this function.
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
  }
}
