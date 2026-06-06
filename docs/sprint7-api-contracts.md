# Sprint 7 — API Contracts (OpenAPI 3.1)

> Documento: contratos de API para as novas integrações da Sprint 7.  
> Projeto: Billings Grafico — billings-mob  
> Data: 2026-06-05  
> Arquiteto: Julio C. Santo  
> ADRs relacionados: ADR-015 (Asaas), ADR-016 (Guia IA), ADR-017 (Rate Limiting)

---

## Sumário de Endpoints

| Endpoint | Método | Auth | Rate Limit | ADR |
|---|---|---|---|---|
| `/api/billing/subscribe` | POST | JWT obrigatório | 60 req/60s (global) | ADR-015 |
| `/api/billing/status` | GET | JWT obrigatório | 60 req/60s (global) | ADR-015 |
| `/api/billing/webhook` | POST | HMAC-SHA256 (sem JWT) | Sem rate limit | ADR-015 |
| `/api/ai-guide` | POST | JWT obrigatório | 10 req/hora por usuário | ADR-016 |

---

## OpenAPI 3.1 YAML

```yaml
openapi: 3.1.0
info:
  title: Billings Grafico API — Sprint 7
  version: 2.0.0
  description: |
    Contratos dos endpoints de billing (Asaas) e Guia IA (Claude claude-sonnet-4-6 streaming).
    Base URL de produção: https://billings-mob.vercel.app

servers:
  - url: https://billings-mob.vercel.app
    description: Produção (Vercel Serverless)
  - url: http://localhost:3000
    description: Desenvolvimento local

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: JWT emitido pelo Supabase Auth. Obtido via magic link ou Google OAuth.

  schemas:
    ErrorResponse:
      type: object
      required: [error]
      properties:
        error:
          type: string
          description: Mensagem de erro sanitizada (sem stack trace em produção).
        code:
          type: string
          description: Código de erro interno (opcional).
      example:
        error: "Assinatura não encontrada para este usuário"
        code: "SUBSCRIPTION_NOT_FOUND"

    BillingPlan:
      type: string
      enum: [instructor_monthly, instructor_annual]
      description: |
        - instructor_monthly: R$ 99/mês (até 30 alunas)
        - instructor_annual: R$ 990/ano (até 30 alunas, 2 meses grátis)

    SubscriptionStatus:
      type: string
      enum: [active, expired, trial]
      description: |
        - active: assinatura em dia
        - expired: assinatura vencida ou cancelada
        - trial: período de avaliação gratuita (30 dias)

    BillingSubscribeResponse:
      type: object
      required: [subscriptionId, status, nextDueDate, paymentUrl]
      properties:
        subscriptionId:
          type: string
          description: ID externo da assinatura na Asaas. Nunca contém dados de cartão.
          example: "sub_abc123xyz"
        status:
          $ref: '#/components/schemas/SubscriptionStatus'
        nextDueDate:
          type: string
          format: date
          description: Próxima data de vencimento (YYYY-MM-DD).
          example: "2026-07-05"
        paymentUrl:
          type: string
          format: uri
          description: |
            URL de pagamento gerada pela Asaas. A instrutora é redirecionada para
            completar o pagamento via PIX, boleto ou cartão diretamente na interface Asaas.
            Nunca processar dados de cartão no backend próprio.
          example: "https://www.asaas.com/checkout/abc123"

    BillingStatusResponse:
      type: object
      required: [subscriptionStatus, plan]
      properties:
        subscriptionStatus:
          $ref: '#/components/schemas/SubscriptionStatus'
        plan:
          $ref: '#/components/schemas/BillingPlan'
        subscriptionId:
          type: string
          nullable: true
          description: ID externo Asaas. Null se nunca assinou.
        expiresAt:
          type: string
          format: date-time
          nullable: true
          description: Data/hora de expiração da assinatura atual. Null em trial.

    AsaasWebhookEvent:
      type: string
      enum:
        - PAYMENT_CONFIRMED
        - PAYMENT_CANCELED
        - SUBSCRIPTION_CANCELED
        - PAYMENT_OVERDUE

    AiGuideRequest:
      type: object
      required: [question]
      properties:
        question:
          type: string
          minLength: 3
          maxLength: 500
          description: |
            Pergunta educativa sobre o Método Billings ou sobre o uso do aplicativo.
            NUNCA enviar: stamps, observações clínicas, datas de ciclo, relações íntimas,
            email, fcm_token ou qualquer outro dado pessoal da aluna.
          example: "Como funciona o Ápice no Método Billings?"

paths:

  # ===========================================================================
  # POST /api/billing/subscribe
  # ===========================================================================
  /api/billing/subscribe:
    post:
      operationId: billingSubscribe
      summary: Inicia uma assinatura Asaas para a instrutora autenticada
      description: |
        Cria uma assinatura recorrente via Asaas REST API v3.
        Retorna a URL de pagamento para redirect do frontend.
        
        LGPD: apenas metadados (plano, email) são enviados à Asaas.
        Dados de cartão nunca transitam pelo backend próprio.
        
        PCI-DSS: escopo reduzido — o backend não processa, armazena nem transmite
        dados de cartão. Todo o processamento de cartão ocorre nos servidores Asaas.
        
        Vector clock: não aplicável (entidade de billing não tem edição concorrente).
      security:
        - BearerAuth: []
      tags: [billing]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [plan]
              properties:
                plan:
                  $ref: '#/components/schemas/BillingPlan'
                billingType:
                  type: string
                  enum: [PIX, BOLETO, CREDIT_CARD]
                  default: PIX
                  description: Método de pagamento preferido. Default PIX (menor custo).
            example:
              plan: "instructor_monthly"
              billingType: "PIX"
      responses:
        '201':
          description: Assinatura criada com sucesso.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BillingSubscribeResponse'
              example:
                subscriptionId: "sub_abc123xyz"
                status: "active"
                nextDueDate: "2026-07-05"
                paymentUrl: "https://www.asaas.com/checkout/abc123"
        '400':
          description: |
            Corpo da requisição inválido (plano desconhecido, billingType inválido)
            ou instrutora já possui assinatura ativa.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error: "Instrutora já possui assinatura ativa"
                code: "SUBSCRIPTION_ALREADY_ACTIVE"
        '401':
          description: JWT ausente ou inválido.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '403':
          description: |
            Usuário autenticado não tem role=instructor.
            Apenas instrutoras podem assinar planos.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error: "Apenas instrutoras podem criar assinaturas"
                code: "ROLE_REQUIRED_INSTRUCTOR"
        '429':
          description: Rate limit excedido.
          headers:
            X-RateLimit-Limit:
              schema:
                type: integer
              description: Limite de requisições na janela.
            X-RateLimit-Remaining:
              schema:
                type: integer
              description: Requisições restantes na janela atual.
            X-RateLimit-Reset:
              schema:
                type: integer
              description: Timestamp Unix do reset da janela.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '502':
          description: Erro de comunicação com a Asaas API.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error: "Falha ao comunicar com o gateway de pagamentos"
                code: "ASAAS_UPSTREAM_ERROR"

      x-zod-schema: |
        // Zod — validação de entrada (api/billing/subscribe.ts)
        const SubscribeSchema = z.object({
          plan: z.enum(['instructor_monthly', 'instructor_annual']),
          billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).default('PIX'),
        }).strict();

      x-rate-limit:
        window: 60 segundos
        limit: 60 requests por IP
        backend: Upstash Redis (ADR-017)

      x-security-notes: |
        - JWT validado via createAuthenticatedClient (mesmo padrão dos outros endpoints)
        - Role instructor verificada em user_profiles.role (não user_metadata — ADR-005)
        - Email da instrutora obtido do JWT (sub claim) — nunca do body da requisição
        - MockAsaasAdapter usado quando ASAAS_ENV=mock (CI + desenvolvimento local)

  # ===========================================================================
  # GET /api/billing/status
  # ===========================================================================
  /api/billing/status:
    get:
      operationId: billingGetStatus
      summary: Retorna o status de assinatura da instrutora autenticada
      description: |
        Consulta o status atual da assinatura da instrutora autenticada.
        Usado pelo frontend para exibir o estado da conta (active/expired/trial)
        e bloquear acesso ao dashboard se expirado.
        
        O status é lido de user_profiles.subscription_status (banco local),
        não da Asaas API diretamente — sincronizado via webhook (POST /api/billing/webhook).
      security:
        - BearerAuth: []
      tags: [billing]
      responses:
        '200':
          description: Status retornado com sucesso.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BillingStatusResponse'
              example:
                subscriptionStatus: "active"
                plan: "instructor_monthly"
                subscriptionId: "sub_abc123xyz"
                expiresAt: "2026-07-05T23:59:59Z"
        '401':
          description: JWT ausente ou inválido.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '403':
          description: Usuário autenticado não tem role=instructor.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '404':
          description: Perfil de instrutora não encontrado (usuário sem user_profiles).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit excedido.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

      x-rate-limit:
        window: 60 segundos
        limit: 60 requests por IP
        backend: Upstash Redis (ADR-017)

  # ===========================================================================
  # POST /api/billing/webhook
  # ===========================================================================
  /api/billing/webhook:
    post:
      operationId: billingWebhook
      summary: Recebe eventos de pagamento da Asaas (webhook)
      description: |
        Endpoint chamado pela Asaas ao ocorrer eventos de pagamento ou assinatura.
        
        SEGURANÇA CRÍTICA:
        - Não usa JWT (a Asaas não é uma usuária autenticada)
        - Valida HMAC-SHA256 obrigatório via header `asaas-signature`
        - Usa timingSafeEqual para evitar timing attacks
        - Se assinatura inválida: retorna 401 imediatamente, sem processar payload
        
        LGPD: o payload da Asaas contém apenas metadados (ID assinatura, evento,
        data). Nunca contém dados de ciclo, observações ou dados clínicos da aluna.
        
        Rate limiting: não aplicável. O endpoint é chamado apenas pela Asaas
        (IP allowlist opcional). A validação HMAC é a defesa primária.
        
        Idempotência: eventos duplicados (mesmo eventId) são ignorados com 200.
      tags: [billing]
      security: []
      parameters:
        - in: header
          name: asaas-signature
          required: true
          schema:
            type: string
          description: |
            HMAC-SHA256 do corpo da requisição (raw bytes) usando o segredo
            configurado em ASAAS_WEBHOOK_SECRET. Formato: hex string.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [event, payment]
              properties:
                event:
                  $ref: '#/components/schemas/AsaasWebhookEvent'
                payment:
                  type: object
                  required: [id, subscription, customer]
                  properties:
                    id:
                      type: string
                      description: ID do pagamento na Asaas.
                    subscription:
                      type: string
                      description: ID da assinatura na Asaas.
                    customer:
                      type: string
                      description: ID do cliente na Asaas.
                    value:
                      type: number
                      description: Valor do pagamento em BRL.
                    dueDate:
                      type: string
                      format: date
                    paymentDate:
                      type: string
                      format: date
                      nullable: true
            example:
              event: "PAYMENT_CONFIRMED"
              payment:
                id: "pay_abc123"
                subscription: "sub_abc123xyz"
                customer: "cus_xyz789"
                value: 99.00
                dueDate: "2026-07-05"
                paymentDate: "2026-06-05"
      responses:
        '200':
          description: |
            Evento processado com sucesso (ou ignorado por idempotência).
            A Asaas requer HTTP 200 para confirmar recebimento.
          content:
            application/json:
              schema:
                type: object
                required: [received]
                properties:
                  received:
                    type: boolean
                    example: true
        '401':
          description: |
            Assinatura HMAC-SHA256 inválida ou ausente.
            O payload não foi processado.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error: "Webhook signature validation failed"
                code: "INVALID_WEBHOOK_SIGNATURE"
        '400':
          description: Payload malformado (schema inválido após validação de assinatura).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

      x-security-notes: |
        Implementação de validação HMAC-SHA256 (obrigatória):
        
        ```typescript
        import { createHmac, timingSafeEqual } from 'node:crypto';
        
        function validateAsaasSignature(rawBody: string, signature: string): boolean {
          const expected = createHmac('sha256', process.env.ASAAS_WEBHOOK_SECRET!)
            .update(rawBody, 'utf8')
            .digest('hex');
          try {
            return timingSafeEqual(
              Buffer.from(expected, 'hex'),
              Buffer.from(signature, 'hex')
            );
          } catch {
            return false; // buffers de tamanho diferente
          }
        }
        ```
        
        O raw body deve ser lido ANTES de qualquer parsing JSON para garantir
        que a assinatura cubra exatamente os bytes recebidos.

      x-effects: |
        Quando event=PAYMENT_CONFIRMED:
          UPDATE user_profiles SET subscription_status='active',
            subscription_expires_at=nextDueDate WHERE asaas_subscription_id=subscriptionId
        
        Quando event=PAYMENT_CANCELED ou SUBSCRIPTION_CANCELED:
          UPDATE user_profiles SET subscription_status='expired'
            WHERE asaas_subscription_id=subscriptionId
        
        Quando event=PAYMENT_OVERDUE:
          UPDATE user_profiles SET subscription_status='expired'
            WHERE asaas_subscription_id=subscriptionId
          (notificação WhatsApp/email para instrutora — via NotificationService)

  # ===========================================================================
  # POST /api/ai-guide
  # ===========================================================================
  /api/ai-guide:
    post:
      operationId: aiGuideAsk
      summary: Pergunta educativa para o Guia IA (proxy SSE para Supabase Edge)
      description: |
        Envia uma pergunta educativa sobre o Método Billings para o Guia IA.
        Retorna a resposta em streaming via Server-Sent Events (SSE).
        
        Este endpoint é um proxy leve no Hono.js que:
        1. Valida o JWT e extrai o user_id
        2. Valida e sanitiza o campo question (Zod)
        3. Chama a Supabase Edge Function ai-guide com o JWT do usuário
        4. Faz pipe do stream SSE da Edge Function para o cliente
        
        Alternativa de chamada direta:
        O frontend pode também chamar a Supabase Edge Function diretamente via
        supabase.functions.invoke('ai-guide', { body: { question } }) usando
        o cliente Supabase com o JWT já configurado. Essa abordagem elimina o
        hop extra no Vercel. A decisão de arquitetura (proxy vs direto) é
        implementada pelo fullstack-developer na Sprint 7.
        
        LGPD HARD CONSTRAINT:
        - O campo question NUNCA deve conter dados clínicos (stamps, observações,
          datas de ciclo, relações íntimas, email, fcm_token).
        - O backend não injeta dados clínicos no prompt — apenas encaminha a question.
        - A Anthropic API nunca recebe dados pessoais identificáveis da aluna.
        
        RESTRIÇÃO CLÍNICA (ADR-002, Regra 1):
        - O sistema retorna ERRO 422 se a question contiver os termos proibidos:
          'fértil', 'infértil', 'seguro', 'inseguro', 'dia de risco'.
        - O SafetyGuard na Edge Function filtra termos proibidos no output.
        - O aviso legal é sempre incluído na resposta (evento SSE type=disclaimer).
      security:
        - BearerAuth: []
      tags: [ai-guide]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AiGuideRequest'
            example:
              question: "Como funciona o Ápice no Método Billings?"
      responses:
        '200':
          description: |
            Stream SSE iniciado com sucesso.
            
            Content-Type: text/event-stream
            
            Formato dos eventos:
            
            data: {"type":"disclaimer","text":"Este guia é educativo..."}\n\n
            data: {"type":"delta","text":"O Ápice é..."}\n\n
            data: {"type":"delta","text":" caracterizado por..."}\n\n
            data: {"type":"done"}\n\n
            
            Em caso de erro durante o stream:
            data: {"type":"error","message":"Desculpe, ocorreu um erro..."}\n\n
          content:
            text/event-stream:
              schema:
                type: string
                description: Stream de eventos SSE.
        '400':
          description: |
            question ausente, vazia ou excede 500 caracteres.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error: "A pergunta deve ter entre 3 e 500 caracteres"
                code: "QUESTION_INVALID"
        '401':
          description: JWT ausente ou inválido.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '422':
          description: |
            A pergunta contém termos de interpretação clínica proibidos
            (fértil, infértil, seguro, inseguro, dia de risco).
            A restrição clínica do sistema impede processar esta pergunta.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error: "Perguntas sobre interpretação clínica de ciclo são respondidas exclusivamente pela sua instrutora certificada. Consulte-a pelo app."
                code: "CLINICAL_INTERPRETATION_FORBIDDEN"
        '429':
          description: |
            Rate limit do Guia IA excedido (10 perguntas por hora por usuário).
          headers:
            Retry-After:
              schema:
                type: integer
              description: Segundos até o reset da janela de rate limit.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error: "Limite de perguntas excedido. Tente novamente em 45 minutos."
                code: "AI_GUIDE_RATE_LIMIT"
        '502':
          description: Falha de comunicação com a Supabase Edge Function.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

      x-zod-schema: |
        // Zod — validação de entrada (api/ai-guide/index.ts)
        const FORBIDDEN_CLINICAL_TERMS = [
          'fértil', 'fertil', 'infértil', 'infertil',
          'seguro', 'inseguro', 'dia de risco', 'período seguro',
          'fertile', 'infertile', 'safe', 'unsafe',
        ];
        
        const AiGuideSchema = z.object({
          question: z.string()
            .min(3, 'A pergunta deve ter ao menos 3 caracteres')
            .max(500, 'A pergunta deve ter no máximo 500 caracteres')
            .refine(
              (q) => !FORBIDDEN_CLINICAL_TERMS.some(t => q.toLowerCase().includes(t)),
              {
                message: 'Perguntas sobre interpretação clínica são respondidas pela instrutora.',
                path: ['question'],
              }
            ),
        }).strict();

      x-rate-limit:
        window: 60 minutos
        limit: 10 requests por user_id
        backend: Upstash Redis (ADR-017)
        key: user_id (extraído do JWT — não IP, para proteger usuários em NAT compartilhado)

      x-sse-client-example: |
        // Frontend: consumir SSE no billings-mob (src/pages/GuidePage.jsx)
        const response = await fetch('/api/ai-guide', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ question }),
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const lines = decoder.decode(value).split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const event = JSON.parse(line.slice(6));
            
            if (event.type === 'delta') {
              setResponse(prev => prev + event.text);
            } else if (event.type === 'done') {
              setLoading(false);
            } else if (event.type === 'error') {
              setError(event.message);
            } else if (event.type === 'disclaimer') {
              setDisclaimer(event.text);
            }
          }
        }
```

