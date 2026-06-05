# Sprint 6.7 — Review Report
**Data:** 2026-06-05
**Revisado por:** code-reviewer
**Repos:** billings-mob (`/home/juliocsanto/billings/billings-mob`) · billings-web (`/home/juliocsanto/billings/billings-web`)
**Skills executadas:** clean-code-reviewer · ddd-reviewer · clean-architecture-reviewer · anti-hacking-reviewer

---

## 1. Clean Code Review

### Findings

| ID | Severidade | Repo | Arquivo | Descrição | Plano de Ação |
|---|---|---|---|---|---|
| CC-001 | P1 | mob | `api/observations/[id].ts:99-225` | Handler PATCH tem 6 responsabilidades sequenciais: fetch, conflict detection, version insert, update, auditoria, resposta (126 linhas de lógica pura) | Extrair `saveVersionSnapshot(supabase, id, current, auth)` e `writeAuditLog(...)` como funções auxiliares no mesmo arquivo ou em `_lib/observationRepository.ts` |
| CC-002 | P1 | mob | `api/observations/[id].ts:45-64` vs `api/observations/index.ts:44-62` | Bloco SELECT com 14 colunas da tabela `observations` duplicado literalmente em dois handlers | Extrair `OBSERVATION_SELECT_COLUMNS` como constante em `observations/schema.ts` ou `observations/queries.ts` |
| CC-003 | P1 | mob | `api/observations/[id].ts:109-128` | Mesmo bloco SELECT de 14 colunas aparece uma terceira vez no mesmo arquivo (fetch pré-PATCH) | Mesma constante `OBSERVATION_SELECT_COLUMNS` do CC-002 |
| CC-004 | P2 | mob | `api/_lib/rateLimit.ts` | Magic strings `'auth'` e `'api'` como `keyPrefix` sem enum ou constante | Declarar `const RATE_LIMIT_KEYS = { auth: 'auth', api: 'api' } as const` no topo do arquivo |
| CC-005 | P2 | mob | `api/observations/versions/index.ts:111-225` | Handler PATCH resolve tem dois ramos distintos mais código comum sem separação visual; função de restore inlinada | Extrair `restoreStudentVersion(supabase, observationId, studentVersionId, obs)` como função auxiliar |
| CC-006 | P2 | mob | `api/instructor-student-links/[id].ts:49,96` | `new Date().toISOString()` chamado duas vezes inline em ramos diferentes do mesmo handler | Declarar `const now = new Date().toISOString()` uma vez no início do handler |
| CC-007 | P2 | mob | `api/observations/versions/index.ts:127` | Variável `obs` representa o registro pai `observations` — nome opaco que esconde o tipo | Renomear para `parentObservation` ou `currentObservation` |
| CC-008 | P2 | mob | `api/observations/versions/index.ts:158` | `studentData` refere-se ao campo `data` de uma `ObservationVersion`, não a perfil de aluna — nome enganoso no contexto do sistema | Renomear para `studentVersionData` ou `snapshotData` |
| CC-009 | P2 | mob | `api/observations/[id].ts:136-144` | Comentário de 8 linhas parafraseia a lógica de `detectConflict` que já está documentada em `_lib/vectorClock.ts` | Reduzir a uma linha: `// ADR-004: compare client clock vs DB clock — see vectorClock.detectConflict` |
| CC-010 | P2 | mob | `src/hooks/useObservationSync.ts:156` | `String(err)` expõe mensagem interna do browser (ex: `TypeError: Failed to fetch`) como `SyncResult.error` | Checar `instanceof TypeError` e retornar mensagem localizada antes de `String(err)` |
| CC-011 | P2 | mob | `src/hooks/usePushNotifications.ts:89-252` | Hook de 163 linhas acumula 5 responsabilidades: load, detecção de suporte, permissão, token FCM, update de preferências | Extrair `obtainAndPersistFcmToken(userId, accessToken)` separando a persistência do `obtainFcmToken` já existente |
| CC-012 | P3 | mob | `api/observations/index.ts:183-185` e similares | `import { handle } from 'hono/vercel'` colocado no final do arquivo após `export default app`, invertendo a convenção de imports no topo | Mover o import para o bloco de imports no topo |
| CC-013 | P3 | mob | `src/components/DayDetailModal.jsx:245` | TODO Sprint 3 inline: `useObservationVersions` recebe `null` como JWT — histórico de versões permanentemente vazio para observações sincronizadas | Criar issue de backlog; aceitar `jwt` como prop opcional em `DayDetailModal`; remover TODO inline |
| CC-014 | P3 | web | `src/pages/DashboardPage.tsx:25-31` vs `src/pages/LinksManagementPage.tsx:27-33` | Função `formatDate` definida duas vezes com implementação idêntica em dois arquivos de página | Mover para `billings-web/src/utils/format.ts` que já existe |
| CC-015 | P3 | web | `src/hooks/useStudentCycle.ts:54` | Assimetria entre nome interno `fetchData` e nome exportado `refresh` sem razão clara | Renomear internamente para `fetchStudentData` ou alinhar com o nome exportado `refresh` |

