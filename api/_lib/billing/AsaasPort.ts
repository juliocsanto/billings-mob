/**
 * Asaas billing hexagonal port — ADR-015
 *
 * Defines the outbound port (interface) that application-layer code
 * (billing endpoints) depends on. No adapter details leak here.
 *
 * LGPD: dados de cartão NUNCA transitam pelo backend próprio.
 * Apenas metadados de assinatura (plano, email, subscriptionId) são processados.
 * PCI-DSS: escopo reduzido — todo processamento de cartão ocorre nos servidores Asaas.
 */

/** Planos de assinatura disponíveis. */
export type AsaasPlan = 'instructor_monthly' | 'instructor_annual';

/** Status de uma assinatura Asaas. */
export type AsaasStatus = 'active' | 'expired' | 'trial';

/** Eventos de webhook da Asaas relevantes para este sistema. */
export type AsaasWebhookEvent =
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'SUBSCRIPTION_CANCELED';

/** Resultado da criação ou consulta de uma assinatura Asaas. */
export interface AsaasSubscription {
  /** ID externo Asaas — nunca contém dados de cartão. */
  subscriptionId: string;
  status: AsaasStatus;
  /** Próxima data de vencimento no formato YYYY-MM-DD. */
  nextDueDate: string;
  /** URL de pagamento gerada pela Asaas para redirect do frontend. */
  paymentUrl: string;
}

/** Dados extraídos e verificados de um payload de webhook Asaas. */
export interface AsaasWebhookResult {
  /** Email da instrutora — identificador do cliente na Asaas. */
  customerId: string;
  event: AsaasWebhookEvent;
  subscriptionId: string;
}

/**
 * Hexagonal outbound port.
 * Application code depends only on this interface — never on a concrete adapter.
 * Same pattern as WhatsAppPort (ADR-011).
 */
export interface AsaasPort {
  /**
   * Cria uma nova assinatura recorrente na Asaas para a instrutora.
   * LGPD: apenas email e plano são enviados — nunca dados de cartão.
   */
  createSubscription(plan: AsaasPlan, email: string): Promise<AsaasSubscription>;

  /**
   * Consulta o status atual de uma assinatura pelo ID externo.
   */
  getSubscriptionStatus(subscriptionId: string): Promise<Pick<AsaasSubscription, 'status' | 'nextDueDate'>>;

  /**
   * Verifica a assinatura HMAC-SHA256 e extrai os dados do webhook.
   * Lança erro com message 'invalid_signature' se a assinatura for inválida.
   *
   * @param rawBody     - Corpo bruto da requisição como string.
   * @param signature   - Valor do header 'asaas-signature'.
   * @param secret      - ASAAS_WEBHOOK_SECRET do ambiente.
   */
  parseWebhookPayload(rawBody: string, signature: string, secret: string): Promise<AsaasWebhookResult>;

  /**
   * Aplica um desconto percentual na próxima cobrança de uma assinatura.
   * Usado para recompensar autores de feedback implementado (ADR-018).
   *
   * LGPD: apenas subscriptionId e percentual transitam — sem dados de cartão.
   *
   * @param subscriptionId  - ID externo da assinatura Asaas.
   * @param discountPercent - Percentual de desconto (ex.: 50 para 50%).
   * @param reason          - Texto descritivo para auditoria (ex.: 'feedback_approved: <id>').
   */
  applySubscriptionDiscount(
    subscriptionId: string,
    discountPercent: number,
    reason: string,
  ): Promise<{ success: boolean; discountId?: string; error?: string }>;
}
