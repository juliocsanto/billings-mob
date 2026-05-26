# ARCHITECTURE.md — Billings Gráfico: Plataforma MOB

> Documento de Arquitetura de Software — Versao 1.1  
> Projeto: **Billings Grafico** (billings-mob)  
> Data: 2026-05-24 — atualizado em 2026-05-26  
> Arquiteto Responsavel: Julio C. Santo  
> Status: **APROVADO PARA IMPLEMENTACAO**

---

## Indice

1. [Visao Geral do Sistema](#1-visao-geral-do-sistema)
2. [Stack de Tecnologia — ADR-001 a ADR-009](#2-stack-de-tecnologia)
3. [Bounded Contexts — DDD](#3-bounded-contexts)
4. [Catalogo de Agentes — 9 Estagios](#4-catalogo-de-agentes)
5. [Skills Library](#5-skills-library)
6. [Protocolo de Comunicacao Inter-Agente](#6-protocolo-de-comunicacao-inter-agente)
7. [Estrategia de Monetizacao — Hormozi](#7-estrategia-de-monetizacao)
8. [Roadmap de Implementacao](#8-roadmap-de-implementacao)
9. [Registro de Riscos](#9-registro-de-riscos)
10. [Definition of Done](#10-definition-of-done)
11. [Proximos Passos](#11-proximos-passos)

---

## 1. Visao Geral do Sistema

### 1.1 Contexto do Produto

**Billings Grafico** e um sistema digital para suporte ao Metodo de Ovulacao Billings (MOB), metodologia certificada pela CENPLAFAM/WOOMB. O sistema conecta:

- **Aluna** — registra observacoes diarias do ciclo (selos, muco, sangramento, relacoes, notas)
- **Instrutora** — monitora o progresso da aluna, valida registros, emite orientacoes clinicas
- **IA Guide** — auxilia a aluna no uso do aplicativo (nunca interpreta o ciclo — responsabilidade exclusiva da instrutora)

**Restricao clinica inviolavel**: O sistema NUNCA deve interpretar automaticamente o ciclo como fertil ou infertil. Toda interpretacao clinica e competencia exclusiva da instrutora certificada CENPLAFAM/WOOMB.

### 1.2 Paths Locais dos Repositorios

Os repositorios residem dentro de um diretorio organizador `billings/`:

| Repositorio    | Path local                            |
|----------------|---------------------------------------|
| billings-mob   | ~/billings/billings-mob               |
| billings-web   | ~/billings/billings-web               |

### 1.4 Diagrama de Sistema — Visao de Alto Nivel

```
+------------------------------------------------------------------+
|                      USUARIOS FINAIS                             |
+------------------------------------------------------------------+
|  [Aluna — Mobile PWA]         [Instrutora — Web Dashboard]       |
|  iOS / Android / Browser      React Web (desktop/tablet)         |
+------------------+-----------------------------+-----------------+
                   |                             |
        +----------v---------+        +----------v---------+
        |   React PWA        |        |  React Web App     |
        |   (billings-mob)   |        |  (billings-web)    |
        |   Vite + React 18  |        |  Vite + React 18   |
        | billings-mob.      |        | billings-web.      |
        |   vercel.app       |        |   vercel.app       |
        +----------+---------+        +----------+---------+
                   |                             |
                   +-------------+---------------+
                                 |
          +----------------------v-----------------------+
          |          VERCEL SERVERLESS FUNCTIONS         |
          |   REST API — Hono.js / Node.js / TypeScript  |
          |   (CRUD: ciclos, alunas, instrutoras, auth)   |
          +----+-------------------+---------------------+
               |                  |
   +-----------v-----------+   +--v---------------------------+
   |   SUPABASE (Sao Paulo)|   |  SUPABASE EDGE FUNCTIONS     |
   |   - PostgreSQL (RLS)  |   |  Claude API Streaming (SSE)  |
   |   - Auth (JWT)        |   |  Deno — sem timeout fixo     |
   |   - Realtime (WS)     |   +------------------------------+
   |   - Storage (PDFs)    |
   +-----------+-----------+
               |
   +-----------v-----------+    +----------------------------+
   |  FCM (Firebase)       |    | WhatsApp Cloud API (Meta)  |
   |  Push Notifications   |    | Oficial — free tier        |
   |  (free)               |    | 1.000 conv/mes gratis      |
   +-----------------------+    +----------------------------+
                                          |
                              +-----------v-----------+
                              |   Anthropic API       |
                              |   Claude (Guia IA)    |
                              +-----------------------+
```

**Stack centralizado — custo MVP estimado: USD 0–8/mes**
(tudo em free tier: Vercel + Supabase + GitHub Actions + FCM + WhatsApp Cloud API;
custo so aparece se ultrapassar 1.000 conversas WhatsApp/mes)

### 1.5 Diagrama de Fluxo de Dados Principal

```
ALUNA (Mobile PWA)
  |
  | 1. Registra observacao diaria
  v
[Frontend React] --> [POST /api/observations]
                              |
                   2. Valida schema (Zod)
                              |
                   3. Persiste no PostgreSQL
                              |
                   4. Invalida cache Redis
                              |
                   5. Notifica instrutora (webhook)
                              |
                   +----------v----------+
                   | INSTRUTORA         |
                   | (Web Dashboard)    |
                   | Ve registro em     |
                   | tempo real         |
                   +--------------------+
                              |
                   6. Instrutora clica no dia
                              |
                   [GET /api/observations/:date/versions]
                              |
                   7. Retorna historico de versoes (CRDT)
                              |
                   8. Instrutora edita/valida
                              |
                   [PATCH /api/observations/:id]
                              |
                   9. Salva nova versao com vetor de clock
```

### 1.6 Diagrama de Bounded Contexts

```
+-------------------+     +-------------------+     +-------------------+
|  IDENTITY &       |     |  CYCLE TRACKING   |     |  INSTRUCTOR       |
|  ACCESS           |     |                   |     |  PORTAL           |
|                   |     |  - Observation    |     |                   |
|  - User           |     |  - Cycle          |     |  - Student        |
|  - Instructor     |     |  - DailyRecord    |     |  - ConsultSession |
|  - Auth           |     |  - CyclePattern   |     |  - ClinicalNote   |
|  - Subscription   |     |  - ApexEvent      |     |  - SharedReport   |
+-------------------+     +-------------------+     +-------------------+
         |                         |                         |
         +-------------------------+-------------------------+
                                   |
                    +-------------------+     +-------------------+
                    |  AI GUIDE         |     |  NOTIFICATIONS    |
                    |                   |     |                   |
                    |  - ChatSession    |     |  - DailyReminder  |
                    |  - Prompt         |     |  - InstructorAlert|
                    |  - SafetyGuard    |     |  - WhatsApp       |
                    +-------------------+     +-------------------+
```

---

## 2. Stack de Tecnologia

### ADR-001 — Frontend Mobile (Aluna)

**Status:** ACEITO  
**Data:** 2026-05-24  
**Decisao:** React 18 + Vite 5 como PWA instalavel

**Contexto:** O MVP atual ja e um PWA funcional com React 18 + Vite 5. A aluna precisa de uma experiencia nativa no smartphone (offline-first, instalavel via "Adicionar a tela inicial") sem custo de publicacao em App Store.

**Consequencias positivas:**
- Zero custo de distribuicao (sem App Store / Play Store)
- Atualizacoes instantaneas sem revisao de loja
- Base de codigo existente aproveitada integralmente
- Service Worker ja configurado via Vite PWA Plugin

**Consequencias negativas:**
- Notificacoes push dependem de suporte do browser (Safari iOS limitado ate iOS 16.4)
- Sem acesso a APIs nativas avancadas (Bluetooth, NFC)
- Experiencia de instalacao menos fluida que app nativo

**Alternativas rejeitadas:**
- React Native: custo adicional de build, complexidade de CI/CD, sem vantagem clara para o caso de uso
- Flutter: curva de aprendizado, re-escrever do zero

---

### ADR-002 — Backend API

**Status:** ACEITO  
**Data:** 2026-05-24  
**Decisao:** Node.js 22 LTS + Hono.js + TypeScript

**Contexto:** Time de 2 pessoas, necessidade de tipagem forte, baixa latencia para operacoes de leitura frequentes (dashboard da instrutora).

**Justificativa:**
- Hono.js: runtime-agnostico (Cloudflare Workers, Node, Bun), bundle minimo, validacao integrada com Zod
- TypeScript strict mode: previne erros de runtime em dados clinicos sensiveis
- Node.js 22 LTS: suporte garantido ate abril 2027

**Schema de dados principal (TypeScript):**

```typescript
// Observation — unidade basica de registro clinico
interface Observation {
  id: string;              // UUID v7
  userId: string;
  date: string;            // YYYY-MM-DD (imutavel apos criacao)
  stamp: 'sangramento' | 'seco' | 'muco' | 'apice';
  mucus: 'opaco' | 'cremoso' | 'transparente' | 'elastico' | null;
  bleeding: 'intenso' | 'moderado' | 'leve' | 'manchas' | null;
  relations: boolean;
  notes: string;
  vectorClock: Record<string, number>; // CRDT — ver ADR-004
  version: number;
  createdAt: string;       // ISO 8601
  updatedAt: string;
}

// Cycle — agrupa observacoes em um ciclo menstrual
interface Cycle {
  id: string;
  userId: string;
  startDate: string;
  endDate: string | null;
  apexDate: string | null;
  status: 'active' | 'archived';
  observations: Observation[];
}
```

---

### ADR-003 — Banco de Dados

**Status:** ACEITO  
**Data:** 2026-05-24  
**Decisao:** PostgreSQL 16 via Supabase (gerenciado)

**Justificativa:**
- Dados clinicos estruturados: PostgreSQL e superior a NoSQL para consultas analiticas (media de ciclos, padroes de apice)
- Supabase oferece: Auth pronto, Row Level Security (RLS), Realtime via WebSocket, Storage para PDFs
- RLS garante isolamento de dados por usuario sem codigo adicional no backend
- Custo zero no tier gratuito ate 500MB / 50.000 MAU

**Politicas RLS criticas:**

```sql
-- Aluna so ve seus proprios dados
CREATE POLICY "user_own_observations" ON observations
  FOR ALL USING (auth.uid() = user_id);

-- Instrutora ve dados das suas alunas
CREATE POLICY "instructor_sees_students" ON observations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM instructor_student_links
      WHERE instructor_id = auth.uid()
      AND student_id = observations.user_id
      AND status = 'active'
    )
  );

-- Instrutora pode editar observacoes (CRDT merge — ver ADR-004)
CREATE POLICY "instructor_can_edit_student_obs" ON observations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM instructor_student_links
      WHERE instructor_id = auth.uid()
      AND student_id = observations.user_id
      AND status = 'active'
    )
  );
```

---

### ADR-004 — Estrategia de Sincronizacao e Edicao de Registros Passados

**Status:** ACEITO (atualizado em D2)  
**Data:** 2026-05-24  
**Decisao:** Versioned Records com Vector Clock (CRDT simplificado) + Audit Log imutavel

**Contexto do problema (D2):**
A aluna pode editar registros de dias anteriores (ex.: esqueceu de registrar ontem). A instrutora tambem pode editar o mesmo registro (ex.: corrigir anotacao). Isso cria um cenario de escrita concorrente entre dois atores distintos sobre o mesmo dado clinico.

**Por que Last-Write-Wins (LWW) nao e suficiente:**
- LWW baseado em timestamp de servidor: silenciosamente descarta edits validas
- Em contexto clinico, perda silenciosa de dado e inaceitavel
- Sem rastreabilidade: impossivel auditar quem editou o que e quando

**Decisao adotada: Versioned Records + Vector Clock**

Abordagem mais simples e segura que CRDT completo (ex.: Automerge/Yjs), adequada para o volume de dados (1 registro/dia por usuario):

```typescript
// Vector Clock: { "userId": numero_de_operacoes }
// Exemplo: aluna tem userId "A", instrutora tem userId "I"
//
// Estado inicial (aluna salva):
//   vectorClock: { "A": 1 }
//
// Aluna edita novamente:
//   vectorClock: { "A": 2 }
//
// Instrutora edita em paralelo (sem ver a versao 2):
//   vectorClock: { "A": 1, "I": 1 }  <-- CONFLITO detectado
//
// Backend detecta conflito: { "A": 2 } vs { "A": 1, "I": 1 }
//   Nenhum vetor domina o outro -> conflito real
//   Backend salva AMBAS as versoes e notifica instrutora

interface ObservationVersion {
  id: string;
  observationId: string;
  vectorClock: Record<string, number>;
  data: Omit<Observation, 'id' | 'vectorClock' | 'version'>;
  authorId: string;
  authorRole: 'student' | 'instructor';
  createdAt: string;
  conflictResolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
}
```

**Fluxo de resolucao de conflito:**

```
1. Backend detecta conflito ao comparar vector clocks
2. Ambas as versoes sao salvas em observation_versions
3. Registro principal (observations) mantem ultima versao da instrutora
   (instrutora tem autoridade clinica)
4. Dashboard da instrutora exibe badge "Conflito detectado"
5. Instrutora visualiza diff lado a lado
6. Instrutora clica "Manter minha versao" ou "Manter versao da aluna"
7. Versao escolhida e marcada como resolvedBy, conflictResolved = true
8. Audit log imutavel registra toda a cadeia de decisoes
```

**Impacto na UI (D2 — clicar em um dia no grafico):**

```
Aluna clica no dia X no grafico horizontal:
  -> Abre modal de detalhes com:
     - Registro atual (stamp, muco, sangramento, relacoes, notas)
     - Botao "Editar" (somente se data <= hoje)
     - Historico de versoes (colapsavel): quem editou, quando
     - Se conflito pendente: banner amarelo "Aguardando resolucao da instrutora"

Instrutora clica no dia X no dashboard:
  -> Abre painel lateral com:
     - Registro atual
     - Historico de versoes com diff visual
     - Botao "Editar" 
     - Se conflito: interface de resolucao lado a lado
```

**Schema de banco:**

```sql
CREATE TABLE observation_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id UUID NOT NULL REFERENCES observations(id),
  vector_clock JSONB NOT NULL,
  data        JSONB NOT NULL,
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('student', 'instructor')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  conflict_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ
);

-- Indice para busca rapida por observacao
CREATE INDEX idx_obs_versions_obs_id ON observation_versions(observation_id);

-- Audit log imutavel (append-only, sem UPDATE/DELETE permitido)
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  action      TEXT NOT NULL,
  actor_id    UUID NOT NULL REFERENCES auth.users(id),
  actor_role  TEXT NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: audit_log e append-only — ninguem pode UPDATE ou DELETE
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_insert_only" ON audit_log FOR INSERT WITH CHECK (true);
-- Sem policy para UPDATE/DELETE = ninguem pode modificar
```

**Alternativas avaliadas e rejeitadas:**

| Alternativa | Motivo da rejeicao |
|---|---|
| Last-Write-Wins (LWW) | Perda silenciosa de dados clinicos — inaceitavel |
| CRDT completo (Automerge/Yjs) | Complexidade desnecessaria para 1 edit/dia/usuario. Overhead de biblioteca ~100KB |
| Event Sourcing puro | Over-engineering para o volume de dados. Complexidade de query para estado atual |
| Operational Transform (OT) | Complexidade de implementacao sem ganho real no caso de uso |

---

### ADR-005 — Autenticacao e Autorizacao

**Status:** ACEITO  
**Data:** 2026-05-24  
**Decisao:** Supabase Auth (JWT) + Row Level Security

**Roles:**
- `student` — aluna registrando seu proprio ciclo
- `instructor` — instrutora certificada CENPLAFAM/WOOMB
- `admin` — operacional interno (sem acesso a dados clinicos de usuarios)

**Fluxo de vinculacao aluna/instrutora:**

```
1. Aluna adiciona e-mail da instrutora no app (ja implementado em localStorage)
2. Backend cria registro em instructor_student_links (status: 'pending')
3. Instrutora recebe notificacao WhatsApp/email com link de aprovacao
4. Instrutora aprova -> status: 'active'
5. Instrutora passa a ver dados da aluna no dashboard
6. Aluna pode revogar a qualquer momento -> status: 'revoked'
```

---

### ADR-006 — Infraestrutura de Notificacoes

**Status:** ACEITO  
**Data:** 2026-05-24  
**Decisao:** Push Notifications via Web Push API + fallback WhatsApp (ver ADR-009)

**Tipos de notificacao:**
- Lembrete diario para aluna (21h) — Web Push
- Alerta para instrutora quando aluna registra Apice — WhatsApp + Web Push
- Conflito de versao para instrutora — dashboard badge + email
- Convite de vinculacao — email via Supabase + WhatsApp

---

### ADR-007 — Provedor de Cloud

**Status:** ACEITO  
**Data:** 2026-05-24  
**Decisao:** Vercel + Supabase (MVP e escala ate 1.000 usuarios); reavaliar Fly.io apos isso

#### Analise detalhada: Railway vs Fly.io vs AWS

**Criterios de avaliacao:** Custo no MVP (<50 usuarios), Custo na escala (1000+ usuarios), Facilidade de deploy, Suporte a PostgreSQL, Suporte a containers, Observabilidade, Compliance LGPD, Vendor lock-in.

---

**RAILWAY**

Descricao: PaaS orientado a developer experience. Deploy via GitHub push. PostgreSQL gerenciado incluido.

Preco MVP (<50 usuarios):
- Hobby Plan: USD 5/mes
- PostgreSQL: incluido (1GB storage)
- API Node.js: ~$2-3/mes (512MB RAM)
- Total estimado MVP: **USD 5-8/mes**

Preco escala (1000+ usuarios):
- Pro Plan: USD 20/mes base
- PostgreSQL 10GB: ~USD 20/mes
- API (2GB RAM, 2 replicas): ~USD 30/mes
- Redis: ~USD 10/mes
- Total estimado 1000 usuarios: **USD 60-80/mes**

Pros:
- Deploy em 2 minutos via GitHub integration
- PostgreSQL managed com backups automaticos
- Zero configuracao de networking
- Logs e metricas integradas (sem Datadog extra)
- Rollback em 1 clique
- Suporte a variaveis de ambiente criptografadas

Contras:
- Sem SLA formal no Hobby Plan (apenas no Team: 99.5%)
- Regioes limitadas (US East, EU West, AP Singapore) — sem regiao Brasil
- Latencia de ~150-200ms do Brasil para US East (aceitavel para o caso de uso)
- Vendor lock-in moderado: escape e possivel via Docker
- Sem certificacao SOC2 formal (em andamento em 2025)

Adequacao LGPD: MEDIA — dados em servidores fora do Brasil. Mitigavel com criptografia end-to-end de dados clinicos e clausula contratual de processamento. Supabase permite escolher regiao (Sao Paulo via AWS).

---

**FLY.IO**

Descricao: Plataforma de containers distribuida globalmente. Mais controle que Railway, mais simples que AWS.

Preco MVP (<50 usuarios):
- Free tier: 3 VMs shared, 3GB storage
- PostgreSQL via Fly Postgres (self-managed em VM): ~USD 3-5/mes
- Total estimado MVP: **USD 0-5/mes**

Preco escala (1000+ usuarios):
- VMs (2 shared-cpu-2x, 1GB RAM): ~USD 24/mes
- PostgreSQL dedicado: ~USD 30-40/mes
- Redis (Upstash): ~USD 10/mes
- Total estimado 1000 usuarios: **USD 65-80/mes**

Pros:
- Presenca global (Sao Paulo disponivel — sao-paulo regiao)
- Latencia minima para usuarios brasileiros
- Suporte nativo a Anycast (edge routing)
- Free tier generoso para MVP
- Docker nativo (sem vendor lock-in)
- Fly Postgres com replicas de leitura

Contras:
- Fly Postgres e self-managed (voce e responsavel por backups, upgrades)
- DX inferior ao Railway: curva de aprendizado com flyctl
- Suporte tecnico lento no free tier
- Banco de dados nao e um servico gerenciado de verdade — e uma VM com Postgres
- Outages historicos de reputacao mista (2022-2023)
- Sem dashboard de logs nativo — precisa de integracao externa

Adequacao LGPD: ALTA — dados podem residir em Sao Paulo (Fly tem regiao gru — Guarulhos via Edgecast)

---

**AWS**

Descricao: Provedor cloud enterprise. ECS/Fargate para containers, RDS para PostgreSQL, ElastiCache para Redis.

Preco MVP (<50 usuarios):
- ECS Fargate (0.25 vCPU, 512MB): ~USD 10/mes
- RDS PostgreSQL t3.micro: ~USD 15/mes (sem free tier apos 12 meses)
- ElastiCache t3.micro: ~USD 15/mes
- ALB: ~USD 18/mes
- Total estimado MVP: **USD 58-70/mes**

Preco escala (1000+ usuarios):
- ECS Fargate (1 vCPU, 2GB, 2 tasks): ~USD 60/mes
- RDS PostgreSQL t3.small Multi-AZ: ~USD 70/mes
- ElastiCache t3.small: ~USD 30/mes
- ALB + CloudFront: ~USD 20/mes
- Total estimado 1000 usuarios: **USD 180-220/mes**

Pros:
- SLA 99.99% em todos os servicos criticos
- Regiao sa-east-1 (Sao Paulo) — LGPD nativo
- Ecossistema maduro: CloudWatch, CloudTrail, WAF, Secrets Manager
- Certificacoes: SOC2, ISO 27001, PCI DSS
- Escalabilidade ilimitada
- AWS Cognito para autenticacao (alternativa ao Supabase Auth)

Contras:
- Custo inicial proibitivo para MVP de 2 pessoas
- Complexidade operacional extrema: IAM, VPC, Security Groups, etc.
- Tempo de setup: semanas, nao horas
- Curva de aprendizado acentuada
- Billing surpresa e comum (egress, NAT Gateway, etc.)
- Over-engineering severo para o estagio atual do produto

Adequacao LGPD: ALTA — sa-east-1 com todos os controles necessarios

---

**Tabela Comparativa Final:**

| Criterio | Railway | Fly.io | AWS |
|---|---|---|---|
| Custo MVP/mes | USD 5-8 | USD 0-5 | USD 58-70 |
| Custo 1000 users/mes | USD 60-80 | USD 65-80 | USD 180-220 |
| Tempo ate primeiro deploy | ~2h | ~6h | ~40h |
| DX (developer experience) | 10/10 | 7/10 | 5/10 |
| PostgreSQL gerenciado real | Sim | Nao (VM) | Sim (RDS) |
| Regiao Brasil | Nao (US East) | Sim (GRU) | Sim (sa-east-1) |
| LGPD compliance | Media | Alta | Alta |
| SLA formal | 99.5% (Team) | Sem SLA formal | 99.99% |
| Vendor lock-in | Baixo | Muito baixo | Alto |
| Escalabilidade | Media | Alta | Ilimitada |
| Adequacao para 2 devs | 10/10 | 7/10 | 3/10 |

**RECOMENDACAO FINAL — REVISADA (centralizacao maxima):**

**Stack: Vercel + Supabase + WhatsApp Cloud API (Meta oficial)**

O usuario questionou corretamente: se billings-web vai para o Vercel, por que nao centralizar tudo? A resposta e que e possivel e e a escolha certa para este estagio.

| Servico | Provider | Plano | Custo/mes |
|---|---|---|---|
| PWA (billings-mob) | Vercel | Free | USD 0 |
| Dashboard (billings-web) | Vercel | Free | USD 0 |
| REST API (CRUD) | Vercel Serverless Functions | Free (100GB-h/mes) | USD 0 |
| Claude Streaming (SSE) | Supabase Edge Functions | Free (500k invocations) | USD 0 |
| PostgreSQL + Auth + Realtime + Storage | Supabase | Free (500MB DB, 1GB storage) | USD 0 |
| Push Notifications | FCM (Firebase) | Free | USD 0 |
| WhatsApp | WhatsApp Cloud API (Meta oficial) | Free tier (1k conv/mes) | USD 0–8/mes |
| CI/CD | GitHub Actions | Free (2000min/mes) | USD 0 |
| **TOTAL MVP** | | | **~EUR 4/mes** |

**Por que nao GitHub Pages?**
GitHub Pages serve apenas arquivos estaticos — sem suporte a chamadas de backend, variaveis de ambiente em servidor, ou funcoes serverless. O Vercel faz tudo que o GitHub Pages faz, mais serverless functions, previews por PR e deploy automatico. Nao ha razao para usar GitHub Pages se o Vercel e gratuito e superior.

**Ponto de atencao critico — Claude Streaming no Vercel vs Supabase Edge:**
- Vercel Serverless (Hobby): timeout de 10s — INSUFICIENTE para streaming
- Vercel Serverless (Pro, USD 20/mes): timeout de 300s — suficiente
- Supabase Edge Functions: sem limite de timeout fixo, suporte nativo a streaming — IDEAL

Decisao: Claude streaming implementado em Supabase Edge Functions. Restante da API em Vercel Serverless (CRUD nao precisa de streaming).

**Escala (500+ usuarios ativos, Supabase free tier esgotado):**
- Supabase Pro: USD 25/mes (8GB DB, 100GB storage)
- Vercel Pro: USD 20/mes (se funcoes serverless excederem free tier)
- Estimativa custo total: USD 45-50/mes para ate 1000 usuarios

**Escala enterprise (5000+ usuarios):** Reavaliar para Fly.io (GRU) + Neon PostgreSQL (serverless, regiao sa-east-1). Nao relevante antes de 18 meses.

AVISO: Nao iniciar com AWS nem Railway. Vercel + Supabase entrega o mesmo resultado com zero overhead de operacoes e custo proximo de zero no MVP.

---

### ADR-008 — Ferramenta de Gerenciamento de Projeto

**Status:** ACEITO  
**Data:** 2026-05-24  
**Decisao:** GitHub Projects (desde o inicio — sem Linear)

#### Analise detalhada: Notion vs Linear vs GitHub Issues

**Contexto:** Time de 2 pessoas, desenvolvimento AI-driven (uso intenso de agentes para gerar codigo e documentacao), ciclos curtos de sprint (1-2 semanas), necessidade de rastreabilidade entre tarefas e commits.

---

**NOTION**

Descricao: All-in-one workspace (docs + banco de dados + kanban + wiki).

Preco: Free (ate 10 guests) / Plus USD 10/user/mes

Pros:
- Documentacao e tarefas no mesmo lugar
- Flexibilidade extrema: qualquer fluxo de trabalho
- AI Notion (geracao de specs, resumos)
- Wiki para documentacao do produto
- Bom para Product Discovery e ideacao

Contras:
- Sem integracao nativa com Git (sem link automatico commit -> tarefa)
- Performance ruim com muitos registros (banco de dados grande fica lento)
- Nao e uma ferramenta de engineering: falta cycle time, lead time, burndown
- Busca fraca comparada a Linear
- Sem automacoes de engenharia (ex.: fechar issue quando PR e merged)
- Overhead de manutencao: alguem precisa organizar a wiki constantemente

Adequacao para AI-driven dev: MEDIA — bom para documentar, ruim para rastrear velocidade de entrega

---

**GITHUB ISSUES**

Descricao: Rastreamento de issues integrado ao repositorio GitHub.

Preco: Gratis (incluido no GitHub Free/Pro)

Pros:
- Integracao nativa com commits, PRs e branches
- Zero custo adicional
- Fechamento automatico de issues via "Closes #123" no commit
- GitHub Projects (kanban) melhorou muito em 2024-2025
- Milestones para controle de releases
- Historico de decisoes vinculado ao codigo

Contras:
- UX inferior ao Linear para planning de sprints
- Sem cycle time / lead time nativos
- Sem roadmap visual (GitHub Projects Roadmap e basico)
- Configuracao manual de workflows
- Nao separa bem epics de tasks de bugs
- Sem campo de estimativa de esforco nativo
- Sem prioridade sofisticada (apenas labels manuais)

Adequacao para AI-driven dev: ALTA — Claude Code e GitHub Copilot se integram nativamente com GitHub Issues. Agentes conseguem criar, atualizar e fechar issues programaticamente.

---

**LINEAR**

Descricao: Ferramenta de gerenciamento de projetos de engenharia, construida para times de produto e tecnologia.

Preco: Free (ate 250 issues) / Standard USD 8/user/mes

Pros:
- UX excepcional: atalhos de teclado, velocidade, zero overhead
- Cycle time e lead time nativos com graficos automaticos
- Integracao Git: auto-close issues, branch naming, PR sync
- Sprints estruturados com burndown
- Roadmap visual por quarter
- Prioridades: Urgent/High/Medium/Low com SLA
- Estimativas de esforco (story points ou T-shirt sizing)
- Linear AI: geracao automatica de specs, resumo de issues, sub-tasks
- Webhooks robustos para automacao com agentes AI
- API GraphQL completa

Contras:
- Sem documentacao/wiki (precisa de Notion ou Confluence separado)
- USD 8/user/mes (nao e gratis)
- Para time de 2: USD 16/mes total (aceitavel)
- Curva de aprendizado inicial de ~1 hora

Adequacao para AI-driven dev: 10/10 — API GraphQL permite que agentes criem issues, atualizem status, criem branches e fechem ciclos de forma totalmente automatizada. Linear AI gera sub-tasks a partir de uma descricao de feature.

---

**Tabela Comparativa Final:**

| Criterio | Notion | GitHub Issues | Linear |
|---|---|---|---|
| Preco (2 users) | Gratis / USD 20/mes | Gratis | USD 0 / USD 16/mes |
| Git integration | Nenhuma | Nativa | Nativa + avancada |
| Sprint planning | Manual | Basico | Excelente |
| Cycle time / metrics | Nao | Nao | Sim (nativo) |
| AI features | Notion AI | Copilot | Linear AI |
| API para agentes | REST basico | GitHub API | GraphQL completa |
| Wiki/docs | Excelente | Nao | Nao |
| UX para engineering | Media | Boa | Excelente |
| Automacao (webhooks) | Media | Boa | Excelente |
| Roadmap visual | Boa | Basico | Excelente |

**RECOMENDACAO FINAL — REVISADA:**

**GitHub Projects desde o inicio. Sem Linear.**

Justificativa: Para um time de 2 pessoas com desenvolvimento AI-driven onde o codigo ja vive no GitHub, nao ha motivo para adicionar uma ferramenta externa. GitHub Projects oferece:

- Kanban e roadmap nativos, integrados ao repositorio
- Auto-close de issues via `Closes #123` no commit/PR
- API REST e GraphQL completa — Claude Code cria, atualiza e fecha issues programaticamente via `gh` CLI
- Labels para Bug / Feature / Security / Docs / Epic
- Milestones para controle de releases
- GitHub Projects Roadmap para visao trimestral
- Custo: USD 0 para sempre

O unico ponto fraco vs Linear e a ausencia de cycle time automatico e estimativas de esforco nativas. Para este projeto: irrelevante. O ritmo e determinado pela capacidade de revisao humana dos fundadores, nao por metricas de sprint.

**Limitacoes conhecidas e como contornar:**
| Limitacao GitHub Projects | Contorno |
|---|---|
| Sem cycle time nativo | `gh` CLI + script simples que calcula data abertura vs fechamento |
| Sem story points | Campo customizado "Esforco" (XS/S/M/L/XL) nos Projects |
| Sem sprint burndown | Milestone com data-alvo e issues fechadas como proxy |
| UX menos polida | Atalhos de teclado do GitHub Projects melhoraram em 2024-2025 |

Para documentacao tecnica: este proprio ARCHITECTURE.md + README.md no repositorio.

---

### ADR-009 — Integracao WhatsApp

**Status:** ACEITO — REVISADO  
**Data:** 2026-05-24  
**Decisao:** WhatsApp Cloud API (Meta oficial, gratuito ate 1.000 conversas/mes) + Mock Adapter em desenvolvimento

#### Analise detalhada: Evolution API vs Twilio WhatsApp Business API

**Contexto:** Dois casos de uso distintos:
1. Aluna compartilha grafico com instrutora (mensagem simples, iniciada pelo usuario)
2. Sistema envia notificacoes automaticas (lembrete diario, alerta de Apice)

---

**EVOLUTION API (self-hosted)**

Descricao: Wrapper open-source sobre WhatsApp Web (protocolo nao-oficial). Self-hosted, gratuito, sem aprovacao da Meta.

Preco:
- MVP: zero (rodando no Railway dentro do plano existente)
- Escala: custo de infra (RAM/CPU) ~USD 5-10/mes adicional no Railway
- Custo por mensagem: zero

Pros:
- Custo zero por mensagem — critico para lembretes diarios (50 usuarios = 50 msgs/dia = 1500/mes)
- Deploy em minutos com Docker no Railway
- API REST simples e bem documentada
- Suporte a: texto, imagens, PDFs, botoes interativos
- Sem processo de aprovacao com Meta
- Comunidade ativa (repositorio com 10k+ stars em 2025)
- Suporte a multiplas sessoes (varias instrutoras no mesmo servidor)

Contras:
- Baseado em WhatsApp Web nao-oficial: viola os Termos de Servico da Meta
- Risco de banimento do numero de telefone (Meta detecta automacao)
- Sem SLA: se a Meta atualiza o protocolo, o servico pode cair por horas/dias
- Requer numero de telefone dedicado (SIM card fisico ou numero virtual)
- Nao adequado para comunicacao critica de alta confiabilidade
- Sem suporte oficial em caso de falha
- LGPD: dados passam pelo servidor proprio (positivo — controle total)

Risco Meta ToS: ALTO. A Meta e agressiva no banimento de numeros que usam automacao nao-oficial. Numeros banidos perdem todo o historico de conversas. Em 2024-2025, a Meta aumentou a deteccao de bots via WhatsApp Web.

Mitigacao do risco:
- Usar numero dedicado exclusivamente para o sistema (nao numero pessoal)
- Limitar volume de mensagens (evitar spam patterns)
- Implementar delays aleatorios entre mensagens
- Manter fallback por email para notificacoes criticas

---

**TWILIO WHATSAPP BUSINESS API**

Descricao: Provedor oficial Meta Business Solution Provider (BSP). API REST com suporte oficial da Meta.

Preco:
- Registro da conta Meta Business: gratuito
- Twilio Sandbox: gratuito para desenvolvimento
- Producao (Meta fee): USD 0.005 a USD 0.15 por conversa (janela de 24h)
- Twilio markup: USD 0.005 adicional por mensagem
- Mensagens de template (notificacoes outbound): USD 0.015-0.05 cada

Calculo para 50 usuarios com lembrete diario (1 msg/dia):
- 50 msg/dia x 30 dias = 1500 mensagens/mes
- 1500 x USD 0.05 = **USD 75/mes** (se cada mensagem abre nova janela)
- Se usuarios interagem e a janela permanece aberta: custo drasticamente menor
- Estimativa realista: **USD 15-40/mes** (maioria das conversas em janela ativa)

Calculo para 1000 usuarios:
- Estimativa: **USD 300-600/mes** apenas em WhatsApp

Pros:
- Totalmente dentro dos Termos de Servico da Meta
- SLA de entrega garantido (99.9%)
- Sem risco de banimento de numero
- Suporte oficial 24/7
- Templates de mensagem pre-aprovados pela Meta
- Conformidade LGPD via Data Processing Agreement (DPA) com Twilio
- Numeros de telefone verificados (badge verde no WhatsApp)
- Webhooks confiaveis para eventos de leitura e resposta
- Suporte a WhatsApp Business features: catalogo, botoes, listas

Contras:
- Custo escala rapidamente com volume de usuarios
- Processo de aprovacao de templates leva 1-7 dias
- Estrutura de precos complexa (sessoes de 24h, templates, utility vs marketing)
- Requer conta Meta Business verificada (processo de dias a semanas)
- Mensagens de notificacao outbound precisam de template pre-aprovado
- Experiencia do desenvolvedor inferior ao Evolution API

---

**Tabela Comparativa Final:**

| Criterio | Evolution API | Twilio WhatsApp |
|---|---|---|
| Custo MVP (50 users) | USD 0/mes | USD 15-40/mes |
| Custo escala (1000 users) | USD 5-10/mes | USD 300-600/mes |
| Conformidade Meta ToS | Nao (risco alto) | Sim (oficial) |
| Risco de banimento | Alto | Zero |
| Tempo de setup | 2 horas | 1-3 semanas |
| SLA de entrega | Sem garantia | 99.9% |
| LGPD compliance | Alto (self-hosted) | Alto (DPA disponivel) |
| Templates outbound | Nao (qualquer msg) | Sim (aprovacao Meta) |
| Suporte tecnico | Comunidade | Oficial 24/7 |

**RECOMENDACAO FINAL — REVISADA:**

**Desenvolvimento/Testes: WhatsApp Mock Adapter**

Durante desenvolvimento, nenhuma chamada real ao WhatsApp. O adapter de mock:
- Loga mensagens no console e em arquivo de log local
- Expoe endpoint `/dev/whatsapp/inbox` para inspecionar mensagens enviadas
- Elimina necessidade de numero real ou conta Meta durante desenvolvimento
- Padrao Hexagonal: a logica de negocio nao sabe se esta falando com mock ou producao

```typescript
// Porta (interface) — nunca muda
interface WhatsAppPort {
  sendMessage(to: string, body: string): Promise<void>;
  sendDocument(to: string, url: string, filename: string): Promise<void>;
}

// Adapter de mock (desenvolvimento)
class WhatsAppMockAdapter implements WhatsAppPort {
  async sendMessage(to: string, body: string) {
    console.log(`[WhatsApp Mock] -> ${to}: ${body}`);
    // salva em arquivo para inspecao
  }
}

// Adapter real (producao)
class WhatsAppCloudAdapter implements WhatsAppPort {
  async sendMessage(to: string, body: string) {
    await fetch('https://graph.facebook.com/v18.0/.../messages', { ... });
  }
}
```

**Producao MVP (0-50 usuarios): WhatsApp Cloud API (Meta oficial)**

Custo:
- Primeiras 1.000 conversas/mes: **GRATUITO**
- 50 usuarios x 1 lembrete/dia x 30 dias = 1.500 conversas/mes
- 500 conversas excedentes x USD 0,015 (utility, Brasil) = **~USD 7,50/mes**
- Para <34 usuarios ativos/dia: **USD 0/mes** (dentro do free tier)

Vantagens vs Evolution API:
- API oficial Meta: zero risco de banimento de numero
- Sem VPS adicional (€4/mes a menos na infraestrutura)
- SLA de entrega garantido pela Meta
- Templates aprovados pela Meta (confiabilidade)
- Sem violacao de Termos de Servico

Setup necessario:
1. Conta Meta Business verificada (~1-3 dias)
2. Numero de telefone dedicado (pode ser virtual)
3. Aprovacao de templates de mensagem (~1-7 dias)
4. Chave de API no painel Meta for Developers

**Escala (500+ usuarios): reavaliar custo**
A 500 usuarios com 1 msg/dia = 15.000 conversas/mes = ~USD 210/mes em utility.
Neste ponto, avaliar Web Push como canal principal e WhatsApp apenas para mensagens criticas/iniciadas pelo usuario.

AVISO: Mensagem nao entregue sobre o Apice de uma aluna e um problema clinico, nao um bug. Web Push deve ser o canal primario de lembretes diarios; WhatsApp e reforco e canal de compartilhamento de relatorios.

---

### ADR-010 — Frontend Web (Instrutora — Dashboard)

**Status:** ACEITO (novo — impacto de D1)  
**Data:** 2026-05-24  
**Decisao:** React 18 + Vite 5 + TailwindCSS — repositorio separado (billings-web)

**Contexto (D1):** A instrutora tera acesso tanto ao aplicativo mobile (para acompanhar em consultas presenciais) quanto a um web dashboard otimizado para desktop/tablet.

**Por que repositorio separado e nao monorepo:**
- Builds independentes: deploy do dashboard da instrutora nao afeta o app da aluna
- Ciclos de release diferentes: dashboard evolui mais rapido (features B2B)
- Permissoes separadas: CI/CD da instrutora requer acesso a segredos de producao diferentes
- Time de 2 pessoas: complexidade de monorepo nao justificada neste estagio

**Stack do dashboard:**
- React 18 + Vite 5: consistencia com o app da aluna
- TailwindCSS: velocidade de desenvolvimento de UI desktop (substituindo estilos inline do app atual)
- React Query (TanStack Query): cache e sincronizacao de estado servidor
- Recharts: graficos de ciclo para visualizacao da instrutora
- Supabase Realtime: atualizacoes em tempo real quando aluna registra novo dado
- TypeScript strict: codigo compartilhado com o backend

**Diferencas de UX do dashboard vs app mobile:**
- Layout multi-coluna (sidebar + main + painel lateral)
- Visualizacao simultanea de multiplas alunas
- Grafico de ciclo em tela cheia com zoom
- Interface de resolucao de conflitos (ADR-004)
- Relatorio exportavel em PDF/CSV
- Busca e filtros por aluna, data, padrao de ciclo

**Hospedagem:**
- Vercel (tier gratuito) — mesmo provider do billings-mob (centralizacao maxima)
- Deploy automatico a cada push para main
- Preview deployments para cada PR
- Alinhado com ADR-007 (Vercel + Supabase como stack centralizado)

**Repositorio:** `billings-web` (criado em Sprint 0)

**Impacto no backend:**
- Endpoint adicional: `GET /api/instructor/students` — lista alunas da instrutora
- Endpoint adicional: `GET /api/instructor/students/:id/cycles` — ciclos de uma aluna especifica
- Endpoint adicional: `GET /api/instructor/students/:id/observations/:date/versions` — historico de versoes
- WebSocket: sala por instrutora com atualizacoes em tempo real das alunas
- Rate limiting separado para o dashboard (mais generoso que o mobile)

---

## 3. Bounded Contexts

### 3.1 Mapa de Contextos

```
+=======================+    vinculo      +=======================+
||  IDENTITY & ACCESS  ||<-------------->||  INSTRUCTOR PORTAL  ||
||                      ||               ||                      ||
||  User                ||               ||  InstructorProfile   ||
||  InstructorProfile   ||               ||  StudentList         ||
||  StudentLink         ||               ||  ConsultSession      ||
||  AuthToken           ||               ||  ClinicalNote        ||
||  Subscription        ||               ||  ConflictResolution  ||
+=======================+               +=======================+
            |                                       |
            | compartilha User.id                   | le Cycle
            |                                       |
+=======================+               +=======================+
||  CYCLE TRACKING     ||               ||  NOTIFICATIONS      ||
||                      ||               ||                      ||
||  Cycle               ||               ||  DailyReminder      ||
||  Observation         ||               ||  ApexAlert          ||
||  ObservationVersion  ||               ||  ConflictAlert      ||
||  CyclePattern        ||               ||  InviteNotification ||
||  ApexEvent           ||               ||  WhatsAppMessage    ||
||  AuditLog            ||               ||                      ||
+=======================+               +=======================+
            |
            | le Observation
            |
+=======================+
||  AI GUIDE           ||
||                      ||
||  ChatSession         ||
||  Prompt              ||
||  SafetyGuard         ||
||  ResponseCache       ||
||  UsageQuota          ||
+=======================+
```

### 3.2 Linguagem Ubiqua (Ubiquitous Language)

| Termo tecnico | Termo no dominio Billings | Definicao |
|---|---|---|
| Observation | Registro diario | Anotacao da aluna sobre o dia (selo + detalhes) |
| Stamp | Selo | Classificacao do dia: sangramento, seco, muco, apice |
| Apex | Apice | Ultimo dia de sensacao lubrificante (nao "pico") |
| BIP | PBI — Padrao Basico de Infertilidade | Padrao inalterado de 3+ ciclos consecutivos < 35 dias |
| Luteal phase | Fase Lutea | Periodo apos o Apice (a partir do 4o dia) |
| Instructor | Instrutora | Certificada CENPLAFAM/WOOMB — unica com autoridade de interpretacao clinica |
| Student | Aluna | Usuario que registra seu proprio ciclo |
| Cycle | Ciclo | Periodo de sangramento ate o dia anterior ao proximo sangramento |
| Conflict | Conflito de versao | Edicao concorrente de aluna e instrutora no mesmo registro |
| Clinical interpretation | Interpretacao clinica | EXCLUSIVO da instrutora — NUNCA do sistema |

### 3.3 Regras de Dominio Inviolaveis

```typescript
// REGRA 1: Sistema nunca classifica dia como fertil ou infertil
function classifyDay(obs: Observation): DayClassification {
  // Retorna apenas: sangramento | seco | muco | apice
  // NUNCA: 'fertil' | 'infertil' | 'seguro' | 'inseguro'
  throw new Error('ClassificationIsInstructorExclusive');
}

// REGRA 2: Edicao de registros passados gera nova versao, nunca sobrescreve
async function editObservation(id: string, data: Partial<Observation>, actorId: string) {
  const current = await getObservation(id);
  const newVersion = incrementVectorClock(current.vectorClock, actorId);
  
  // Sempre salva versao anterior antes de atualizar
  await saveObservationVersion(current);
  
  // Detecta e registra conflito se necessario
  const conflict = detectConflict(current.vectorClock, newVersion);
  if (conflict) await createConflictRecord(id, actorId);
  
  return updateObservation(id, { ...data, vectorClock: newVersion });
}

// REGRA 3: Registros passados so podem ser editados por aluna ou instrutora vinculada
function canEditObservation(actor: User, observation: Observation): boolean {
  if (actor.id === observation.userId) return true; // propria aluna
  if (actor.role === 'instructor') {
    return isLinked(actor.id, observation.userId); // instrutora vinculada
  }
  return false;
}
```

---

## 4. Catalogo de Agentes

O pipeline de desenvolvimento do Billings Grafico segue 9 estagios, cada um com 3 agentes especializados (Specialist, Worker, Reviewer) e um Orchestrator global.

### Orchestrator Global

```json
{
  "agent": "Orchestrator",
  "role": "Roteador de tarefas entre estagios. Valida que cada estagio foi aprovado pelo Reviewer antes de avancar.",
  "inputs": ["structured_task_request"],
  "outputs": ["stage_assignment", "blocking_issues_list", "audit_trail_entry"],
  "quality_gate": "Reviewer retornou confidence_score >= 0.85 e blocking_issues = []",
  "tools": ["github_api", "github_api", "slack_webhook"],
  "protocol": "JSON structured — ver Secao 6"
}
```

---

### Estagio 1 — Validacao de Ideia e Caso de Negocio

**Specialist Agent — Business Strategist**
- Papel: Aplica frameworks Hormozi (Value Equation, Grand Slam Offer), analisa mercado, concorrencia, TAM/SAM/SOM
- Inputs: Descricao da ideia, publico-alvo, problema a resolver
- Outputs: Market research report, Value Equation score, GO/NO-GO decision
- MCP Servers: web_search, perplexity_api, google_trends
- Skills: `hormozi_value_equation`, `tam_sam_som_calculator`, `competitor_analysis`, `customer_avatar_builder`

**Worker Agent — Research Analyst**
- Papel: Executa pesquisas de mercado, coleta dados de concorrentes, valida premissas de preco
- Inputs: Research brief do Specialist
- Outputs: Competitor matrix, pricing benchmarks, customer interview transcripts (simulados)
- MCP Servers: web_search, google_trends, crunchbase_api
- Skills: `market_size_research`, `pricing_benchmark`, `icp_validation`

**Reviewer Agent — Investment Analyst**
- Papel: Valida a solidez do caso de negocio. Aplica filtros criticos: margem, CAC, LTV, time-to-revenue
- Inputs: Research report + Value Equation do Worker
- Outputs: GO/NO-GO com confidence_score, lista de premissas invalidas, recomendacoes
- Quality Gate: confidence_score >= 0.75 para GO. Qualquer premissa critica invalida = NO-GO automatico
- MCP Servers: nenhum externo (analise logica pura)
- Skills: `ltv_cac_ratio_check`, `assumption_validator`, `go_nogo_decision_maker`

**Aplicacao ao Billings Grafico (Hormozi):**

Value Equation Score:
- Dream Outcome (10/10): Mulher aprende a conhecer seu proprio ciclo, controla naturalmente a fertilidade
- Perceived Likelihood (8/10): App clinico + instrutora certificada = credibilidade alta
- Time Delay (9/10): Resultados em 1 ciclo (28 dias)
- Effort & Sacrifice (9/10): 2 minutos por dia de registro

Score = (10 x 8) / (inversao: 1 + 1) = altissimo. Produto GO.

Grand Slam Offer (para instrutoras — canal B2B):
- Produto base: Dashboard de gestao de alunas (substituindo planilhas)
- Bonus 1: Notificacao automatica quando aluna registra Apice
- Bonus 2: Exportacao de grafico PDF formato CENPLAFAM com 1 clique
- Bonus 3: Historico de ciclos dos ultimos 12 meses por aluna
- Garantia: Primeiros 30 dias gratis, cancela sem perguntas
- Preco: R$ 49/mes por instrutora (ate 20 alunas) / R$ 99/mes ilimitado

**Handoff Protocol:**
```json
{
  "stage": 1,
  "status": "GO",
  "confidence_score": 0.91,
  "blocking_issues": [],
  "outputs": {
    "tam": "R$ 180M (mercado de saude feminina natural Brasil)",
    "sam": "R$ 12M (instrutoras CENPLAFAM ativas)",
    "som_12m": "R$ 240K (200 instrutoras x R$ 99/mes x 12)",
    "go_nogo": "GO",
    "reasoning": "Mercado de nicho com alta fidelizacao, CAC baixo (boca-a-boca em comunidades MOB), LTV alto (instrutoras renovam por anos), sem concorrente direto com dashboard digital no Brasil"
  },
  "next_stage": 2
}
```

---

### Estagio 2 — Product Discovery e Requisitos

**Specialist Agent — Product Manager**
- Papel: Define User Stories, Acceptance Criteria, prioriza backlog (MoSCoW), define MVP scope
- Inputs: GO decision do Estagio 1, descricao do produto existente
- Outputs: Product Requirements Document (PRD), User Story Map, Definition of Ready
- MCP Servers: github_api (criar issues), notion_api (documentar)
- Skills: `user_story_writer`, `moscow_prioritization`, `acceptance_criteria_generator`, `mvp_scope_definer`

**Worker Agent — UX Researcher**
- Papel: Cria personas, mapas de jornada, wireframes textuais, valida fluxos com instrutoras reais
- Inputs: PRD do Specialist
- Outputs: Personas documentadas, Journey maps, Wireframes (textual/Figma links)
- MCP Servers: figma_api, calendly_api (agendar entrevistas)
- Skills: `persona_builder`, `journey_mapper`, `wireframe_describer`, `interview_guide_generator`

**Reviewer Agent — Stakeholder Proxy**
- Papel: Valida se os requisitos refletem as necessidades reais das alunas e instrutoras. Detecta features desnecessarias no MVP.
- Inputs: PRD + wireframes
- Outputs: Aprovacao ou lista de requisitos invalidos/ausentes
- Quality Gate: Todas as User Stories tem Acceptance Criteria testavel. Nenhuma story de MVP depende de feature ausente.
- Skills: `requirement_completeness_check`, `dependency_validator`, `scope_creep_detector`

**User Stories Criticas (ja validadas):**

```
Como aluna, quero registrar minha observacao diaria em menos de 2 minutos
para manter o habito sem interrupcao na rotina.
  AC: Tela principal abre diretamente no formulario de hoje
  AC: Selecao de selo em 1 toque (4 opcoes visiveis)
  AC: Salvar em 1 toque apos selecionar selo
  AC: Confirmacao visual imediata (banner verde)

Como aluna, quero editar um registro de um dia anterior
para corrigir um erro de anotacao.
  AC: Clico em qualquer dia no grafico para ver detalhes
  AC: Botao "Editar" disponivel para qualquer dia do ciclo atual e historico
  AC: Edicao salva nova versao sem apagar a anterior
  AC: Historico de versoes visivel (colapsavel)
  AC: Se conflito com instrutora: banner informativo "Aguardando resolucao"

Como instrutora, quero ver os registros de todas as minhas alunas em um dashboard
para acompanhar o progresso sem precisar pedir screenshots via WhatsApp.
  AC: Lista de alunas com status: "registrou hoje", "nao registrou ha X dias", "Apice registrado"
  AC: Clico na aluna para ver grafico completo do ciclo atual
  AC: Recebo notificacao quando aluna registra Apice
  AC: Posso exportar grafico em PDF formato CENPLAFAM com 1 clique

Como instrutora, quero resolver conflitos de edicao
para garantir que o registro clinico esta correto.
  AC: Recebo alerta quando ha conflito de versao
  AC: Visualizo diff lado a lado (minha versao vs versao da aluna)
  AC: Clico em "Manter minha versao" ou "Manter versao da aluna"
  AC: Decisao fica registrada no audit log com timestamp e meu usuario
```

---

### Estagio 3 — Arquitetura e Design Tecnico

**Specialist Agent — Software Architect**
- Papel: Define ADRs, bounded contexts, contratos de API, schema de banco, estrategia de sincronizacao
- Inputs: PRD aprovado, constraints tecnicas, respostas do arquiteto humano
- Outputs: ARCHITECTURE.md (este documento), ADRs, OpenAPI spec, Schema SQL
- MCP Servers: github_api (criar ADRs), mermaid_renderer
- Skills: `adr_generator`, `openapi_spec_writer`, `schema_designer`, `dependency_graph_analyzer`

**Worker Agent — Technical Writer**
- Papel: Documenta as decisoes arquiteturais em formato legivel, gera diagrams, cria runbooks
- Inputs: Decisoes do Architect Specialist
- Outputs: Diagramas texto/ASCII, README tecnico, runbooks de deploy
- MCP Servers: github_api
- Skills: `diagram_generator`, `runbook_writer`, `changelog_generator`

**Reviewer Agent — Security Architect**
- Papel: Revisa todas as decisoes de arquitetura sob a lente de seguranca e LGPD. Identifica surface attack areas.
- Inputs: ARCHITECTURE.md draft
- Outputs: Lista de violacoes de seguranca, recomendacoes OWASP, aprovacao ou bloqueio
- Quality Gate: Zero violacoes OWASP Top 10. LGPD compliance documentada. RLS validada em todos os modelos de dados.
- Skills: `owasp_top10_checker`, `lgpd_compliance_validator`, `threat_model_generator`, `rls_policy_reviewer`

---

### Estagio 4 — Desenvolvimento

**Specialist Agent — Tech Lead**
- Papel: Define padrao de codigo, revisa PRs criticos, unblocks o Worker. Define Performance Budget.
- Inputs: ARCHITECTURE.md, User Stories priorizadas
- Outputs: Coding standards doc, PR review comments, Performance budget baseline
- MCP Servers: github_api
- Skills: `coding_standards_enforcer`, `performance_budget_definer`, `pr_reviewer`

**Worker Agent — Full-Stack Developer (Claude Code)**
- Papel: Implementa features seguindo TDD (Red/Green/Refactor), Clean Architecture, DDD
- Inputs: User Story + Acceptance Criteria + ADRs relevantes
- Outputs: Codigo TypeScript/React testado, testes unitarios/integracao, PR com descricao estruturada
- MCP Servers: github_api, supabase_api
- Skills: `tdd_cycle_executor`, `react_component_builder`, `api_endpoint_builder`, `sql_migration_writer`, `test_writer`

**Performance Budget (definido antes do desenvolvimento):**
- First Contentful Paint (FCP): < 1.5s em 4G
- Time to Interactive (TTI): < 3s em 4G
- Bundle size (JavaScript): < 200KB gzipped
- Lighthouse PWA score: >= 90
- API response time (p95): < 300ms
- API response time (p99): < 1000ms

**TDD Cycle para cada feature:**
```
1. RED: Escreve o teste que falha
   - Unitario: comportamento da funcao/componente
   - Integracao: contrato de endpoint
   - E2E: fluxo critico do usuario

2. GREEN: Escreve o minimo de codigo para passar o teste

3. REFACTOR: Melhora o codigo sem quebrar testes
   - Extrai funcoes puras
   - Aplica principios Clean Code
   - Garante < 10 linhas por funcao (orientacao, nao regra rigida)
```

**Reviewer Agent — Code Reviewer**
- Papel: Revisa codigo gerado antes do merge. Categorias de violacao explicitas.
- Inputs: PR diff + testes
- Outputs: Aprovacao ou lista categorizada de violacoes
- Quality Gate: Zero violacoes criticas ou altas. Cobertura de testes >= 80%.

**Categorias de Violacao:**
```
CRITICA (bloqueia merge):
  - SQL injection ou XSS presente
  - Dados clinicos sem autenticacao
  - Secret hardcoded no codigo
  - Ausencia de validacao de input em endpoint publico
  - Dados de uma aluna acessiveis por outra sem vinculo

ALTA (bloqueia merge, pode ser corrigida no mesmo PR):
  - Funcao > 50 linhas sem justificativa
  - Ausencia de tratamento de erro em operacoes criticas
  - Cobertura de testes < 80% em modulo novo
  - any no TypeScript em codigo de dominio
  - Mutacao de estado direto (sem imutabilidade)

MEDIA (nao bloqueia, mas cria issue de tech debt):
  - Comentario desatualizado
  - Nomenclatura inconsistente com Ubiquitous Language
  - Duplicacao de logica (> 3 ocorrencias)

BAIXA (sugestao):
  - Oportunidade de extrair componente reutilizavel
  - Otimizacao de query desnecessaria para o volume atual
```

---

### Estagio 5 — Revisao de Seguranca (DevSecOps)

**Specialist Agent — CISO (Chief Information Security Officer)**
- Papel: Define politica de seguranca, threat model, SLA de vulnerabilidades, plano de resposta a incidentes
- Inputs: ARCHITECTURE.md, lista de endpoints, modelos de dados
- Outputs: Security policy doc, Threat model (STRIDE), Vulnerability SLA definition
- MCP Servers: nenhum (analise estrategica)
- Skills: `stride_threat_modeler`, `vulnerability_sla_definer`, `incident_response_planner`

**Worker Agent — Security Scanner**
- Papel: Executa SAST, DAST, dependency scanning, secret scanning automaticamente no CI/CD
- Inputs: Codigo-fonte, lista de endpoints
- Outputs: Relatorio de vulnerabilidades com CVSS score, recomendacoes de correcao
- MCP Servers: github_api (GitHub Advanced Security), snyk_api
- Skills: `sast_executor`, `dast_scanner`, `dependency_audit`, `secret_scanner`

**Ferramentas de seguranca no CI/CD:**
```yaml
# .github/workflows/security.yml
jobs:
  security:
    steps:
      - name: Dependency audit
        run: npm audit --audit-level=high
      
      - name: Secret scanning
        uses: trufflesecurity/trufflehog@main
      
      - name: SAST
        uses: github/codeql-action/analyze@v3
        with:
          languages: javascript, typescript
      
      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
```

**OWASP Top 10 — Status por categoria:**

| OWASP Item | Controle Implementado |
|---|---|
| A01 Broken Access Control | RLS no Supabase + middleware de autorizacao |
| A02 Cryptographic Failures | HTTPS obrigatorio, dados em repouso criptografados (Supabase), senhas via Supabase Auth (bcrypt) |
| A03 Injection | Queries parametrizadas (Supabase SDK), validacao Zod em todos os inputs |
| A04 Insecure Design | ADR-004 (sem LWW em dados clinicos), ADR-003 (RLS), threat model STRIDE |
| A05 Security Misconfiguration | Infrastructure as Code, secrets no Vercel + Supabase (nunca no codigo) |
| A06 Vulnerable Components | npm audit no CI, Snyk, Dependabot habilitado |
| A07 Auth Failures | Supabase Auth (JWT com rotacao), refresh tokens com validade |
| A08 Software Integrity | Assinatura de commits, lockfile commitado, CI verifica integridade |
| A09 Logging Failures | Audit log imutavel (ADR-004), logs estruturados via Vercel + Sentry |
| A10 SSRF | Validacao de URLs externas, allowlist de dominios para integracao WhatsApp |

**Reviewer Agent — Penetration Tester**
- Papel: Valida as correcoes de seguranca, executa testes manuais em endpoints criticos
- Inputs: Relatorio do Security Scanner + codigo corrigido
- Outputs: Aprovacao de seguranca ou remanescencia de vulnerabilidades
- Quality Gate: Zero vulnerabilidades CVSS >= 7.0. Zero dados clinicos acessiveis sem autenticacao.
- Skills: `manual_pentest_checklist`, `api_fuzzer`, `auth_bypass_checker`

---

### Estagio 6 — Garantia de Qualidade e Testes

**Specialist Agent — QA Lead**
- Papel: Define estrategia de testes, piramide de testes, criterios de aceitacao de qualidade
- Inputs: User Stories, Acceptance Criteria, ARCHITECTURE.md
- Outputs: Test plan, test matrix, piramide de testes definida
- MCP Servers: github_api
- Skills: `test_strategy_planner`, `test_matrix_generator`, `quality_metrics_definer`

**Piramide de Testes:**
```
        /\
       /E2E\        5% — Playwright: fluxos criticos do usuario
      /------\
     /  Integ  \    25% — Vitest + Supabase local: endpoints e banco
    /----------\
   /   Unitario  \  70% — Vitest: funcoes puras, componentes, utils
  /--------------\
```

**Worker Agent — QA Automation Engineer**
- Papel: Escreve e mantem testes automatizados em todos os niveis da piramide
- Inputs: Test plan + codigo da feature
- Outputs: Testes rodando no CI, relatorio de cobertura, relatorio de falhas
- MCP Servers: github_api
- Skills: `unit_test_writer`, `integration_test_writer`, `e2e_test_writer`, `coverage_reporter`

**Testes E2E criticos (Playwright):**
```typescript
// test/e2e/observation.spec.ts
test('aluna registra observacao de dia anterior', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="tab-grafico"]');
  await page.click('[data-testid="day-cell-yesterday"]');
  await expect(page.locator('[data-testid="day-detail-modal"]')).toBeVisible();
  await page.click('[data-testid="edit-observation-btn"]');
  await page.click('[data-testid="stamp-muco"]');
  await page.click('[data-testid="mucus-cremoso"]');
  await page.click('[data-testid="save-observation-btn"]');
  await expect(page.locator('[data-testid="version-saved-badge"]')).toBeVisible();
  await expect(page.locator('[data-testid="version-history"]')).toContainText('Versao 2');
});

test('instrutora ve conflito e resolve', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('[data-testid="conflict-badge"]')).toBeVisible();
  await page.click('[data-testid="conflict-badge"]');
  await expect(page.locator('[data-testid="conflict-resolver"]')).toBeVisible();
  await page.click('[data-testid="keep-instructor-version"]');
  await expect(page.locator('[data-testid="conflict-resolved-badge"]')).toBeVisible();
});
```

**Reviewer Agent — QA Gatekeeper**
- Papel: Valida que a cobertura esta adequada e que os testes realmente testam o comportamento (nao apenas passam)
- Inputs: Relatorio de cobertura + codigo de testes
- Outputs: Aprovacao ou lista de gaps de cobertura
- Quality Gate: Cobertura >= 80% global. Cobertura >= 95% em modulos de dominio. Zero testes com assercoes vazias.
- Skills: `coverage_gap_analyzer`, `test_quality_checker`, `mutation_testing_executor`

---

### Estagio 7 — CI/CD e Deploy

**Specialist Agent — DevOps Engineer**
- Papel: Define pipeline de CI/CD, estrategia de branching, politica de releases, rollback procedures
- Inputs: ARCHITECTURE.md, stack definida
- Outputs: CI/CD pipeline config, branching strategy doc, runbook de deploy e rollback
- MCP Servers: github_api, railway_api
- Skills: `cicd_pipeline_designer`, `branching_strategy_definer`, `rollback_procedure_writer`

**Estrategia de Branching:**

Ambos os repositorios (`billings-mob` e `billings-web`) possuem apenas
as branches `main` (default, protegida) e `develop`. A branch `master`
foi removida do `billings-mob` em 2026-05-26 para eliminar ambiguidade.

```
main (producao — protegida, default)
  |
  +-- develop (integracao continua)
       |
       +-- feature/obs-edit-past-days  (branches de feature)
       +-- fix/conflict-badge-display
       +-- chore/upgrade-dependencies
```

**Regras de protecao do main:**
- Requer PR aprovado por pelo menos 1 reviewer (ou Reviewer Agent)
- Requer CI verde (lint, testes, security scan)
- Requer cobertura de testes >= 80%
- Sem force push
- Sem merge direto (apenas via PR)

**Pipeline CI/CD completo:**
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test:unit -- --coverage
      - run: npm run test:integration
      - name: Upload coverage
        uses: codecov/codecov-action@v4

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high
      - uses: trufflesecurity/trufflehog@main
        with:
          # Fix para BASE==HEAD em push direto para main
          base: >
            ${{ github.event_name == 'push'
                && github.event.before
                || github.event.repository.default_branch }}
      - uses: github/codeql-action/analyze@v3

  build:
    needs: [quality, security]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: npm run build:size-check  # verifica performance budget
      - name: Validate base path
        # Falha se dist/index.html referenciar assets em sub-path
        # (ex: /billings-mob/assets/) — previne blank-page deploy no Vercel
        run: |
          if grep -r '/billings-mob/assets/' dist/index.html; then
            echo "ERRO: base path incorreto detectado em dist/"
            exit 1
          fi
      - name: Scan build output for secrets (LGPD)
        # Falha se encontrar padroes de segredos no artefato de build
        run: |
          if grep -rE \
            'ANTHROPIC|service_role|JWT_SECRET|WHATSAPP_API_TOKEN' \
            dist/; then
            echo "ERRO: segredo detectado no artefato de build"
            exit 1
          fi
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist/ }

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Vercel staging
        run: vercel deploy --env staging --token ${{ secrets.VERCEL_TOKEN }}

  e2e:
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright test --project=chromium

  deploy-production:
    needs: e2e
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to Vercel production
        run: vercel deploy --prod --token ${{ secrets.VERCEL_TOKEN }}
      - name: Notify GitHub Issue
        run: |
          gh issue comment ${{ env.ISSUE_NUMBER }} \
            --body "Deployed to production: ${{ github.sha }}"
```

**Pipeline de deploy implementado (deploy.yml — igual em ambos os repos):**

O workflow de deploy e acionado pelo evento `workflow_run` — so executa
apos o CI (workflow "CI") ser concluido com sucesso na branch `main`.
Isso garante que nenhum commit com CI quebrado chega a producao.

```yaml
# .github/workflows/deploy.yml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]

jobs:
  deploy-production:
    if: >
      ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: "${{ github.event.workflow_run.head_sha }}"
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci --legacy-peer-deps
      - run: npm install --global vercel@latest
      - run: >
          vercel deploy --prod
          --token "$VERCEL_TOKEN"
          --scope "$VERCEL_ORG_ID"
          --yes
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

**Licao aprendida:** nao usar `amondnet/vercel-action`. Tokens OAuth
com escopo de equipe (prefixo `vca_`) sao rejeitados pelo CLI Vercel v50.
A solucao correta e invocar `vercel deploy` diretamente, passando
`VERCEL_TOKEN`, `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` via env vars.

**Correcao de configuracao aplicada (billings-mob/vite.config.js):**

O campo `base` estava definido como `'/billings-mob/'` (legado de um
deploy anterior em GitHub Pages). Esse valor causava blank-page no Vercel
porque os assets eram referenciados com sub-path inexistente. Corrigido
para `base: '/'`.

O `billings-web` nunca teve sub-path configurado (valor ja estava correto).

**Worker Agent — Release Manager**
- Papel: Executa o deploy, monitora a saude pos-deploy, aciona rollback se necessario
- Inputs: Build aprovado + pipeline config
- Outputs: Deploy completo, relatorio de saude pos-deploy, changelog gerado
- MCP Servers: vercel_api, github_api, supabase_api
- Skills: `deploy_executor`, `health_check_runner`, `rollback_trigger`, `changelog_generator`

**Reviewer Agent — Deployment Gatekeeper**
- Papel: Valida que o deploy em producao esta saudavel. Define criterios de sucesso do deploy.
- Quality Gate: Todos os health checks passando. Taxa de erro < 0.1%. Latencia p99 < 1000ms. Zero alertas criticos nos primeiros 15 minutos.
- Skills: `health_check_validator`, `error_rate_monitor`, `performance_regression_detector`

---

### Estagio 8 — Monitoramento e Observabilidade

**Specialist Agent — SRE (Site Reliability Engineer)**
- Papel: Define SLOs/SLAs, alertas, dashboards, runbooks de incidente
- Inputs: ARCHITECTURE.md, SLA definidos no Estagio 3
- Outputs: SLO definitions, alert rules, incident runbooks
- MCP Servers: railway_api (logs), uptime_robot_api
- Skills: `slo_definer`, `alert_rule_writer`, `incident_runbook_creator`

**SLOs definidos:**
| SLO | Target | Janela |
|---|---|---|
| API Availability | 99.5% | 30 dias |
| API Latency p95 | < 300ms | 1 hora |
| API Error Rate | < 0.5% | 1 hora |
| Data Loss | Zero | Sempre |
| PWA Load Time (FCP) | < 1.5s (4G) | Por release |

**Worker Agent — Observability Engineer**
- Papel: Implementa instrumentacao, dashboards, alertas, tracing
- Inputs: SLO definitions + stack definida
- Outputs: Dashboard configurado, alertas ativos, logs estruturados implementados
- MCP Servers: vercel_api, uptime_robot_api, sentry_api
- Skills: `structured_logging_implementer`, `alert_configurator`, `dashboard_builder`

**Stack de Observabilidade:**
```
Logs estruturados: Vercel Logs (built-in) + Supabase Logs + Sentry (erros frontend/backend)
Uptime monitoring: UptimeRobot (gratuito, 5min intervals)
Error tracking: Sentry.io (tier gratuito: 5000 erros/mes)
Performance: Sentry Performance (Core Web Vitals automaticos)
Alertas: UptimeRobot (email/SMS) + Sentry Alerts (Slack/email)
```

**Logs estruturados (formato JSON):**
```json
{
  "timestamp": "2026-05-24T15:30:00Z",
  "level": "info",
  "service": "billings-api",
  "request_id": "req_01j...",
  "user_id": "usr_01j...",
  "user_role": "student",
  "action": "observation.created",
  "date": "2026-05-24",
  "duration_ms": 145,
  "status": 201
}
```

AVISO: `relations` (relacoes intimas) NUNCA deve aparecer em logs. Dado altamente sensivel.

**Reviewer Agent — Reliability Reviewer**
- Papel: Valida que os alertas estao calibrados (sem alert fatigue), que os runbooks cobrem os cenarios de falha mais provaveis, que a observabilidade e suficiente para debug em producao
- Quality Gate: SLOs documentados e monitorados. Runbook para cada alerta critico. MTTR (Mean Time to Recover) estimado < 30 minutos para incidentes de nivel 1.
- Skills: `alert_calibration_reviewer`, `runbook_completeness_checker`, `slo_compliance_validator`

---

### Estagio 9 — Suporte, Manutencao e Melhoria Continua

**Specialist Agent — Customer Success Manager**
- Papel: Define SLA de suporte, processo de escalada, canais de atendimento, NPS tracking
- Inputs: Feedback de alunas e instrutoras, metricas de uso
- Outputs: Support policy doc, escalation matrix, NPS questionnaire
- MCP Servers: crisp_api (suporte in-app), github_api
- Skills: `support_policy_writer`, `nps_analyzer`, `escalation_matrix_builder`

**Worker Agent — Support Engineer**
- Papel: Triagem de bugs, resposta a usuarios, criacao de issues no GitHub Projects, hotfixes
- Inputs: Bug reports, feedback de usuarios, alertas de producao
- Outputs: Issues criados e priorizados, hotfixes merged, resposta ao usuario
- MCP Servers: github_api, crisp_api
- Skills: `bug_triager`, `hotfix_creator`, `user_communication_writer`

**Reviewer Agent — Continuous Improvement Lead**
- Papel: Analisa metricas de produto, identifica oportunidades de melhoria, prioriza backlog de melhoria
- Inputs: NPS, metricas de uso, bugs, feedback
- Outputs: Backlog priorizado, retrospectiva do sprint, proposta de melhoria
- Quality Gate: NPS >= 50. Bugs criticos resolvidos em < 24h. Bugs altos resolvidos em < 72h.
- Skills: `product_metrics_analyzer`, `backlog_groomer`, `sprint_retrospective_facilitator`

---

## 5. Skills Library

Skills sao modulos de prompt reutilizaveis que cortam multiplos estagios. Cada skill e uma funcao com input/output estruturado.

### 5.1 Catalogo de Skills

| Skill ID | Nome | Estagios que usa | Input | Output |
|---|---|---|---|---|
| SK-001 | `hormozi_value_equation` | 1, 7 | Descricao do produto | Value Equation Score (0-10) com breakdown |
| SK-002 | `adr_generator` | 3 | Problema + opcoes + contexto | ADR completo em markdown |
| SK-003 | `user_story_writer` | 2 | Feature description + persona | User Story + Acceptance Criteria |
| SK-004 | `tdd_cycle_executor` | 4 | User Story + AC | Red test → Green code → Refactored code |
| SK-005 | `owasp_top10_checker` | 3, 5 | Codigo ou design | Lista de violacoes por categoria OWASP |
| SK-006 | `openapi_spec_writer` | 3 | Endpoint description | OpenAPI 3.1 YAML spec |
| SK-007 | `sql_migration_writer` | 4 | Schema changes | SQL migration com up/down |
| SK-008 | `go_nogo_decision_maker` | 1 | Market data + Value Equation | GO/NO-GO com confidence score e reasoning |
| SK-009 | `lgpd_compliance_validator` | 3, 5 | Fluxo de dados + modelos | Lista de violacoes LGPD + recomendacoes |
| SK-010 | `conflict_resolver_ui` | 4 | Conflito de versao | Componente React de resolucao de conflito |
| SK-011 | `vector_clock_comparator` | 4 | Dois vector clocks | Relacao: dominates / dominated / concurrent (conflito) |
| SK-012 | `rls_policy_writer` | 3, 5 | Modelo de acesso | SQL RLS policies |
| SK-013 | `changelog_generator` | 7 | Lista de commits | CHANGELOG.md formatado (Keep a Changelog) |
| SK-014 | `structured_logging_implementer` | 8 | Endpoint code | Codigo com logs estruturados JSON |
| SK-015 | `cicd_pipeline_designer` | 7 | Stack + deploy targets | GitHub Actions YAML |

### 5.2 Exemplo de Skill — SK-011 (Vector Clock Comparator)

```typescript
// skill: vector_clock_comparator
// Determina a relacao entre dois vector clocks
// Retorna: 'a_dominates' | 'b_dominates' | 'concurrent' (conflito)

type VectorClock = Record<string, number>;
type ClockRelation = 'a_dominates' | 'b_dominates' | 'concurrent' | 'equal';

function compareVectorClocks(a: VectorClock, b: VectorClock): ClockRelation {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let aLeadsInAny = false;
  let bLeadsInAny = false;

  for (const key of allKeys) {
    const aVal = a[key] ?? 0;
    const bVal = b[key] ?? 0;
    if (aVal > bVal) aLeadsInAny = true;
    if (bVal > aVal) bLeadsInAny = true;
  }

  if (aLeadsInAny && bLeadsInAny) return 'concurrent'; // CONFLITO
  if (aLeadsInAny) return 'a_dominates';               // A e mais recente
  if (bLeadsInAny) return 'b_dominates';               // B e mais recente
  return 'equal';                                       // Identicos
}

// Exemplos:
// compareVectorClocks({ A: 2 }, { A: 1 })        => 'a_dominates' (sem conflito)
// compareVectorClocks({ A: 1, I: 1 }, { A: 2 })  => 'concurrent' (CONFLITO)
// compareVectorClocks({ A: 1 }, { A: 1 })         => 'equal'
```

---

## 6. Protocolo de Comunicacao Inter-Agente

### 6.1 Contrato de Request (Orchestrator -> Agent)

```json
{
  "$schema": "https://billings.app/schemas/agent-request/v1",
  "request_id": "req_01j8x9z...",
  "timestamp": "2026-05-24T15:30:00Z",
  "stage": 4,
  "task_type": "feature_implementation",
  "priority": "high",
  "agent_target": "worker",
  "context": {
    "linear_issue_id": "BIL-42",
    "user_story": "Como aluna, quero editar um registro de um dia anterior...",
    "acceptance_criteria": ["AC1", "AC2", "AC3"],
    "related_adrs": ["ADR-004"],
    "branch": "feature/obs-edit-past-days",
    "performance_budget": {
      "api_latency_p95_ms": 300,
      "bundle_size_kb_gzip": 200
    }
  },
  "inputs": {
    "files_to_modify": ["src/App.jsx", "src/utils/storage.js"],
    "files_to_create": ["src/components/DayDetailModal.jsx", "src/hooks/useObservationVersions.js"],
    "schema_changes": "ver ADR-004 — observation_versions table"
  },
  "constraints": {
    "must_not_break": ["ADR-001", "ADR-003", "ADR-005"],
    "must_apply": ["TDD", "Clean_Architecture", "OWASP_A01", "OWASP_A03"],
    "lgpd_fields_never_in_logs": ["relations", "notes"]
  }
}
```

### 6.2 Contrato de Response (Agent -> Orchestrator)

```json
{
  "$schema": "https://billings.app/schemas/agent-response/v1",
  "request_id": "req_01j8x9z...",
  "agent": "worker",
  "stage": 4,
  "timestamp": "2026-05-24T16:45:00Z",
  "status": "completed",
  "confidence_score": 0.91,
  "blocking_issues": [],
  "warnings": [
    {
      "code": "PERF-001",
      "message": "Modal de conflito adiciona ~8KB ao bundle — dentro do budget mas proximo do limite",
      "severity": "low"
    }
  ],
  "outputs": {
    "files_created": [
      "src/components/DayDetailModal.jsx",
      "src/hooks/useObservationVersions.js"
    ],
    "files_modified": ["src/App.jsx"],
    "tests_written": [
      "src/components/__tests__/DayDetailModal.test.jsx",
      "test/e2e/observation-edit.spec.ts"
    ],
    "migrations_created": ["migrations/004_observation_versions.sql"],
    "pr_url": "https://github.com/juliocsanto/billings-mob/pull/42",
    "coverage_percent": 87.3
  },
  "reasoning": "Implementei DayDetailModal com modal de detalhes, botao de edicao, historico de versoes colapsavel e badge de conflito. Vector clock implementado conforme ADR-004. Testes cobrem: abertura do modal, edicao de dia anterior, deteccao de conflito, resolucao de conflito. Nenhuma violacao OWASP detectada.",
  "audit_trail": {
    "adrs_consulted": ["ADR-003", "ADR-004", "ADR-005"],
    "decisions_made": [
      "Optei por modal em vez de pagina separada: economia de 1 rota de navegacao",
      "Vector clock inicializado com {} em novos registros (lazy init)"
    ]
  },
  "next_stage_ready": true
}
```

### 6.3 Contrato de Blocking Issue

```json
{
  "blocking_issues": [
    {
      "issue_id": "BLK-001",
      "severity": "critical",
      "category": "OWASP_A01",
      "description": "Endpoint GET /api/observations/:date nao valida se o user_id da observacao pertence ao usuario autenticado",
      "location": "src/api/observations.ts:line 47",
      "remediation": "Adicionar WHERE user_id = auth.uid() na query ou confiar no RLS do Supabase (verificar se RLS esta habilitado)",
      "references": ["ADR-003", "OWASP Top 10 2021 A01"]
    }
  ]
}
```

---

## 7. Estrategia de Monetizacao

### 7.1 Value Equation (Hormozi) — Analise Final

**Produto: Billings Grafico — Plataforma MOB**

```
Value = (Dream Outcome x Perceived Likelihood) / (Time Delay x Effort & Sacrifice)

Dream Outcome (para aluna):     9/10
  - Conhecer profundamente seu proprio ciclo
  - Autonomia sobre a saude reprodutiva natural
  - Comunicacao fluida com instrutora (sem WhatsApp manual)

Dream Outcome (para instrutora): 10/10
  - Eliminar planilhas e screenshots de WhatsApp
  - Acompanhar 20+ alunas sem caos operacional
  - Exportar graficos CENPLAFAM com 1 clique

Perceived Likelihood:            8/10
  - App clinico com metodologia CENPLAFAM reconhecida
  - Instrutora certificada WOOMB endossa o uso
  - Demo funcional disponivel imediatamente (PWA existente)

Time Delay:                      9/10 (muito rapido)
  - Aluna ve beneficio no primeiro ciclo registrado (~28 dias)
  - Instrutora ve beneficio na primeira consulta com dashboard

Effort & Sacrifice:              8/10 (muito baixo)
  - Aluna: 2 min/dia de registro
  - Instrutora: 30 min de onboarding inicial

Score total: altissimo. Produto com valor percebido excepcionalmente alto para o custo.
```

### 7.2 Grand Slam Offer

**Para instrutoras (canal B2B primario):**

Produto base: Dashboard de gestao de alunas (R$ 99/mes — ate 30 alunas)

Bonus inclusos sem custo adicional:
1. Notificacao WhatsApp quando aluna registra Apice (valor percebido: R$ 30/mes)
2. Exportacao PDF formato CENPLAFAM com 1 clique (valor percebido: R$ 20/mes)
3. Historico de 12 meses por aluna com analise de padroes (valor percebido: R$ 40/mes)
4. Resolucao de conflitos de edicao com audit log (valor percebido: exclusivo)
5. Suporte via WhatsApp em horario comercial (valor percebido: R$ 20/mes)

Garantia: 30 dias gratis, cancela sem perguntas, sem fidelidade minima.

Valor total percebido: R$ 99 + R$ 110 em bonus = R$ 209/mes de valor
Preco cobrado: R$ 99/mes
Ratio valor/preco: 2.1x — excelente para SaaS B2B

**Para alunas (canal B2C complementar):**

Plano gratuito: PWA com registro basico (ate 3 ciclos de historico)
Plano aluna conectada: R$ 9,90/mes (historico ilimitado + sincronizacao com instrutora)

Nota: O plano gratuito funciona como ferramenta de aquisicao das instrutoras (aluna indica o app para a instrutora, que assina o plano business).

### 7.3 Modelo de Receita

```
Receita mensal projetada:

MVP (mes 6):
  10 instrutoras x R$ 99 = R$ 990/mes
  50 alunas conectadas x R$ 9,90 = R$ 495/mes
  Total: R$ 1.485/mes (USD ~270)
  Custo infraestrutura: USD 0–8/mes (Vercel free + Supabase free + WhatsApp Cloud API)
  Margem: ~95%

Crescimento (mes 18):
  100 instrutoras x R$ 99 = R$ 9.900/mes
  500 alunas x R$ 9,90 = R$ 4.950/mes
  Total: R$ 14.850/mes (USD ~2.700)
  Custo infraestrutura: USD 80/mes
  Margem: ~97%

Escala (mes 36):
  500 instrutoras x R$ 99 = R$ 49.500/mes
  2000 alunas x R$ 9,90 = R$ 19.800/mes
  Total: R$ 69.300/mes (USD ~12.600)
  Custo infraestrutura: USD 400/mes
  Margem: ~97%
```

### 7.4 Canal de Distribuicao

Estrategia primaria: Vendas B2B via comunidades de instrutoras
1. CENPLAFAM / WOOMB Brasil — parceria institucional (legitima o produto)
2. Grupos de WhatsApp de instrutoras certificadas — marketing boca-a-boca
3. Instagram educativo sobre MOB — atrai alunas que recomendam a instrutoras
4. Webinars para instrutoras: "Como digitalizar sua pratica clinica"

CAC estimado: R$ 0 a R$ 50 (principalmente boca-a-boca em comunidades fechadas)
LTV estimado: R$ 99 x 24 meses = R$ 2.376 por instrutora
LTV/CAC ratio: 24x+ — excelente

---

## 8. Roadmap de Implementacao

### 8.1 Priorizacao de Agentes (qual construir primeiro)

```
FASE 1 — Fundacao (Sprints 1-4, semanas 1-8)
  Prioridade: Agentes dos Estagios 3, 4, 7 (Arquitetura → Desenvolvimento → Deploy)
  
FASE 2 — Qualidade (Sprints 5-6, semanas 9-12)
  Prioridade: Agentes dos Estagios 5, 6 (Seguranca e QA)

FASE 3 — Produto completo (Sprints 7-10, semanas 13-20)
  Prioridade: Estagios 8, 9 (Observabilidade e Suporte)
  
FASE 4 — Estrategia (pos-lancamento)
  Prioridade: Estagios 1, 2 (Validacao e Discovery para V2)
```

### 8.2 Sprints Detalhados

**Sprint 1 (semana 1-2) — Backend Foundation**
Estimativa: 40h (2 devs x 20h)

Tarefas:
- [ ] Setup Vercel (projeto billings-mob, variaveis de ambiente, dominio)
- [ ] Setup Supabase (projeto, regiao SP, Auth habilitado)
- [ ] Schema PostgreSQL inicial (users, observations, observation_versions, cycles, instructor_student_links, audit_log)
- [ ] RLS policies para todas as tabelas
- [ ] API Node.js + Hono.js com TypeScript — estrutura de pastas Clean Architecture
- [ ] Endpoints: POST /observations, GET /observations/:date, GET /observations/:date/versions
- [ ] Validacao Zod em todos os inputs
- [ ] Logs estruturados (sem dados sensiveis)
- [ ] CI/CD basico: lint + type-check + testes

Criterio de conclusao: Endpoint de criar observacao funcionando com RLS validado. Migrations rodando no CI.

**Sprint 2 (semana 3-4) — PWA Migration (Aluna)**
Estimativa: 40h

Tarefas:
- [ ] Migrar storage de localStorage para Supabase (sem quebrar fluxo atual)
- [ ] Implementar Supabase Auth no PWA (login por email/magic link)
- [ ] Sincronizacao offline-first: Service Worker com queue de operacoes
- [ ] Implementar vector clock em todas as operacoes de escrita
- [ ] Modal de detalhes ao clicar em dia no grafico (DayDetailModal)
- [ ] Edicao de registros passados com geracao de nova versao
- [ ] Historico de versoes no modal (colapsavel)
- [ ] Testes unitarios: useObservationVersions, compareVectorClocks

Criterio de conclusao: Aluna consegue editar registro de dia anterior e ver historico de versoes.

**Sprint 3 (semana 5-6) — Dashboard da Instrutora (billings-web)**
Estimativa: 50h

Tarefas:
- [ ] Criar repositorio billings-web
- [ ] Setup Vite + React 18 + TypeScript + TailwindCSS
- [ ] Setup Vercel (deploy automatico)
- [ ] Autenticacao com Supabase Auth (role: instructor)
- [ ] Lista de alunas com status em tempo real (Supabase Realtime)
- [ ] Tela de detalhe da aluna: grafico de ciclo completo
- [ ] Clicar no dia: painel lateral com detalhes e historico de versoes
- [ ] Interface de resolucao de conflitos (diff lado a lado)
- [ ] Exportacao PDF formato CENPLAFAM (reuso do componente do PWA)
- [ ] Testes: fluxo de resolucao de conflito (E2E com Playwright)

Criterio de conclusao: Instrutora consegue ver alunas, visualizar ciclos, editar registros e resolver conflitos.

**Sprint 4 (semana 7-8) — Vinculacao Aluna/Instrutora e Notificacoes**
Estimativa: 40h

Tarefas:
- [ ] Endpoint POST /instructor-student-links (aluna envia convite)
- [ ] Endpoint PATCH /instructor-student-links/:id (instrutora aceita/recusa)
- [ ] Notificacao de convite por email (Supabase Auth email)
- [ ] Setup WhatsApp Cloud API (Meta Business, numero dedicado, template aprovado)
- [ ] Notificacao WhatsApp quando aluna registra Apice
- [ ] Lembrete diario via Web Push (substituir o .ics atual)
- [ ] Testes de integracao: fluxo completo de vinculacao

Criterio de conclusao: Instrutora recebe convite, aceita, e recebe notificacao automatica de Apice da aluna.

**Sprint 5 (semana 9-10) — Seguranca e QA**
Estimativa: 30h

Tarefas:
- [ ] GitHub Advanced Security habilitado (CodeQL)
- [ ] TruffleHog no CI (secret scanning)
- [ ] npm audit no CI (bloqueia em HIGH+)
- [ ] Penetration test manual nos endpoints criticos
- [ ] Cobertura de testes >= 80% em todos os modulos
- [ ] Playwright E2E: todos os fluxos criticos
- [ ] LGPD: documentacao de fluxo de dados, DPA com Vercel, Supabase e Meta (WhatsApp)

Criterio de conclusao: Zero vulnerabilidades CVSS >= 7.0. Cobertura >= 80%.

**Sprint 6 (semana 11-12) — Observabilidade e Lancamento Beta**
Estimativa: 30h

Tarefas:
- [ ] Sentry no frontend (PWA) e backend (API)
- [ ] UptimeRobot configurado (alertas email)
- [ ] Dashboards de SLO no Vercel Analytics + UptimeRobot
- [ ] Runbooks documentados (incidente Nivel 1, 2, 3)
- [ ] Onboarding de 5 instrutoras beta
- [ ] Hotline de suporte (WhatsApp direto com dev)

Criterio de conclusao: Produto em producao com 5 instrutoras beta ativas. SLOs monitorados.

**Sprint 7-10 (semana 13-20) — Crescimento e V2**
- Pagamentos (Stripe Brasil / Pagar.me) — plano instrutora R$ 99/mes
- Plano aluna conectada R$ 9,90/mes
- Analytics de produto (PostHog open-source)
- Relatorio mensal automatico para instrutora (PDF via email)
- App nativo (avaliar React Native apos 200 usuarios ativos)
- Parceria CENPLAFAM/WOOMB Brasil

### 8.3 Estimativas de Esforco por Agente

| Agente | Fase | Esforco estimado | Dependencias |
|---|---|---|---|
| Backend API (Hono.js + Supabase) | Sprint 1 | 40h | ADR-002, ADR-003 |
| CRDT / Vector Clock + Migrations | Sprint 1-2 | 20h | ADR-004 |
| PWA Migration (offline + auth) | Sprint 2 | 30h | Sprint 1 completo |
| DayDetailModal + Edit Past Days | Sprint 2 | 20h | ADR-004 |
| billings-web (dashboard) | Sprint 3 | 50h | Sprint 1 completo |
| Conflict Resolution UI | Sprint 3 | 15h | ADR-004 |
| WhatsApp Cloud API + Push Notifications | Sprint 4 | 25h | ADR-009 |
| Vinculacao aluna/instrutora | Sprint 4 | 20h | Sprint 3 completo |
| Security pipeline (CI/CD) | Sprint 5 | 20h | ADR-007 |
| E2E tests (Playwright) | Sprint 5-6 | 25h | Sprint 3 completo |
| Observabilidade (Sentry + UptimeRobot) | Sprint 6 | 15h | ADR-008 |
| Pagamentos (Stripe) | Sprint 7-8 | 40h | Sprint 6 completo |

**Total MVP (Sprints 1-6): ~280 horas — ~14 semanas para 2 devs em tempo parcial (20h/sem cada)**

---

## 9. Registro de Riscos

### 9.1 Riscos Criticos

**RISCO-001 — Custo WhatsApp Cloud API escala com volume**
- Probabilidade: MEDIA (perto de 34+ usuarios enviando lembretes diarios)
- Impacto: MEDIO (custo passa do free tier — ~USD 7,50/mes para 50 usuarios)
- Estagio afetado: 4, 8, 9
- Mitigacao:
  1. Web Push como canal primario de lembretes (gratuito, sem limite)
  2. WhatsApp Cloud API reservado para: compartilhamento de relatorio e alertas de Apice criticos
  3. Monitorar uso via Meta Business dashboard com alerta em 800 conversas/mes
  4. Se custo ultrapassar USD 30/mes: mover lembretes diarios 100% para Web Push
- Responsavel: Tech Lead
- Prazo de acao: Sprint 4

**RISCO-002 — Violacao de LGPD com dados clinicos**
- Probabilidade: MEDIA
- Impacto: CRITICO (multa de ate R$ 50M ou 2% do faturamento + dano de reputacao irreparavel)
- Estagio afetado: 3, 5
- Mitigacao:
  1. Supabase com regiao Sao Paulo (dados no Brasil)
  2. RLS em todas as tabelas (aluna so ve seus dados)
  3. Criptografia em repouso habilitada no Supabase
  4. DPA (Data Processing Agreement) com Vercel, Supabase e Meta (WhatsApp)
  5. Politica de privacidade clara sobre dados de ciclo menstrual e relacoes intimas
  6. Direito ao esquecimento: endpoint DELETE /users/:id que apaga todos os dados
  7. Logs sem campos sensiveis (relations, notes nunca em logs)
- Responsavel: Arquiteto + time juridico
- Prazo de acao: Sprint 1 (base) + Sprint 5 (auditoria)

**RISCO-003 — Interpretacao clinica indevida pelo sistema de IA**
- Probabilidade: MEDIA (Claude pode classificar ciclo em resposta a perguntas abertas)
- Impacto: CRITICO (risco legal + etico — sistema substitui autoridade da instrutora)
- Estagio afetado: 4 (implementacao do Guia IA)
- Mitigacao:
  1. System prompt rigoroso: "NUNCA interprete o ciclo como fertil ou infertil"
  2. Filtro de output: se resposta contem "fertil", "infertil", "seguro" ou "inseguro" — bloquear e substituir por redirect para instrutora
  3. Teste adversarial: perguntas projetadas para induzir o modelo a classificar o ciclo
  4. Aviso legal prominente em toda tela do Guia IA
  5. Monitoramento de conversas (anonimizado) para detectar desvios
- Responsavel: Tech Lead + QA Lead
- Prazo de acao: Sprint 2

**RISCO-004 — Perda de dados clinicos por conflito nao resolvido**
- Probabilidade: BAIXA (com CRDT implementado)
- Impacto: ALTO (dados clinicos incorretos podem afetar interpretacao da instrutora)
- Estagio afetado: 4, 6
- Mitigacao:
  1. Audit log imutavel: nenhum dado e perdido, apenas a versao ativa muda
  2. Badge de conflito proeminente no dashboard da instrutora
  3. Notificacao ativa (email + WhatsApp) quando conflito e detectado
  4. SLA interno: conflito deve ser resolvido em < 48h (alerta escalado apos esse prazo)
  5. Testes de conflito automatizados (E2E simulando edicao concorrente)
- Responsavel: Backend Dev + QA
- Prazo de acao: Sprint 2

**RISCO-005 — Instrutoras nao adotam o dashboard (risco de produto)**
- Probabilidade: MEDIA
- Impacto: ALTO (modelo de negocio depende da instrutora como cliente primario)
- Estagio afetado: 1, 2, 9
- Mitigacao:
  1. Onboarding presencial com as 5 primeiras instrutoras beta (Sprint 6)
  2. Eliminar qualquer fricao: magic link login (sem senha), tutorial interativo
  3. Migrador de dados: instrutoras importam suas planilhas existentes
  4. Valor imediato em < 5 minutos: ver grafico de uma aluna sem configuracao
  5. Feedback loop semanal com instrutoras beta (WhatsApp direto com dev)
- Responsavel: Product Manager (Specialist Estagio 2)
- Prazo de acao: Sprint 3

---

## 10. Definition of Done

### 10.1 Definition of Done — Por Feature

Uma feature esta "done" quando:

- [ ] Codigo implementado e commitado em branch de feature
- [ ] Testes unitarios escritos e passando (cobertura >= 80% no modulo)
- [ ] Testes de integracao cobrindo o contrato de endpoint
- [ ] Testes E2E cobrindo o fluxo critico do usuario
- [ ] PR criado com descricao estruturada (contexto, mudancas, como testar)
- [ ] Code review aprovado pelo Reviewer Agent (zero violacoes criticas ou altas)
- [ ] Security scan passando (npm audit + CodeQL)
- [ ] Bundle size dentro do budget (< 200KB gzipped)
- [ ] API latencia dentro do budget (p95 < 300ms em staging)
- [ ] LGPD: campos sensiveis nunca em logs validado
- [ ] Documentacao atualizada (ARCHITECTURE.md se ADR mudou, README se interface mudou)
- [ ] Issue do GitHub Projects atualizado e fechado
- [ ] Deploy em staging validado manualmente

### 10.2 Definition of Done — Por Sprint

Um sprint esta "done" quando:

- [ ] Todas as features do sprint atendem ao DoD de feature
- [ ] Demo preparada e apresentada (instrutoras beta para sprints 3+)
- [ ] Retrospectiva documentada (o que funcionou, o que melhorar)
- [ ] Backlog do proximo sprint refinado
- [ ] Metricas de qualidade registradas: cobertura, latencia, erros Sentry
- [ ] SLOs medidos e dentro do target

### 10.3 Definition of Done — Para o Pipeline de Agentes

O pipeline de CI/CD e "done" (producao-grade) quando:

- [ ] Orchestrator roteia tarefas entre todos os 9 estagios
- [ ] Reviewer Agent retorna confidence_score e blocking_issues para cada estagio
- [ ] Nenhum estagio avanca com blocking_issues pendentes
- [ ] Audit trail completo: toda decisao de agente registrada com reasoning
- [ ] Pipeline de seguranca (SAST + DAST + secret scanning) rodando em cada PR
- [ ] SLOs monitorados e alertas ativos
- [ ] Runbooks documentados para os 5 cenarios de falha mais provaveis
- [ ] MTTR < 30 minutos para incidentes Nivel 1 (validado em simulacao)

---

## 11. Proximos Passos

### Historico — Concluidos (Sprint 0 + Sprint 1, ate 2026-05-25)

Os itens abaixo foram concluidos e fechados:

- [x] Criar repositorio `billings-web` (Sprint 0)
- [x] Conectar `billings-mob` e `billings-web` ao Vercel; configurar
      variaveis de ambiente em todos os targets (Sprint 0)
- [x] Criar projeto Supabase em `sa-east-1`; habilitar Auth (magic link);
      executar migration `20260524000001_initial_schema` (Sprint 0)
- [x] Criar GitHub Project "Billings Grafico" com colunas Kanban (Sprint 0)
- [x] Implementar schema de banco conforme ADR-003 e ADR-004 (Sprint 1)
- [x] Implementar RLS policies conforme ADR-003 (Sprint 1)
- [x] Implementar API base (Hono.js) com endpoints de observacoes (Sprint 1)
- [x] Configurar CI/CD inicial — pipeline 5 jobs em ambos os repos (Sprint 0)
- [x] Pipeline de deploy real (`deploy.yml`) ativo em ambos os repos (Sprint 1)

Obs.: Setup do WhatsApp Cloud API (Meta Business) permanece pendente;
aguarda aprovacao do Meta Business (prazo externo, 1–7 dias).

### Imediatos — Sprint 2 (em andamento)

- Supabase Auth: magic link flow no PWA (substituir localStorage)
- Service Worker: offline-first com sync queue para observations
- DayDetailModal: integracao com `GET /api/observations/:id`
- Integracao `POST /api/observations` e `PATCH /api/observations/:id` no PWA
- Integration tests com Supabase local stack
- PR `develop -> main` Sprint 2

### Backlog Tecnico com Prazo

- **[Sprint 2 — PRAZO 2026-06-02]** Atualizar `actions/checkout@v4` e
  `actions/setup-node@v4` para Node.js 24 em ambos os repos.
  O GitHub Actions depreca o runner Node.js 20 nessa data. A mudanca
  requer apenas alterar `node-version: '22'` para `node-version: '24'`
  nos arquivos `ci.yml` e `deploy.yml` de ambos os repositorios.

### Medio prazo (mes 1-2)

10. Completar Sprints 2-4 (PWA offline-first, dashboard instrutora, vinculos)
11. Onboarding 5 instrutoras beta (Sprint 6)
12. Primeiro pagamento real (Stripe — Sprint 7)

### Decisoes Pendentes que Precisam de Resposta

| ID | Decisao | Impacto | Prazo |
|---|---|---|---|
| D-PENDING-001 | Nome comercial do produto (Billings Grafico? BillingsApp? MOB Digital?) | Marketing + dominio + branding | Antes do lancamento publico |
| D-PENDING-002 | Parceria formal com CENPLAFAM/WOOMB Brasil — abordar quando? | Legitimidade e canal de distribuicao | Mes 2-3 |
| D-PENDING-003 | Migracao para Twilio (quando volume justifica?) | Custo vs confiabilidade | Quando atingir 50+ instrutoras ativas |
| D-PENDING-004 | App nativo (React Native) — vale a pena? | UX mobile vs custo de desenvolvimento | Avaliar em 6 meses com dados de uso |
| D-PENDING-005 | Compliance SOC2 — necessario para venda B2B enterprise? | Nao critico antes de 100 instrutoras | Ano 2 |

---

## Apendice A — Checklist de Seguranca Pre-Lancamento

- [ ] HTTPS obrigatorio em todos os endpoints (HSTS habilitado)
- [ ] Headers de seguranca: CSP, X-Frame-Options, X-Content-Type-Options
- [ ] Rate limiting: 100 requests/min por IP no geral, 10 logins/min por IP
- [ ] JWT com expiracao curta (1h) + refresh token (7 dias)
- [ ] Supabase RLS habilitado e testado em todas as tabelas
- [ ] Logs sem dados sensiveis (relations, notes nunca aparecem)
- [ ] Endpoint DELETE /users/:id implementado (direito ao esquecimento LGPD)
- [ ] Politica de privacidade publicada no app
- [ ] Termos de uso assinados digitalmente no cadastro
- [ ] Backups automaticos do banco de dados (Supabase — diario)
- [ ] Plano de resposta a incidentes documentado

## Apendice B — Variaveis de Ambiente

```bash
# Backend API (Vercel Serverless Functions)
NODE_ENV=production
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...  # NUNCA expor no frontend
JWT_SECRET=...
WHATSAPP_API_TOKEN=...         # WhatsApp Cloud API (Meta)
WHATSAPP_PHONE_NUMBER_ID=...   # ID do numero no Meta for Developers
ANTHROPIC_API_KEY=...          # Supabase Edge Function (chat streaming)

# Frontend PWA (billings-mob)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...     # Chave publica — pode estar no frontend
VITE_API_URL=https://api.billings.app

# Frontend Dashboard (billings-web)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=https://api.billings.app
```

AVISO: Nenhuma dessas variaveis deve aparecer no codigo-fonte. Usar `.env.local` para desenvolvimento e variaveis de ambiente do Vercel + Supabase para producao.

## Apendice C — Links e Recursos

- Repositorio PWA (billings-mob):
    https://github.com/juliocsanto/billings-mob
- Repositorio Dashboard (billings-web):
    https://github.com/juliocsanto/billings-web
- App PWA em producao:
    https://billings-mob.vercel.app
- Dashboard Instrutora em producao:
    https://billings-web.vercel.app
- CENPLAFAM/WOOMB Brasil: https://www.woomb.com.br
- Supabase Dashboard: https://supabase.com/dashboard
- Vercel Dashboard: https://vercel.com/dashboard
- GitHub Projects:
    https://github.com/juliocsanto/billings-mob/projects
- Sentry: https://sentry.io
- UptimeRobot: https://uptimerobot.com
- WhatsApp Cloud API (Meta):
    https://developers.facebook.com/docs/whatsapp/cloud-api

---

*Documento gerado em 2026-05-24. Versao 1.1 — atualizado em 2026-05-26.*  
*Proximo review: 2026-06-24 (apos Sprint 3).*  
*Mantenedor: Julio C. Santo (juliocsanto3@gmail.com)*