---

## Zod Schemas (TypeScript)

Schemas completos para validação de entrada em cada endpoint.
Localizações nos arquivos do projeto:

### POST /api/billing/subscribe

```typescript
// api/billing/subscribe.ts
import { z } from 'zod';

export const SubscribeSchema = z.object({
  plan: z.enum(['instructor_monthly', 'instructor_annual']),
  billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).default('PIX'),
}).strict();

export type SubscribeInput = z.infer<typeof SubscribeSchema>;
```

### POST /api/billing/webhook

```typescript
// api/billing/webhook.ts
import { z } from 'zod';

const AsaasWebhookEventSchema = z.enum([
  'PAYMENT_CONFIRMED',
  'PAYMENT_CANCELED',
  'SUBSCRIPTION_CANCELED',
  'PAYMENT_OVERDUE',
]);

export const AsaasWebhookPayloadSchema = z.object({
  event: AsaasWebhookEventSchema,
  payment: z.object({
    id: z.string(),
    subscription: z.string(),
    customer: z.string(),
    value: z.number().optional(),
    dueDate: z.string().optional(),
    paymentDate: z.string().nullable().optional(),
  }),
}).passthrough(); // Asaas pode adicionar campos novos sem quebrar o schema

export type AsaasWebhookPayload = z.infer<typeof AsaasWebhookPayloadSchema>;
```

