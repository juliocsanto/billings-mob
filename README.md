# billings-mob — API Backend

API serverless do sistema Billings Grafico. Expoe os endpoints consumidos pelo PWA da aluna e pelo dashboard da instrutora.

Producao: https://billings-mob.vercel.app

## O que e este repositorio

Este repositorio contem:

- API Hono.js deployada como Vercel Serverless Functions (diretorio `api/`)
- PWA legado (diretorio `src/`) — substituido progressivamente pelo billings-web

O projeto usa o Metodo de Ovulacao Billings (MOB). A aluna registra observacoes diarias do ciclo; a instrutora acompanha e orienta. A API gerencia Registros diarios, Ciclos, Selos e vinculacoes entre Aluna e Instrutora.

## Stack

- Hono.js + TypeScript — framework HTTP para Vercel Serverless Functions
- Supabase (PostgreSQL + RLS) — banco de dados e autenticacao
- Zod — validacao de schemas de entrada
- Vector clock (CRDT) — resolucao de conflitos de versao offline/online (ADR-004)
- Vercel Serverless Functions — runtime de producao (ADR-007)

## Endpoints da API

Todos os endpoints exigem header `Authorization: Bearer <jwt>`.

| Metodo | Caminho | Descricao |
|---|---|---|
| GET | /api/observations | Lista Registros diarios da Aluna autenticada |
| POST | /api/observations | Cria novo Registro diario |
| GET | /api/observations/:id | Retorna Registro diario por ID |
| PATCH | /api/observations/:id | Atualiza Registro diario (vector clock) |
| GET | /api/observations/versions | Lista versoes com Conflito de versao aberto |
| GET | /api/cycles | Lista Ciclos da Aluna |
| POST | /api/cycles | Cria novo Ciclo |
| GET | /api/cycles/:id | Retorna Ciclo por ID |
| PATCH | /api/cycles/:id | Atualiza Ciclo |
| GET | /api/users/me | Retorna perfil da Aluna ou Instrutora autenticada |
| POST | /api/instructor-student-links | Vincula Instrutora a Aluna |
| PATCH | /api/instructor-student-links/:id | Atualiza vinculacao (aceitar/revogar) |

## Variaveis de ambiente

Criar `.env.local` (nunca commitar):

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx
```

No Vercel, configurar as mesmas variaveis em Settings > Environment Variables.

## Desenvolvimento local

Prerequisitos: Node.js 22+, npm.

```bash
git clone https://github.com/juliocsanto/billings-mob.git
cd billings-mob
npm install
cd api && npm install && cd ..
```

Para rodar a API localmente via Vercel CLI:

```bash
npx vercel dev
```

A API estara disponivel em `http://localhost:3000/api/`.

## Testes

```bash
cd api
npm test
```

Os testes de integracao cobrem os 12 cenarios definidos pelo QA (ver `api/__tests__/`).

## Repositorios relacionados

- Dashboard da instrutora: https://github.com/juliocsanto/billings-web (producao: https://billings-web.vercel.app)
- Arquitetura completa: `AACHITECTURE.md` neste repositorio

## Aviso legal

A interpretacao clinica do ciclo e responsabilidade exclusiva da instrutora credenciada CENPLAFAM/WOOMB. Este sistema nao substitui o acompanhamento profissional.