### Sumário Clean Code
3 P1 (todos DRY/SRP em handlers críticos), 9 P2, 4 P3. O padrão mais grave é a triplicação do bloco SELECT de observações e o handler PATCH com 6 responsabilidades — ambos aumentam o risco de regressão em modificações futuras.

---

## 2. DDD Review

### Findings

| ID | Severidade | Repo | Arquivo | Descrição | Plano de Ação |
|---|---|---|---|---|---|
| DDD-001 | P1 | mob | `api/observations/[id].ts:148-168` | `observation_versions` inserida diretamente pelo handler sem passar pela raiz do aggregate `Observation` — viola a invariante do aggregate | Criar função de domínio `createObservationVersion(observation, author)` que encapsula o insert; handler apenas orquestra |
| DDD-002 | P1 | mob | `api/observations/versions/index.ts:125-178` | Handler de resolução acessa `observation_versions` e `observations` como tabelas independentes, sem respeitar que `ObservationVersion` é parte do aggregate `Observation` | Encapsular restore em `applyVersionResolution(observation, version, resolution)`; handler delega a lógica |
| DDD-003 | P1 | mob/web | `api/observations/versions/index.ts:158` e `billings-web/src/types/index.ts:31` | Campo `data` de `observation_versions` tratado como `Record<string, unknown>` sem Value Object `ObservationSnapshot` — acesso a `studentData.stamp` sem garantia de tipo em runtime | Definir `ObservationSnapshot` como interface em `api/observations/schema.ts` e usar `z.parse` ao ler o campo `data` de uma versão |
| DDD-004 | P1 | web | `billings-web/src/types/index.ts:10` e `billings-mob/src/hooks/useObservationSync.ts:37` | `stamp: string` em vez de `Stamp` como Value Object — `StampValues` existe no mob mas não é exportado como tipo para o web | Exportar `type Stamp = typeof StampValues[number]` e usar em `Observation` e `ObservationVersionData` do billings-web |
| DDD-005 | P2 | web | `billings-web/src/types/index.ts:8-24` | Tipo `Observation` no billings-web omite `sensacao`, `tipo_observacao` e `version` que existem no banco e na schema Zod do mob | Adicionar os campos faltantes ao tipo `Observation` do billings-web ou extrair para pacote compartilhado `@billings/domain-types` |
| DDD-006 | P2 | web | `billings-web/src/types/index.ts:33` | `notes?` declarado como opcional em `ObservationVersion.data` — campo explicitamente banido por LGPD de estar nessa tabela; o tipo contradiz a invariante | Remover `notes?` do tipo `ObservationVersion.data` |
| DDD-007 | P2 | mob | `api/instructor-student-links/[id].ts:33-104` | Transições de estado do `InstructorStudentLink` (`pending→active`, `*/pending→revoked`) dispersas em condicionais no handler sem lógica de transição encapsulada | Extrair funções puras `canAccept(link)`, `canRevoke(link, actor)` que validam a transição |
| DDD-008 | P2 | mob | `api/instructor-student-links/[id].ts:85-104` | Revogar um vínculo já revogado não retorna `400` — aceita silenciosamente e re-aplica o update | Adicionar `if (link.status === 'revoked') return badRequest(c, 'Link is already revoked')` antes do update |
| DDD-009 | P2 | mob | `src/hooks/useInstructorLink.ts:71-84` | Acessa `supabase.from('user_profiles')` diretamente do frontend, bypassando a API — cria dois caminhos de acesso ao bounded context `user` | Documentar como ADR; criar `GET /api/users/search?role=instructor&email=` como endpoint futuro |
| DDD-010 | P3 | mob | `api/_lib/notifications/NotificationEvent.ts` | `recipientId: string` sem tipo de domínio — não distingue `InstructorId` de `StudentId` | Documentar no JSDoc de cada `type` qual papel é esperado; idealmente usar branded types |
| DDD-011 | P3 | mob | `api/_lib/notifications/factory.ts:19-32` | Singleton `NotificationService` não tem fallback se `createServiceClient()` lançar na primeira chamada — subsequentes calls re-lançam indefinidamente | Capturar e retornar um `NullNotificationService` que loga e não envia |
| DDD-012 | P3 | mob/web | Global | Tipo `Aluna` e `Instrutora` nunca existem como tipos TypeScript de domínio — verificações de papel (`auth.role !== 'instructor'`) repetidas em 4 handlers | Criar `type InstructorAuth = AuthContext & { role: 'instructor' }` e função `requireInstructorAuth(auth)` centralizada |