### POST /api/ai-guide

```typescript
// api/ai-guide/index.ts
import { z } from 'zod';

const FORBIDDEN_CLINICAL_TERMS = [
  'fértil', 'fertil', 'infértil', 'infertil',
  'seguro', 'inseguro', 'dia de risco', 'período seguro',
  'fertile', 'infertile', 'safe day', 'unsafe',
];

export const AiGuideSchema = z.object({
  question: z
    .string()
    .min(3, 'A pergunta deve ter ao menos 3 caracteres')
    .max(500, 'A pergunta deve ter no máximo 500 caracteres')
    .refine(
      (q) => !FORBIDDEN_CLINICAL_TERMS.some((t) => q.toLowerCase().includes(t)),
      {
        message:
          'Perguntas sobre interpretação clínica de ciclo são respondidas exclusivamente pela sua instrutora certificada CENPLAFAM/WOOMB.',
      }
    ),
}).strict();

export type AiGuideInput = z.infer<typeof AiGuideSchema>;
```

---

## SQL Migrations (Sprint 7)

### Migration: billing fields em user_profiles

```sql
-- migrations/20260605000001_add_billing_to_user_profiles.sql
-- UP
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT
    NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('active', 'expired', 'trial')),
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.subscription_status IS
  'Status de assinatura da instrutora. Valores: active | expired | trial. Apenas instrutoras (role=instructor) usam este campo.';

COMMENT ON COLUMN user_profiles.asaas_subscription_id IS
  'ID externo da assinatura na Asaas. Nunca contém dados de cartão. Pode ser null se nunca assinou.';

COMMENT ON COLUMN user_profiles.subscription_expires_at IS
  'Data/hora de expiração da assinatura atual. Atualizado via webhook Asaas. Null em trial.';

-- Índice para lookup rápido por subscription_id no handler do webhook
CREATE INDEX IF NOT EXISTS idx_user_profiles_asaas_sub_id
  ON user_profiles (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

-- DOWN
ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS asaas_subscription_id,
  DROP COLUMN IF EXISTS subscription_expires_at;

DROP INDEX IF EXISTS idx_user_profiles_asaas_sub_id;
```

