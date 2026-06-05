# Billings Gráfico — PWA da Aluna

[![CI](https://github.com/juliocsanto/billings-mob/actions/workflows/ci.yml/badge.svg)](https://github.com/juliocsanto/billings-mob/actions/workflows/ci.yml)
[![Cobertura](https://img.shields.io/badge/cobertura-%3E80%25-brightgreen)](https://github.com/juliocsanto/billings-mob/actions)
[![Versão](https://img.shields.io/badge/versao-1.4.3-blue)](CHANGELOG.md)
[![Sentry](https://img.shields.io/badge/monitorado%20por-Sentry-362D59?logo=sentry)](https://sentry.io)

Aplicativo Progressive Web App para alunas do **Método de Ovulação Billings (MOB)**.
Produção: **https://billings-mob.vercel.app**

---

## O que é o Método Billings

O Método de Ovulação Billings é uma metodologia de conhecimento do ciclo feminino baseada na
observação diária do muco cervical, sensação corporal e outros sinais biológicos. A aluna
registra o que percebe a cada dia; sua instrutora certificada CENPLAFAM/WOOMB analisa esse
histórico e orienta a aluna com base em padrões clínicos estabelecidos. O sistema não
realiza classificações automáticas: toda interpretação clínica é competência exclusiva
da instrutora.

---

## Para quem é este aplicativo

| Perfil | Função |
|---|---|
| Aluna MOB | Registra observações diárias do ciclo pelo celular |
| Instrutora CENPLAFAM/WOOMB | Acompanha alunas pelo dashboard web (billings-web) |
| Desenvolvedor | Leia a seção "Como rodar localmente" abaixo |

---

## Funcionalidades principais

**Registro diário**
A aluna registra, para cada dia do ciclo, o Selo (categoria de muco), o tipo de muco
observado, a sensação corporal, a presença de sangramento e uma descrição textual livre.
O DayDetailModal exibe histórico de versões de cada registro, permitindo editar dias
passados com rastreabilidade completa.

**Offline-first**
O Service Worker (Workbox) armazena as solicitações em fila local quando o dispositivo
está sem conexão. Ao reconectar, o sync automático envia os registros pendentes para a
API usando o vector clock para detectar conflitos de versão antes de aplicar as mudanças.

**Sincronização via vector clock**
Cada Registro diário carrega um vetor de versão (CRDT simplificado). Quando a aluna
edita um registro já modificado pela instrutora, o sistema detecta o Conflito de versão
e o encaminha ao painel da instrutora para resolução — sem perder nenhuma das versões.

**Vínculo com instrutora**
A aluna busca e solicita vínculo com sua instrutora diretamente pelo app. A instrutora
recebe a solicitação no dashboard e aceita ou rejeita. Após o vínculo, a instrutora passa
a visualizar os registros da aluna em tempo real.

**Notificações push**
A aluna configura preferências de notificação (novos comentários, lembretes diários).
As notificações são enviadas via FCM com controles granulares de permissão.

---

## Arquitetura

O repositório contém dois artefatos implantados no mesmo projeto Vercel: o PWA da aluna
(diretório `src/`, React 18 + Vite) e a API serverless (diretório `api/`, Hono.js). O PWA
faz chamadas REST para a própria API do projeto; o dashboard da instrutora (billings-web)
consome a mesma API via `VITE_API_URL`.

```
+--------------------+    +--------------------+
|  Aluna (PWA)       |    | Instrutora         |
|  React 18 + Vite   |    | billings-web       |
|  Workbox SW        |    | React 18 + Vite    |
+--------------------+    +--------------------+
         |                         |
         +----------+--------------+
                    |
         +----------+----------+
         | Vercel Serverless   |
         | API Hono.js /api/*  |
         | Rate limit + Auth   |
         +----------+----------+
                    |
         +----------+----------+
         | Supabase (sa-east-1)|
         | PostgreSQL + RLS    |
         | Auth + Realtime     |
         +---------------------+
```

**Estrutura da API:**

```
api/
  observations/      — Registros diários (POST, GET, PATCH)
  cycles/            — Ciclos (POST, GET, PATCH)
  users/             — Perfil + preferências push
  instructor-student-links/  — Vínculo aluna-instrutora
  webhooks/          — Recepção webhooks WhatsApp
  _lib/
    vectorClock.ts       — Domínio puro: CRDT (zero dependências)
    whatsapp/            — Port + Adapters (arquitetura hexagonal)
    notifications/       — NotificationService + factory
    auth.ts              — Middleware JWT
    rateLimit.ts         — Rate limiting sliding-window
    sanitizeAuditData.ts — Sanitização LGPD pré-log
```

Documentação completa de arquitetura: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## Endpoints da API

Todos os endpoints exigem o header `Authorization: Bearer <jwt>` (Supabase JWT da aluna
ou instrutora autenticada).

| Método | Caminho | Descrição |
|---|---|---|
| GET | /api/observations | Lista Registros diários da aluna autenticada |
| POST | /api/observations | Cria novo Registro diário |
| GET | /api/observations/:id | Retorna Registro por ID com histórico de versões |
| PATCH | /api/observations/:id | Atualiza Registro (vector clock + detecção de Conflito) |
| GET | /api/observations/versions/pending | Lista Conflitos de versão abertos (instrutora) |
| PATCH | /api/observations/versions/:id/resolve | Resolve Conflito de versão (autoridade da instrutora) |
| GET | /api/cycles | Lista Ciclos da aluna |
| POST | /api/cycles | Cria novo Ciclo |
| PATCH | /api/cycles/:id | Atualiza Ciclo |
| GET | /api/users/me | Retorna perfil do usuário autenticado |
| GET | /api/users/push-preferences | Retorna preferências de notificação push |
| PUT | /api/users/push-preferences | Atualiza preferências de notificação push |
| POST | /api/instructor-student-links | Solicita vínculo aluna-instrutora |
| PATCH | /api/instructor-student-links/:id | Aceita ou revoga vínculo |
| GET | /api/webhooks/whatsapp | Handshake de verificação Meta |
| POST | /api/webhooks/whatsapp | Recepção de mensagens WhatsApp |

Contrato OpenAPI completo disponível em `ARCHITECTURE.md` seção 6.

---

## Como rodar localmente

### Pré-requisitos

- Node.js 24+
- npm
- Conta Supabase com projeto criado
- Vercel CLI: `npm install -g vercel`

### Instalação

```bash
git clone https://github.com/juliocsanto/billings-mob.git
cd billings-mob
npm install
cd api && npm install && cd ..
```

### Variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com os valores do seu projeto:

```
# Supabase — obtenha em app.supabase.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Sentry — Frontend (opcional em desenvolvimento)
VITE_SENTRY_DSN=

# Sentry — API serverless (opcional em desenvolvimento)
SENTRY_DSN=

# Sentry — upload de source maps (apenas CI/produção)
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=billings-mob

# URL de redirecionamento após magic link
VITE_AUTH_REDIRECT_URL=https://billings-mob.vercel.app
```

> Nunca comite `.env.local`. O `.gitignore` já protege este arquivo.
> `SUPABASE_SERVICE_ROLE_KEY` é usada apenas em runtime pela API serverless;
> configure-a como variável de ambiente no Vercel Dashboard, nunca no frontend.

### Comandos

```bash
npx vercel dev          # API + PWA em http://localhost:3000

npm run dev             # somente PWA em http://localhost:5173
npm run build           # build de produção
npm run typecheck       # TypeScript sem emitir arquivos
npm run lint            # ESLint PWA
npm run lint:api        # ESLint API (zero-warning gate)
npm test                # Vitest — todos os testes
npm run test:coverage   # Vitest com relatório de cobertura
npm run test:e2e        # Playwright E2E
```

---

## Segurança e conformidade

- **LGPD:** Os campos `relations` e `notes` nunca aparecem em logs de auditoria.
  A função `sanitizeForAuditLog()` é enforced em todos os handlers antes de
  gravar em `audit_log`.
- **RLS:** Toda leitura e escrita de dados de usuário passa pelo cliente
  autenticado (`createAuthenticatedClient(jwt)`). O service role é usado
  exclusivamente para append em `audit_log`.
- **Restrição clínica:** O enum `stamp` nunca contém os valores `fertil`,
  `infertil`, `seguro` ou `inseguro`. Classificação clínica é responsabilidade
  exclusiva da instrutora certificada.
- **Validação:** Zod com `.strict()` em todos os schemas de entrada da API.

---

## Links úteis

| Recurso | URL |
|---|---|
| Produção (PWA + API) | https://billings-mob.vercel.app |
| Dashboard da instrutora | https://billings-web.vercel.app |
| Supabase Dashboard | https://app.supabase.com/project/gcwxwrjzbbqkuzcweyut |
| Vercel Dashboard | https://vercel.com/juliocsanto/billings-mob |
| Sentry | https://sentry.io |
| Arquitetura | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

---

## Repositórios relacionados

- **billings-web** (dashboard da instrutora): https://github.com/juliocsanto/billings-web

---

## Aviso clínico

A Interpretação clínica do ciclo é responsabilidade exclusiva da instrutora credenciada
CENPLAFAM/WOOMB. Este sistema não substitui o acompanhamento profissional nem classifica
automaticamente qualquer dia como fertil, infertil, seguro ou inseguro.