### Sumário DDD
4 P1 (violações de aggregate boundary e ausência de Value Objects), 5 P2, 3 P3. A violação mais grave é a criação direta de `observation_versions` fora do aggregate root, que já estava marcada como pré-existente mas não foi endereçada.

---

## 3. Clean Architecture Review

### Findings

| ID | Severidade | Repo | Arquivo | Descrição | Plano de Ação |
|---|---|---|---|---|---|
| CA-001 | P1 | mob | `api/observations/index.ts:17-18`, `api/observations/[id].ts:17-19`, `api/cycles/index.ts:15`, `api/instructor-student-links/index.ts:5`, `api/instructor-student-links/[id].ts:5`, `api/users/me.ts:4`, `api/users/push-preferences/index.ts:27` | Todos os handlers Hono (Presentation) acessam Supabase SDK (Infrastructure) diretamente sem camada Application (Repository) entre elas — lógica de query SQL inlinada nos handlers | Introduzir `ObservationRepository`, `CycleRepository`, `LinkRepository` como interfaces em Application; implementações em Infrastructure; handlers chamam apenas repositories |
| CA-002 | P1 | web | `billings-web/src/hooks/useStudents.ts:76-101` e `src/hooks/useStudentCycle.ts:97-119` | Hooks React (Application) importam e usam `supabase.channel()` / `supabase.removeChannel()` (Infrastructure Realtime) diretamente | Criar interface `ObservationFeed` com `subscribe(studentId, callback)`; hook usa a interface; implementação Supabase fica em Infrastructure |
| CA-003 | P1 | mob | `src/hooks/useInstructorLink.ts:71-84` | Hook React (Application) acessa `supabase.from('user_profiles')` (Infrastructure) diretamente para dados de negócio — único lugar no frontend PWA que bypassa a camada API REST | Criar `GET /api/users/search?role=instructor&email=`; hook usa fetch como todos os demais |
| CA-004 | P2 | mob | `api/_lib/notifications/NotificationService.ts:22-43` | `NotificationService` (Application) recebe `SupabaseClient` (Infrastructure concreta) como dependência — viola Dependency Rule | Definir `NotificationDataPort` com métodos `fetchPreferences`, `fetchUserPhone`, `recordRateLimit`; `NotificationService` recebe a interface |
| CA-005 | P2 | mob | `api/_lib/auth.ts:81-88` | Middleware `requireAuth` mistura autenticação (Infrastructure — verificar JWT) com resolução de papel de domínio (Application — query `user_profiles`) gerando 2 queries Supabase por request | Separar `authenticateRequest(jwt)` de `resolveUserRole(userId, supabase)`; middleware orquestra os dois |
| CA-006 | P2 | mob | `api/_lib/notifications/factory.ts:17-30` | Factory cria `NotificationService` passando `SupabaseClient` concreto — acoplada à dependência concreta, não à interface de porta | Após introdução de `NotificationDataPort`, atualizar factory para injetar `SupabaseNotificationAdapter` |
| CA-007 | P3 | web | `billings-web/src/types/index.ts:58-66` | `StudentProfile` mistura entidade de domínio com DTO de resposta da API (`last_observation_date`, `current_cycle_day` são campos computados) | Separar `StudentProfileDTO` (shape da resposta HTTP) de `StudentProfile` (entidade de domínio) |
| CA-008 | P3 | mob | `api/observations/index.ts:183`, `api/observations/[id].ts:231`, etc. | `import { handle } from 'hono/vercel'` posicionado no final dos arquivos após `export default app` — fora do bloco de imports | Mover para o bloco de imports no topo de cada arquivo de handler |