### RLS Policies — user_profiles (extensão)

```sql
-- As políticas existentes de user_profiles cobrem leitura por role.
-- Adicionar política específica para atualização de subscription_status:
-- Apenas service_role (webhook handler) pode alterar subscription_status.
-- Usuária autenticada pode alterar outros campos do próprio perfil mas não subscription_status.

-- Nota: implementar via CHECK de coluna no trigger, não RLS adicional,
-- para não conflitar com a política existente "user_own_profile".
CREATE OR REPLACE FUNCTION prevent_client_subscription_status_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Permite alteração de subscription_status apenas para service_role
  IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
     AND current_user != 'service_role'
     AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'subscription_status só pode ser alterado pelo sistema de billing';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_subscription_status_update
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_client_subscription_status_update();
```

---

## Diagrama de Sequência — Fluxo Billing Completo

```
Instrutora (billings-web)
    |
    | 1. POST /api/billing/subscribe { plan: "instructor_monthly" }
    |    Authorization: Bearer <JWT>
    v
Vercel Serverless (api/billing/subscribe.ts)
    |
    | 2. Valida JWT → extrai email da instrutora
    | 3. Verifica role=instructor em user_profiles
    | 4. Chama getBillingAdapter().createSubscription(plan, email)
    |    (MockAdapter em dev / AsaasCloudAdapter em produção)
    v
Asaas REST API v3 (produção)
    |
    | 5. Cria assinatura → retorna { subscriptionId, paymentUrl }
    v
Vercel Serverless
    |
    | 6. Salva asaas_subscription_id em user_profiles (service role)
    | 7. Define subscription_status='trial' (aguarda confirmação de pagamento)
    | 8. Retorna { subscriptionId, status, paymentUrl } → 201
    v
Frontend (billings-web)
    |
    | 9. Redireciona instrutora para paymentUrl (Asaas checkout)
    v
Asaas Checkout (domínio externo)
    |
    | 10. Instrutora paga via PIX/boleto/cartão
    v
Asaas
    |
    | 11. POST /api/billing/webhook { event: PAYMENT_CONFIRMED, payment: {...} }
    |     asaas-signature: <HMAC-SHA256>
    v
Vercel Serverless (api/billing/webhook.ts)
    |
    | 12. Valida HMAC-SHA256 (timingSafeEqual)
    | 13. Atualiza user_profiles SET subscription_status='active'
    | 14. Retorna { received: true } → 200
    v
Asaas confirma entrega do evento
```

