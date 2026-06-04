# Billings Grafico — PWA da Aluna

[![CI](https://github.com/juliocsanto/billings-mob/actions/workflows/ci.yml/badge.svg)](https://github.com/juliocsanto/billings-mob/actions/workflows/ci.yml)
[![Cobertura](https://img.shields.io/badge/cobertura-%3E80%25-brightgreen)](https://github.com/juliocsanto/billings-mob/actions)
[![Versao](https://img.shields.io/badge/versao-1.4.2-blue)](CHANGELOG.md)
[![Sentry](https://img.shields.io/badge/monitorado%20por-Sentry-362D59?logo=sentry)](https://sentry.io)

Aplicativo Progressive Web App para alunas do **Metodo de Ovulacao Billings (MOB)**.
Producao: **https://billings-mob.vercel.app**

---

## O que e o Metodo Billings

O Metodo de Ovulacao Billings e uma metodologia de conhecimento do ciclo feminino baseada na
observacao diaria do muco cervical, sensacao corporal e outros sinais biologicos. A aluna
registra o que percebe a cada dia; sua instrutora certificada CENPLAFAM/WOOMB analisa esse
historico e orienta a aluna com base em padroes clinicos estabelecidos. O sistema nao
realiza classificacoes automaticas: toda interpretacao clinica e competencia exclusiva
da instrutora.

---

## Para quem e este aplicativo

| Perfil | Funcao |
|---|---|
| Aluna MOB | Registra observacoes diarias do ciclo pelo celular |
| Instrutora CENPLAFAM/WOOMB | Acompanha alunas pelo dashboard web (billings-web) |
| Desenvolvedor | Leia a secao "Como rodar localmente" abaixo |

---

## Funcionalidades principais

**Registro diario**
A aluna registra, para cada dia do ciclo, o Selo (categoria de muco), o tipo de muco
observado, a sensacao corporal, a presenca de sangramento e uma descricao textual livre.
O DayDetailModal exibe historico de versoes de cada registro, permitindo editar dias
passados com rastreabilidade completa.

**Offline-first**
O Service Worker (Workbox) armazena as solicitacoes em fila local quando o dispositivo
esta sem conexao. Ao reconectar, o sync automatico envia os registros pendentes para a
API usando o vector clock para detectar conflitos de versao antes de aplicar as mudancas.

**Sincronizacao via vector clock**
Cada Registro diario carrega um vetor de versao (CRDT simplificado). Quando a aluna
edita um registro ja modificado pela instrutora, o sistema detecta o Conflito de versao
e o encaminha ao painel da instrutora para resolucao — sem perder nenhuma das versoes.

**Vinculo com instrutora**
A aluna busca e solicita vinculo com sua instrutora diretamente pelo app. A instrutora
recebe a solicitacao no dashboard e aceita ou rejeita. Apos o vinculo, a instrutora passa
a visualizar os registros da aluna em tempo real.

**Notificacoes push**
A aluna configura preferencias de notificacao (novos comentarios, lembretes diarios).
As notificacoes sao enviadas via FCM com controles granulares de permissao.

---

## Arquitetura

O repositorio contem dois artefatos implantados no mesmo projeto Vercel: o PWA da aluna
(diretorio `src/`, React 18 + Vite) e a API serverless (diretorio `api/`, Hono.js). O PWA
faz chamadas REST para a propria API do projeto; o dashboard da instrutora (billings-web)
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
  observations/      — Registros diarios (POST, GET, PATCH)
  cycles/            — Ciclos (POST, GET, PATCH)
  users/             — Perfil + preferencias push
  instructor-student-links/  — Vinculo aluna-instrutora
  webhooks/          — Recepcao webhooks WhatsApp
  _lib/
    vectorClock.ts       — Dominio puro: CRDT (zero dependencias)
    whatsapp/            — Port + Adapters (arquitetura hexagonal)
    notifications/       — NotificationService + factory
    auth.ts              — Middleware JWT
    rateLimit.ts         — Rate limiting sliding-window
    sanitizeAuditData.ts — Sanitizacao LGPD pre-log
```

Documentacao completa de arquitetura: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## Endpoints da API

Todos os endpoints exigem o header `Authorization: Bearer <jwt>` (Supabase JWT da aluna
ou instrutora autenticada).

| Metodo | Caminho | Descricao |
|---|---|---|
| GET | /api/observations | Lista Registros diarios da aluna autenticada |
| POST | /api/observations | Cria novo Registro diario |
| GET | /api/observations/:id | Retorna Registro por ID com historico de versoes |
| PATCH | /api/observations/:id | Atualiza Registro (vector clock + deteccao de Conflito) |
| GET | /api/observations/versions/pending | Lista Conflitos de versao abertos (instrutora) |
| PATCH | /api/observations/versions/:id/resolve | Resolve Conflito de versao (autoridade da instrutora) |
| GET | /api/cycles | Lista Ciclos da aluna |
| POST | /api/cycles | Cria novo Ciclo |
| PATCH | /api/cycles/:id | Atualiza Ciclo |
| GET | /api/users/me | Retorna perfil do usuario autenticado |
| GET | /api/users/push-preferences | Retorna preferencias de notificacao push |
| PUT | /api/users/push-preferences | Atualiza preferencias de notificacao push |
| POST | /api/instructor-student-links | Solicita vinculo aluna-instrutora |
| PATCH | /api/instructor-student-links/:id | Aceita ou revoga vinculo |
| GET | /api/webhooks/whatsapp | Handshake de verificacao Meta |
| POST | /api/webhooks/whatsapp | Recepcao de mensagens WhatsApp |

Contrato OpenAPI completo disponivel em `ARCHITECTURE.md` secao 6.

---

## Como rodar localmente

### Pre-requisitos

- Node.js 24+
- npm
- Conta Supabase com projeto criado
- Vercel CLI: `npm install -g vercel`

### Instalacao

```bash
git clone https://github.com/juliocsanto/billings-mob.git
cd billings-mob
npm install
cd api && npm install && cd ..
```

### Variaveis de ambiente

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

# Sentry — upload de source maps (apenas CI/producao)
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=billings-mob

# URL de redirecionamento apos magic link
VITE_AUTH_REDIRECT_URL=https://billings-mob.vercel.app
```

> Nunca commite `.env.local`. O `.gitignore` ja protege este arquivo.
> `SUPABASE_SERVICE_ROLE_KEY` e usada apenas em runtime pela API serverless;
> configure-a como variavel de ambiente no Vercel Dashboard, nunca no frontend.

### Comandos

```bash
npx vercel dev          # API + PWA em http://localhost:3000

npm run dev             # somente PWA em http://localhost:5173
npm run build           # build de producao
npm run typecheck       # TypeScript sem emitir arquivos
npm run lint            # ESLint PWA
npm run lint:api        # ESLint API (zero-warning gate)
npm test                # Vitest — todos os testes
npm run test:coverage   # Vitest com relatorio de cobertura
npm run test:e2e        # Playwright E2E
```

---

## Seguranca e conformidade

- **LGPD:** Os campos `relations` e `notes` nunca aparecem em logs de auditoria.
  A funcao `sanitizeForAuditLog()` e enforced em todos os handlers antes de
  gravar em `audit_log`.
- **RLS:** Toda leitura e escrita de dados de usuario passa pelo cliente
  autenticado (`createAuthenticatedClient(jwt)`). O service role e usado
  exclusivamente para append em `audit_log`.
- **Restricao clinica:** O enum `stamp` nunca contem os valores `fertil`,
  `infertil`, `seguro` ou `inseguro`. Classificacao clinica e responsabilidade
  exclusiva da instrutora certificada.
- **Validacao:** Zod com `.strict()` em todos os schemas de entrada da API.

---

## Links uteis

| Recurso | URL |
|---|---|
| Producao (PWA + API) | https://billings-mob.vercel.app |
| Dashboard da instrutora | https://billings-web.vercel.app |
| Supabase Dashboard | https://app.supabase.com/project/gcwxwrjzbbqkuzcweyut |
| Vercel Dashboard | https://vercel.com/juliocsanto/billings-mob |
| Sentry | https://sentry.io |
| Arquitetura | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

---

## Repositorios relacionados

- **billings-web** (dashboard da instrutora): https://github.com/juliocsanto/billings-web

---

## Aviso clinico

A Interpretacao clinica do ciclo e responsabilidade exclusiva da instrutora credenciada
CENPLAFAM/WOOMB. Este sistema nao substitui o acompanhamento profissional nem classifica
automaticamente qualquer dia como fertil, infertil, seguro ou inseguro.