### Sumário Clean Architecture
3 P1 (acesso direto à Infrastructure em todos os handlers e dois hooks críticos), 3 P2, 2 P3. As violações P1 são aceitáveis no MVP atual mas devem ser tratadas como dívida técnica com prazo definido — a ausência de Repository layer é o maior risco de manutenção a longo prazo.

---

## 4. Anti-Hacking Review

### 4.1 Chaves de API expostas

| ID | Severidade | Arquivo | Descrição | Plano de Ação |
|---|---|---|---|---|
| AH-001 | P1 | `billings-mob/.env.local:1-2` | `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com valores reais presentes no arquivo — verificar se `.env.local` está rastreado pelo git | Executar `git ls-files billings-mob/.env.local`; se rastreado, remover com `git rm --cached` e confirmar que `.gitignore` cobre `.env*.local` |
| AH-002 | OK | `billings-mob/.env.example` | Todos os valores vazios — template correto | Sem ação necessária |
| AH-003 | OK | `billings-web/.env.example` | Todos os valores vazios — template correto | Sem ação necessária |
| AH-004 | OK | `billings-mob/.env.production` | Apenas `VITE_AUTH_REDIRECT_URL` sem secrets | Sem ação necessária |
| AH-005 | OK | Código-fonte (`api/`, `src/`) | Nenhuma chave hardcoded encontrada no código-fonte | Sem ação necessária |

### 4.2 Inputs sem validação Zod

| Endpoint | Método | Tem Zod? | Schema `.strict()`? | Risco |
|---|---|---|---|---|
| `/api/observations` | GET | Sim (`ListObservationsQuerySchema`) | Não (query params — aceitável) | Baixo |
| `/api/observations` | POST | Sim (`CreateObservationSchema`) | Não | Médio — AH-007 |
| `/api/observations/:id` | GET | Não (path param UUID apenas) | N/A | Baixo — RLS filtra |
| `/api/observations/:id` | PATCH | Sim (`PatchObservationSchema`) | Sim | OK |
| `/api/observations/:id/versions` | GET | Não (path param UUID apenas) | N/A | Baixo |
| `/api/observations/versions/pending` | GET | Não (sem params) | N/A | OK |
| `/api/observations/versions/:id/resolve` | PATCH | Sim (`ResolveConflictSchema`) | **Não** | Médio — AH-006 |
| `/api/cycles` | GET | Não (sem params) | N/A | OK |
| `/api/cycles` | POST | Sim (`CreateCycleSchema`) | **Não** | Médio — AH-007 |
| `/api/cycles/:id` | GET | Não (path param UUID apenas) | N/A | Baixo |
| `/api/cycles/:id` | PATCH | Sim (`PatchCycleSchema`) | Sim | OK |
| `/api/instructor-student-links` | GET | Não (sem params) | N/A | OK |
| `/api/instructor-student-links` | POST | Sim (`CreateLinkSchema`) | **Não** | Médio — AH-007 |
| `/api/instructor-student-links/:id` | PATCH | Sim (`PatchLinkSchema`) | Sim | OK |
| `/api/instructor-student-links/pending` | GET | Não (sem params) | N/A | OK |
| `/api/users/me` | GET | Não (sem params) | N/A | OK |
| `/api/users/push-preferences` | GET | Não (sem params) | N/A | OK |
| `/api/users/push-preferences` | PUT | Sim (manual `safeParse`) | Sim | Médio — não usa `zValidator` — AH-005 |
| `/api/webhooks/whatsapp` | GET | Não | N/A | OK |
| `/api/webhooks/whatsapp` | POST | Não | N/A | **P1 — AH-002** |

### 4.3 Rate limit por endpoint

| Endpoint | Tem `apiRateLimit`? | Limite configurado | Risco |
|---|---|---|---|
| GET /api/observations | Sim | 60req/60s (antes de auth) | OK |
| POST /api/observations | Sim | 60req/60s (antes de auth) | OK |
| GET /api/observations/:id | Sim | 60req/60s (antes de auth) | OK |
| PATCH /api/observations/:id | Sim | 60req/60s (antes de auth) | OK |
| GET /api/observations/:id/versions | Sim | 60req/60s (antes de auth) | OK |
| GET /api/observations/versions/pending | Sim | 60req/60s (antes de auth) | OK |
| PATCH /api/observations/versions/:id/resolve | Sim | 60req/60s (antes de auth) | OK |
| GET /api/cycles | Sim | 60req/60s (antes de auth) | OK |
| POST /api/cycles | Sim | 60req/60s (antes de auth) | OK |
| GET /api/cycles/:id | Sim | 60req/60s (antes de auth) | OK |
| PATCH /api/cycles/:id | Sim | 60req/60s (antes de auth) | OK |
| GET /api/instructor-student-links | Sim | 60req/60s (antes de auth) | OK |
| POST /api/instructor-student-links | Sim | 60req/60s (antes de auth) | OK |
| PATCH /api/instructor-student-links/:id | Sim | 60req/60s (antes de auth) | OK |
| GET /api/instructor-student-links/pending | Sim | 60req/60s (antes de auth) | OK |
| GET /api/users/me | Sim (`authRateLimit`) | 10req/60s (antes de auth) | OK |
| GET /api/users/push-preferences | Sim (`prefsRateLimit`) | 30req/60s (antes de auth) | OK |
| PUT /api/users/push-preferences | Sim (`prefsRateLimit`) | 30req/60s (antes de auth) | OK |
| GET /api/webhooks/whatsapp | **Não** | Ilimitado | Baixo (handshake único) |
| POST /api/webhooks/whatsapp | **Não** | Ilimitado | **Médio — AH-009** |
| Rate limit em geral | In-memory por instância Vercel | Não global | **Médio — AH-004** |

### 4.4 Outros findings OWASP

| ID | Severidade | Arquivo | Descrição | Plano de Ação |
|---|---|---|---|---|
| AH-002 | P1 | `api/webhooks/whatsapp.ts:48-53` | OWASP A07: POST handler aceita qualquer payload sem verificar `X-Hub-Signature-256` — qualquer ator pode enviar requests forjados | Verificar HMAC-SHA256 do header `X-Hub-Signature-256` usando `WHATSAPP_WEBHOOK_VERIFY_TOKEN` como segredo; rejeitar com 403 se inválido |
| AH-003 | P1 | `billings-mob/.env.local:1-2` | OWASP A02: credentials reais em arquivo possivelmente rastreado pelo git | `git ls-files .env.local`; se rastreado, `git rm --cached` + invalidar e rotacionar chaves se necessário |
| AH-004 | P2 | `api/_lib/rateLimit.ts:30` | OWASP A04: rate limit in-memory não é global entre instâncias Vercel — brute-force distribuído não é bloqueado | Migrar para Upstash Redis Ratelimit na Sprint 7; criar item no backlog com prioridade alta |
| AH-005 | P2 | `api/users/push-preferences/index.ts:120-135` | OWASP A03: PUT handler usa `safeParse` manual em vez de `zValidator` — inconsistência de padrão que pode causar regressão futura | Substituir por `zValidator('json', PutPreferencesSchema)` e usar `c.req.valid('json')` |
| AH-006 | P2 | `api/observations/versions/index.ts:39-57` | OWASP A03: `ResolveConflictSchema` sem `.strict()` — campos extras no payload não são rejeitados | Adicionar `.strict()` antes do `.refine()` |
| AH-007 | P2 | `api/observations/schema.ts:28-42`, `api/cycles/schema.ts:11`, `api/instructor-student-links/schema.ts:3` | OWASP A03: `CreateObservationSchema`, `CreateCycleSchema`, `CreateLinkSchema` sem `.strict()` — mass assignment possível se handler usar spread do body futuramente | Adicionar `.strict()` aos três schemas de criação |
| AH-008 | P2 | `api/observations/schema.ts:75` | OWASP A03: `client_vector_clock: z.record(z.string(), z.number())` aceita valores arbitrariamente altos — clock inflado pode forçar `detectConflict` a retornar `false`, mascarando conflitos reais | Mudar para `z.record(z.string(), z.number().int().min(0).max(10000))` |
| AH-009 | P3 | `api/webhooks/whatsapp.ts` | OWASP A04: endpoints GET e POST do webhook sem rate limit — POST pode receber alta frequência de chamadas do Meta | Adicionar rate limit generoso (300req/60s) para evitar sobrecarga |
| AH-010 | P3 | `billings-web/src/hooks/useStudentCycle.ts:54` | OWASP A03: `student_id` interpolado em URL sem `encodeURIComponent` — seguro para UUIDs mas prática defensiva ausente | Aplicar `encodeURIComponent(studentId)` na interpolação de URL |
| AH-011 | P3 | `api/_lib/auth.ts` | OWASP A07: JWT não tem validação de formato antes de chamar `supabase.auth.getUser()` — payload de 1MB causaria round-trip desnecessário ao Supabase Auth | Adicionar check rápido de formato JWT (`/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt)`) antes de `getUser()` |

### Sumário Anti-Hacking
2 críticos (webhook sem HMAC e possível secret no git), 3 altos (rate limit in-memory, PUT sem zValidator, schema sem .strict()), 4 médios, 2 baixos. A coverage de rate limit está boa em todos os endpoints autenticados. Os schemas de CREATE precisam de `.strict()` para consistência com os de PATCH.

---

## 5. Plano de Ação Consolidado

### P1 — Críticos (resolver antes do lançamento)

| ID | Descrição | Sprint Alvo |
|---|---|---|
| AH-002 | Implementar validação HMAC-SHA256 no webhook POST `/api/webhooks/whatsapp` | Sprint 7 |
| AH-003 / AH-001 | Verificar e remover `billings-mob/.env.local` do rastreamento git; rotacionar chaves se necessário | Imediato |
| CC-001 | Extrair responsabilidades do handler PATCH `observations/[id].ts` (126 linhas, 6 responsabilidades) | Sprint 7 |
| CC-002 / CC-003 | Extrair constante `OBSERVATION_SELECT_COLUMNS` — bloco SELECT duplicado 3 vezes | Sprint 7 |
| DDD-001 | Encapsular criação de `observation_versions` via raiz do aggregate `Observation` | Sprint 8 |
| DDD-002 | Encapsular resolução de conflito em função de domínio em vez de handler direto | Sprint 8 |
| DDD-003 | Definir Value Object `ObservationSnapshot` com `z.parse` ao ler campo `data` | Sprint 7 |
| DDD-004 | Exportar `type Stamp` como Value Object e usar em tipos do billings-web | Sprint 7 |
| CA-001 | Introduzir Repository layer entre handlers Hono e Supabase SDK (dívida técnica documentada) | Sprint 9 |
| CA-002 | Abstrair Supabase Realtime de hooks React via interface `ObservationFeed` | Sprint 9 |
| CA-003 | Criar `GET /api/users/search?role=instructor&email=` e migrar `useInstructorLink` | Sprint 8 |

### P2 — Importantes (Sprint 7)

| ID | Descrição | Sprint Alvo |
|---|---|---|
| AH-004 | Migrar rate limit para Upstash Redis (global entre instâncias Vercel) | Sprint 7 |
| AH-005 | Substituir `safeParse` manual no PUT `/api/users/push-preferences` por `zValidator` | Sprint 7 |
| AH-006 | Adicionar `.strict()` ao `ResolveConflictSchema` | Sprint 7 |
| AH-007 | Adicionar `.strict()` a `CreateObservationSchema`, `CreateCycleSchema`, `CreateLinkSchema` | Sprint 7 |
| AH-008 | Limitar valores de `client_vector_clock` com `z.number().int().min(0).max(10000)` | Sprint 7 |
| DDD-006 | Remover `notes?` do tipo `ObservationVersion.data` no billings-web (violação LGPD no tipo) | Sprint 7 |
| DDD-005 | Adicionar `sensacao`, `tipo_observacao`, `version` ao tipo `Observation` do billings-web | Sprint 7 |
| DDD-007 | Extrair funções `canAccept(link)`, `canRevoke(link, actor)` para encapsular transições de estado do `InstructorStudentLink` | Sprint 8 |
| DDD-008 | Retornar `400 Bad Request` ao tentar revogar vínculo já revogado | Sprint 7 |
| CC-004 | Declarar `RATE_LIMIT_KEYS` constante em `rateLimit.ts` | Sprint 7 |
| CC-005 | Extrair `restoreStudentVersion` do handler de resolução de conflito | Sprint 8 |
| CC-006 | Declarar `const now` uma vez no handler de links em vez de 2 chamadas inline | Sprint 7 |
| CC-010 | Tratar `instanceof TypeError` em `useObservationSync.ts` antes de `String(err)` | Sprint 7 |
| CA-004 | Definir `NotificationDataPort` e fazer `NotificationService` depender da interface | Sprint 9 |
| CA-005 | Separar autenticação de resolução de papel no middleware `requireAuth` | Sprint 8 |
| CA-007 | Separar `StudentProfileDTO` de `StudentProfile` no billings-web | Sprint 8 |

### P3 — Melhorias (backlog)

| ID | Descrição | Sprint Alvo |
|---|---|---|
| AH-009 | Adicionar rate limit generoso (300req/60s) ao webhook WhatsApp | Backlog |
| AH-010 | Aplicar `encodeURIComponent` em interpolações de URL com `student_id` | Backlog |
| AH-011 | Validar formato JWT com regex antes de chamar `supabase.auth.getUser()` | Backlog |
| CC-007 | Renomear `obs` para `parentObservation` em `observations/versions/index.ts` | Backlog |
| CC-008 | Renomear `studentData` para `studentVersionData` | Backlog |
| CC-009 | Reduzir comentário de 8 linhas sobre `detectConflict` para referência de 1 linha | Backlog |
| CC-011 | Extrair `obtainAndPersistFcmToken` do hook `usePushNotifications` | Backlog |
| CC-012 | Mover imports `hono/vercel` para o topo dos arquivos de handler | Backlog |
| CC-013 | Criar issue de backlog para JWT prop em `DayDetailModal`; remover TODO inline | Sprint 7 |
| CC-014 | Mover `formatDate` duplicado para `billings-web/src/utils/format.ts` | Backlog |
| CC-015 | Alinhar nome interno `fetchData` com nome exportado `refresh` em `useStudentCycle` | Backlog |
| DDD-010 | Documentar papel esperado em `recipientId` de cada `NotificationEvent.type` | Backlog |
| DDD-011 | Implementar `NullNotificationService` como fallback se `createServiceClient` falhar | Backlog |
| DDD-012 | Criar `type InstructorAuth` e `requireInstructorAuth()` centralizando verificações de papel | Backlog |
| CA-006 | Atualizar factory de `NotificationService` para injetar adapter ao invés de cliente concreto | Sprint 9 |
| CA-008 | Mover imports `hono/vercel` para o topo dos handlers (duplicado de CC-012) | Backlog |

---

*Gerado por code-reviewer em 2026-06-05 com base em leitura direta do código-fonte.*
*Nenhuma alteração foi feita ao código durante esta auditoria.*