---

## Diagrama de Sequência — Fluxo Guia IA

```
Aluna (billings-mob — tab "Guia")
    |
    | 1. Digita pergunta: "Como funciona o Ápice?"
    | 2. POST /api/ai-guide { question: "Como funciona o Ápice?" }
    |    Authorization: Bearer <JWT>
    v
Vercel Serverless (api/ai-guide/index.ts)
    |
    | 3. Valida JWT → extrai user_id
    | 4. Zod: valida question (3-500 chars, sem termos clínicos proibidos)
    | 5. Rate limit check (Upstash Redis: 10/hora por user_id)
    | 6. Chama Supabase Edge Function ai-guide (pipe JWT)
    v
Supabase Edge Function (supabase/functions/ai-guide/index.ts — Deno)
    |
    | 7. Re-valida JWT (supabase.auth.getUser)
    | 8. Rate limit check redundante (Upstash Redis)
    | 9. Monta payload Claude:
    |    { model: "claude-sonnet-4-6", system: SYSTEM_PROMPT,
    |      messages: [{ role: "user", content: question }] }
    |    NUNCA inclui: stamps, observações, email, fcm_token
    v
Anthropic API (Claude claude-sonnet-4-6)
    |
    | 10. Retorna stream de chunks de texto
    v
Supabase Edge Function
    |
    | 11. Para cada chunk: SafetyGuard verifica termos proibidos
    |     Se proibido: emite evento SSE de redirect para instrutora
    | 12. Encaminha chunks como SSE: data: {"type":"delta","text":"..."}
    v
Vercel Serverless (pipe)
    v
Frontend (billings-mob)
    |
    | 13. Exibe texto progressivamente em <div role="log" aria-live="polite">
    | 14. Ao receber data: {"type":"done"}: esconde loading indicator
```

