# Billings Grafico — API Backend (billings-mob)

[![CI](https://github.com/juliocsanto/billings-mob/actions/workflows/ci.yml/badge.svg)](https://github.com/juliocsanto/billings-mob/actions/workflows/ci.yml)
[![Sentry](https://img.shields.io/badge/monitorado%20por-Sentry-362D59?logo=sentry)](https://sentry.io)
[![Cobertura de testes](https://img.shields.io/badge/cobertura-%3E80%25-brightgreen)](https://github.com/juliocsanto/billings-mob/actions)
[![Licenca](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)](LICENSE)

API serverless e PWA de suporte ao **Metodo de Ovulacao Billings (MOB)**.
Producao: **https://billings-mob.vercel.app**

---

## O que e este projeto

O **Billings Grafico** e um sistema digital para apoio ao Metodo de Ovulacao Billings — metodologia certificada pela CENPLAFAM/WOOMB. Ele conecta:

- **Aluna** — registra observacoes diarias do ciclo (selo, muco, sangramento, sensacao) via PWA mobile-first
- **Instrutora** — acompanha o progresso da aluna, revisa registros e emite orientacoes clinicas via dashboard web

Este repositorio contem a **API Hono.js** deployada como Vercel Serverless Functions (diretorio `api/`) e o **PWA legado** da aluna (diretorio `src/`, progressivamente substituido).

> **Restricao clinica inviolavel:** O sistema *nunca* classifica automaticamente um dia como fertil ou infertil. Toda interpretacao clinica e competencia exclusiva da instrutora certificada CENPLAFAM/WOOMB.

---

## Para quem e este sistema

| Perfil | Como usa |
|---|---|
| Aluna MOB | Registra observacoes diarias pelo PWA no celular |
| Instrutora CENPLAFAM/WOOMB | Acompanha alunas pelo dashboard web |
| Desenvolvedor contribuidor | Este README — continue lendo |

---

## Stack

| Componente | Tecnologia |
|---|---|
| Framework HTTP | Hono.js + TypeScript (Vercel Serverless Functions) |
| Banco de dados | Supabase PostgreSQL com Row Level Security (RLS) |
| Autenticacao | Supabase Auth — JWT + magic link |
| Validacao | Zod em todas as fronteiras da API |
| Sync offline | Vector Clock (CRDT simplificado) — ADR-004 |
| Notificacoes | WhatsApp Cloud API + Mock Adapter (padrao Hexagonal) |
| Observabilidade | Sentry + UptimeRobot (3 monitores ativos) |
| Deploy | Vercel Serverless Functions |
| Testes | Vitest (unit + integration) |

---

## Arquitetura resumida

```
Aluna (PWA mobile)           Instrutora (billings-web)
       |                              |
       +----------+  +----------------+
                  |  |
         [Vercel Serverless Functions]
         API Hono.js — /api/*
                  |
         [Supabase — Sao Paulo]
         PostgreSQL + RLS + Auth + Realtime
```

**Arquitetura em camadas (Clean Architecture):**

```
api/
  observations/    — endpoint de registros diarios (POST, GET, PATCH)
  cycles/          — endpoint de ciclos
  users/           — perfil do usuario autenticado
  instructor-student-links/  — vinculacao aluna-instrutora
  webhooks/        — recepcao de webhooks WhatsApp
  _lib/
    vectorClock.ts      — dominio puro: CRDT (sem imports externos)
    whatsapp/           — Port + Adapters (hexagonal)
    notifications/      — servico de notificacoes + factory
    auth.ts             — middleware de autenticacao JWT
    rateLimit.ts        — rate limiting sliding-window
    sanitizeAuditData.ts — sanitizacao LGPD antes de logs
```

Documentacao completa de arquitetura: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## Como rodar localmente

### Pre-requisitos

- Node.js 22+
- npm
- Conta no Supabase (projeto criado)
- Vercel CLI: `npm i -g vercel`

### Instalacao

```bash
git clone https://github.com/juliocsanto/billings-mob.git
cd billings-mob

# Dependencias do PWA
npm install

# Dependencias da API
cd api && npm install && cd ..
```

### Configuracao de ambiente

Copie o template e preencha os valores:

```bash
cp .env.example .env.local
```

Variaveis necessarias (obtenha no [Supabase Dashboard](https://app.supabase.com)):

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx   # NUNCA exponha no frontend
SUPABASE_ANON_KEY=xxx
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
SENTRY_DSN=xxx                  # opcional para dev local
```

> **Atencao:** Nunca commite `.env.local` ou qualquer arquivo com valores reais. O `.gitignore` ja protege esses arquivos.

### Rodando a API

```bash
npx vercel dev
```

A API estara disponivel em `http://localhost:3000/api/`.

### Rodando os testes

```bash
cd api
npm test           # executa todos os testes
npm run test:coverage  # com relatorio de cobertura
```

---

## Endpoints da API

Todos os endpoints exigem header `Authorization: Bearer <jwt>` (Supabase JWT).

| Metodo | Caminho | Descricao |
|---|---|---|
| GET | /api/observations | Lista registros diarios da aluna autenticada |
| POST | /api/observations | Cria novo registro diario |
| GET | /api/observations/:id | Retorna registro por ID (com historico de versoes) |
| PATCH | /api/observations/:id | Atualiza registro (vector clock + conflict detection) |
| GET | /api/observations/versions | Lista versoes com conflito aberto |
| GET | /api/cycles | Lista ciclos da aluna |
| POST | /api/cycles | Cria novo ciclo |
| GET | /api/users/me | Retorna perfil do usuario autenticado |
| POST | /api/instructor-student-links | Vincula instrutora a aluna |
| PATCH | /api/instructor-student-links/:id | Atualiza vinculacao (aceitar/revogar) |

Documentacao OpenAPI: disponivel via `ARCHITECTURE.md` secao 6.

---

## Links uteis

| Recurso | URL |
|---|---|
| Producao (API + PWA) | https://billings-mob.vercel.app |
| Dashboard da instrutora | https://billings-web.vercel.app |
| Supabase Dashboard | https://app.supabase.com/project/gcwxwrjzbbqkuzcweyut |
| Sentry (observabilidade) | https://sentry.io |
| Vercel Dashboard | https://vercel.com/juliocsanto/billings-mob |

---

## Repositorios relacionados

- **billings-web** (dashboard da instrutora): https://github.com/juliocsanto/billings-web

---

## Aviso legal

A interpretacao clinica do ciclo e responsabilidade exclusiva da instrutora credenciada CENPLAFAM/WOOMB. Este sistema nao substitui o acompanhamento profissional.