---

## Variáveis de Ambiente — Sprint 7

Novas variáveis a serem adicionadas no painel Vercel (targets: production + preview)
e no `.env.local` de desenvolvimento:

```bash
# === Asaas Billing (ADR-015) ===
ASAAS_ENV=mock                    # 'mock' (dev/CI) ou 'production'
ASAAS_API_KEY=...                 # Chave de API Asaas (apenas produção)
ASAAS_WEBHOOK_SECRET=...          # Segredo HMAC-SHA256 para validação de webhooks

# === Upstash Redis Rate Limiting (ADR-017) ===
UPSTASH_REDIS_REST_URL=...        # URL REST do banco Redis no Upstash
UPSTASH_REDIS_REST_TOKEN=...      # Token de autenticação REST

# === Anthropic (já existia em Supabase Edge — confirmar) ===
ANTHROPIC_API_KEY=...             # Supabase Edge Function secrets (não Vercel)
```

Variáveis que já existem e não mudam:

```bash
# Já configuradas (Sprint 1+):
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
WHATSAPP_API_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

---

## Checklist de Segurança — Sprint 7

- [ ] HMAC-SHA256 validado em `POST /api/billing/webhook` com `timingSafeEqual`
- [ ] Nenhum dado de cartão armazenado ou logado (PCI-DSS escopo reduzido)
- [ ] `question` da Guia IA não contém dados clínicos (validado via Zod + SafetyGuard)
- [ ] `ANTHROPIC_API_KEY` configurado apenas em Supabase Edge Function secrets (não no bundle Vercel)
- [ ] `ASAAS_API_KEY` configurado apenas em Vercel server-side (não no bundle frontend)
- [ ] `ASAAS_WEBHOOK_SECRET` configurado apenas em Vercel server-side
- [ ] Rate limiting global via Upstash Redis (não in-memory — ADR-017)
- [ ] `relations` e `notes` nunca aparecem em logs de billing ou AI Guide
- [ ] Trigger `prevent_client_subscription_status_update` impede alteração direta pelo cliente
- [ ] Mock adapters usados em CI (`ASAAS_ENV=mock`) — sem chamadas reais em testes

---

*Documento gerado em 2026-06-05 pelo software-architect (Stage 3).*  
*ADRs de referência: ADR-015, ADR-016, ADR-017 em ARCHITECTURE.md v1.4.*
