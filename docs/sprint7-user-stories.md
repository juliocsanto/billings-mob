# Sprint 7 — User Stories com Acceptance Criteria

> Autor: product-manager (Stage 2)
> Data: 2026-06-05
> Sprint: 7 — Billing (Asaas) + Guia IA (Claude Streaming) + Lancamento Publico
> Repos afetados: billings-mob, billings-web
> Restricao clinica inviolavel: nenhuma UI, mensagem, resposta de IA ou dado enviado a servico externo pode usar os termos fertil, infertil, seguro, inseguro.
> Restricao LGPD principal: nenhum dado clinico (stamp, muco, sangramento, notas, relacoes, observations, cycles) e enviado ao Claude ou a qualquer servico externo de IA. Dados de pagamento obedecem PCI-DSS (tokenizacao pelo Asaas — nunca armazenados na API propria).

---

## Bloco 1 — Billing: Assinatura Instrutora via Asaas

### US-S7-01 — Instrutora assina o plano mensal ou anual

**Como instrutora, quero acessar a tela de assinatura no dashboard, escolher meu plano e pagar via PIX, cartao ou boleto para ter acesso completo ao painel profissional.**

Prioridade MoSCoW: **Must Have**

**Restricao LGPD:** A tela de checkout redireciona para o ambiente do Asaas. Nenhum dado de cartao transita pela API Billings. O retorno do webhook Asaas contem apenas o ID do pagamento e o status — nunca dados clinicos.

**Acceptance Criteria:**

AC-S7-01-1: Acesso a tela de planos
```
Given a instrutora esta autenticada no billings-web
And sua assinatura esta inativa, expirada ou nunca foi criada
When acessa o menu "Assinatura" ou e redirecionada automaticamente ao tentar acessar o dashboard
Then o sistema exibe a tela de planos com as opcoes: Mensal (R$ 47/mes) e Anual (R$ 197/ano)
And cada plano exibe os beneficios incluidos (dashboard de alunas, exportacao PDF, resolucao de conflitos)
And o plano atual (se houver) e destacado com o status atual (ativo, expirado, suspenso)
```

AC-S7-01-2: Checkout redirecionado ao Asaas
```
Given a instrutora esta na tela de planos
When seleciona um plano e clica em "Assinar agora"
Then o sistema cria uma assinatura via POST /api/billing/subscribe
And o endpoint retorna uma URL de checkout do Asaas
And o browser redireciona a instrutora para o checkout Asaas em nova aba ou na mesma aba
And o sistema registra o billing_subscription com status "pending" e o asaas_subscription_id
```

AC-S7-01-3: Webhook Asaas ativa a assinatura
```
Given a instrutora concluiu o pagamento no ambiente Asaas (PIX, cartao ou boleto)
When o Asaas envia o webhook POST /api/billing/webhook com evento "PAYMENT_RECEIVED"
And a assinatura correspondente ao asaas_subscription_id e encontrada no banco
Then o sistema atualiza o billing_subscription.status para "active"
And preenche active_until com a data de expiracao calculada pelo plano
And a instrutora passa a ter acesso completo ao dashboard sem necessidade de recarregar manualmente
And o webhook retorna HTTP 200 para o Asaas confirmar o recebimento
```

AC-S7-01-4: Acesso bloqueado graciosamente sem assinatura ativa
```
Given a instrutora acessa o billings-web
And sua assinatura esta com status "pending", "expired" ou "suspended"
When tenta acessar qualquer rota protegida do dashboard (alunas, grafico, conflitos, PDF)
Then o sistema redireciona para a tela de planos com uma mensagem clara: "Sua assinatura esta inativa. Escolha um plano para continuar."
And os dados das alunas NAO sao deletados — permanecem no banco preservados
And a instrutora pode retomar a assinatura a qualquer momento sem perder historico
```

AC-S7-01-5: Feedback de pagamento pendente (boleto/PIX)
```
Given a instrutora escolheu pagar por boleto ou PIX
And o Asaas ainda nao confirmou o pagamento
When a instrutora retorna ao billings-web apos gerar o boleto/QR Code
Then o sistema exibe um banner informativo: "Aguardando confirmacao do seu pagamento. Isso pode levar ate 2 dias uteis para boleto."
And o dashboard permanece bloqueado ate confirmacao via webhook
And a instrutora pode visualizar o codigo de boleto/PIX copiavel na tela de status
```

**Definition of Ready:**
- [ ] Schema billing_subscriptions criado: campos id, instructor_id, asaas_subscription_id, plan (monthly/annual), status (pending/active/expired/suspended/canceled), active_until, created_at, updated_at
- [ ] Endpoint POST /api/billing/subscribe implementado (S7-08 — fullstack-developer)
- [ ] Endpoint GET /api/billing/status implementado (S7-08)
- [ ] Endpoint POST /api/billing/webhook implementado com HMAC-SHA256 Asaas (S7-08)
- [ ] AsaasPort interface + MockAdapter + CloudAdapter definidos (S7-07)
- [ ] Guard de rota billings-web: RequireActiveSubscription component
- [ ] Estimativa: 8 story points

---

### US-S7-02 — Instrutora visualiza status atual da assinatura e historico

**Como instrutora, quero ver em um unico lugar o status da minha assinatura, a data de renovacao e o historico de pagamentos para ter controle financeiro.**

Prioridade MoSCoW: **Must Have**

**Restricao LGPD:** A tela de billing exibe apenas dados financeiros da propria instrutora autenticada. RLS garante que uma instrutora nunca ve dados de outra. Historico de pagamentos nao contem dados clinicos.

**Acceptance Criteria:**

AC-S7-02-1: Tela de status da assinatura
```
Given a instrutora esta autenticada e possui assinatura ativa
When acessa o menu "Assinatura > Minha Conta"
Then o sistema exibe: plano atual (Mensal ou Anual), status (Ativo), data de proxima renovacao
And exibe o numero total de alunas vinculadas ativas
And exibe link "Gerenciar ou cancelar assinatura" apontando para o portal Asaas
```

AC-S7-02-2: Assinatura proxima do vencimento
```
Given a assinatura da instrutora vence nos proximos 7 dias
When a instrutora acessa qualquer tela do billings-web
Then o sistema exibe um banner de aviso: "Sua assinatura vence em X dias. Renove agora para continuar sem interrupcao."
And o banner tem link direto para a tela de planos
And o banner pode ser dispensado (dismissed) e nao reaparece na mesma sessao
```

AC-S7-02-3: Assinatura expirada — acesso suspenso com degradacao graceful
```
Given a assinatura da instrutora expirou (active_until < NOW())
And o Asaas nao enviou webhook de renovacao
When a instrutora tenta acessar o dashboard
Then o sistema suspende o acesso ao dashboard (status atualizado para "expired")
And exibe tela de reativacao com opcao de renovar o mesmo plano ou mudar de plano
And envia email de notificacao de expiracao para a instrutora (via Supabase Auth ou servico de email)
And os dados das alunas sao preservados integralmente no banco
```

**Definition of Ready:**
- [ ] US-S7-01 concluida (dependencia direta)
- [ ] Cron job ou webhook recorrente do Asaas para renovacoes confirmado no ADR
- [ ] Template de email de expiracao aprovado (sem dados clinicos)
- [ ] Estimativa: 3 story points

---

### US-S7-03 — Alunas so aparecem no dashboard de instrutoras com assinatura ativa

**Como produto, quero garantir que uma instrutora sem assinatura ativa nao consiga ver os dados de suas alunas, protegendo o modelo de negocio e a privacidade das alunas.**

Prioridade MoSCoW: **Must Have**

**Restricao LGPD:** O bloqueio de acesso a dados de alunas por falta de assinatura e uma medida de controle de acesso (LGPD Art. 6, I — finalidade). Os dados das alunas nao sao deletados, apenas inacessiveis para a instrutora durante o periodo sem assinatura. Isso preserva a autonomia da aluna sobre seus proprios dados.

**Acceptance Criteria:**

AC-S7-03-1: Guard de acesso na API para instrutoras sem assinatura ativa
```
Given uma instrutora com status de assinatura "expired", "suspended" ou "pending"
When faz uma requisicao autenticada a qualquer endpoint de dados de alunas (GET /api/students, GET /api/observations, GET /api/cycles)
Then a API retorna HTTP 402 Payment Required com corpo: {"error": "subscription_required", "message": "Active subscription required"}
And nenhum dado de aluna e retornado na resposta
And o bloqueio e aplicado em nivel de middleware, antes de qualquer query ao banco
```

AC-S7-03-2: Aluna continua usando o MOB normalmente independente da assinatura da instrutora
```
Given a instrutora da aluna Z teve sua assinatura expirada
When a aluna Z registra uma nova observacao no billings-mob
Then o registro e criado normalmente na API (POST /api/observations retorna 201)
And a aluna Z continua tendo acesso completo ao seu historico, grafico e exportacao PDF
And a aluna Z nao recebe nenhuma notificacao sobre o status da assinatura da instrutora
```

AC-S7-03-3: Dados de alunas restaurados imediatamente apos renovacao
```
Given uma instrutora tinha assinatura expirada com N alunas vinculadas
When a instrutora renova a assinatura e o webhook PAYMENT_RECEIVED e processado
Then o status da assinatura e atualizado para "active"
And imediatamente (sem delay) a instrutora consegue ver todas as N alunas no dashboard
And todos os registros de ciclo das alunas estao presentes e corretos — nenhum dado foi perdido
```

**Definition of Ready:**
- [ ] Middleware requireActiveSubscription implementado na API (verifica billing_subscriptions.status = 'active' AND active_until > NOW())
- [ ] US-S7-01 concluida
- [ ] Regra de isolamento documentada no ADR (instrutora sem assinatura ≠ aluna perde dados)
- [ ] Estimativa: 3 story points

---

## Bloco 2 — Guia IA: Claude Streaming via Supabase Edge

### US-S7-04 — Aluna faz uma pergunta sobre o Metodo Billings e recebe resposta em streaming

**Como aluna, quero digitar uma duvida sobre o Metodo Billings na aba "Guia" e receber uma explicacao clara e instantanea, sem precisar esperar a resposta completa carregar.**

Prioridade MoSCoW: **Must Have**

**Restricao LGPD CRITICA:** NENHUM dado clinico da aluna (stamps, observations, notes, relations, cycle_id, ciclo atual, historico de muco) e enviado ao Claude ou incluido no prompt. Apenas o texto digitado pela aluna na caixa de pergunta transita para a Edge Function. A Edge Function nao tem acesso ao banco de dados da aluna — ela e stateless em relacao aos dados clinicos.

**Restricao clinica:** As respostas do Claude NUNCA usam os termos: fertil, infertil, seguro, inseguro, periodo fertil, dias ferteis, janela de fertilidade, ou qualquer sinonimo que implique classificacao de dias do ciclo. O system prompt enforcea esta restricao. O QA deve verificar esta restricao em respostas de teste.

**Acceptance Criteria:**

AC-S7-04-1: Aluna acessa a aba Guia e ve a interface de chat
```
Given a aluna esta autenticada no PWA billings-mob
When toca na aba "Guia" na barra de navegacao inferior
Then o sistema exibe uma tela de chat com campo de entrada de texto e botao "Enviar"
And exibe uma mensagem de boas-vindas: "Oi! Sou o Guia do Metodo Billings. Tire suas duvidas sobre o metodo."
And exibe um aviso visivel: "Suas informacoes de ciclo e observacoes nao sao compartilhadas aqui."
And o historico de mensagens da sessao atual e exibido acima do campo de entrada
```

AC-S7-04-2: Resposta em streaming (tokens chegam progressivamente)
```
Given a aluna digitou uma pergunta no campo de texto (ex: "O que e o padrao basico de infertilidade?")
When clica em "Enviar" ou pressiona Enter
Then o sistema envia a pergunta para a Supabase Edge Function /functions/v1/ai-guide
And a Edge Function chama o Claude claude-sonnet-4-6 com streaming habilitado
And os tokens da resposta aparecem progressivamente na tela (efeito typewriter)
And a aluna ve a resposta sendo construida em tempo real, sem esperar o texto completo
And o campo de entrada fica desabilitado durante o streaming
And apos o streaming completar, o campo de entrada e reabilitado
```

AC-S7-04-3: Nenhum dado clinico da aluna e incluido no prompt (LGPD enforcement)
```
Given a aluna esta na aba Guia e digita qualquer pergunta
When o sistema constroi o payload para a Edge Function
Then o payload contem APENAS: { "question": "<texto digitado pela aluna>" }
And o payload NAO contem: user_id, cycle_id, observation_id, stamp, notes, relations, sangramento, muco
And a Edge Function NAO faz nenhuma query ao banco de dados de observacoes ou ciclos da aluna
And o audit_log registra apenas: usuario autenticado fez pergunta ao Guia (sem o texto da pergunta — dado pessoal)
```

AC-S7-04-4: Restricao clinica enforced — resposta sem termos proibidos
```
Given o Claude recebe a pergunta da aluna via Edge Function
And o system prompt instrui o Claude a nao usar termos de classificacao de ciclo
When o Claude gera a resposta
Then a resposta NAO contem os termos: fertil, infertil, seguro, inseguro, dias ferteis, periodo fertil, janela fertil, ou sinonimos equivalentes
And se a aluna perguntar "quais sao meus dias ferteis?", o Claude responde explicando que a classificacao e responsabilidade da instrutora treinada, sem classificar
And a resposta usa apenas linguagem descritiva do metodo (muco, padrao, apice, ciclo, ovulacao como evento fisiologico)
```

AC-S7-04-5: Tratamento de erro de streaming
```
Given a aluna enviou uma pergunta para o Guia
And a conexao com a Edge Function e interrompida ou o Claude retorna erro
When o streaming falha antes de completar
Then o sistema exibe uma mensagem de erro amigavel: "Nao foi possivel carregar a resposta. Tente novamente."
And o botao "Tentar novamente" e exibido
And o erro e capturado pelo Sentry sem incluir o texto da pergunta da aluna (dado pessoal — LGPD)
And a UI nao trava — a aluna pode digitar uma nova pergunta imediatamente
```

**Definition of Ready:**
- [ ] Supabase Edge Function /functions/v1/ai-guide criada com: autenticacao JWT Supabase, system prompt aprovado internamente (sem termos proibidos), chamada Claude API com stream: true, CORS configurado para billings-mob.vercel.app apenas
- [ ] ANTHROPIC_API_KEY configurada como secret na Edge Function (nunca exposta ao cliente)
- [ ] System prompt revisado pelo product-manager e pela instrutora piloto confirmando ausencia de termos proibidos
- [ ] Variavel de ambiente VITE_SUPABASE_EDGE_URL configurada no billings-mob
- [ ] Estimativa: 8 story points

---

### US-S7-05 — Aluna recebe respostas contextualizadas sobre o metodo (system prompt)

**Como aluna, quero que o Guia saiba responder sobre os fundamentos do Metodo Billings (sinais de muco, padrao basico, apice, ciclos irregulares) para que as respostas sejam educativas e corretas.**

Prioridade MoSCoW: **Must Have**

**Restricao clinica:** O sistema ensina o metodo descritivamente. A classificacao de qual dia e qual padrao pertence exclusivamente a instrutora.

**Acceptance Criteria:**

AC-S7-05-1: Guia responde perguntas sobre sinais de muco
```
Given a aluna pergunta "Como identifico o muco do tipo apice?"
When o Claude processa a pergunta com o system prompt do Metodo Billings
Then a resposta descreve as caracteristicas observaveis do muco de apice (elastico, transparente, sensacao lubrificante) usando terminologia do Metodo Billings
And a resposta nao classifica o dia como fertil ou infertil
And a resposta incentiva a aluna a compartilhar a observacao com sua instrutora para orientacao personalizada
```

AC-S7-05-2: Guia responde perguntas sobre o padrao basico de infertilidade (PBI)
```
Given a aluna pergunta "O que e o padrao basico de infertilidade?"
When o Claude processa a pergunta
Then a resposta explica o conceito de PBI (ausencia de muco, sensacao seca) de forma educativa
And menciona que o reconhecimento do PBI individual de cada mulher e ensinado pela instrutora
And nao usa termos que impliquem seguranca ou inseguranca do ciclo
```

AC-S7-05-3: Guia reconhece os limites do seu papel e redireciona para a instrutora
```
Given a aluna pergunta algo que requer avaliacao clinica do ciclo especifico (ex: "Eu tive muco por 3 dias seguidos, e normal?")
When o Claude processa a pergunta
Then a resposta fornece contexto educativo sobre variabilidade de ciclos no metodo
And explicitamente direciona: "Para avaliar sua situacao especifica, compartilhe essa observacao com sua instrutora."
And nao emite julgamento sobre o ciclo da aluna
```

AC-S7-05-4: Guia responde em portugues brasileiro
```
Given a aluna esta com o app configurado em PT-BR
When envia qualquer pergunta (em portugues ou ingles)
Then o Claude responde sempre em portugues brasileiro
And usa terminologia do Metodo Billings conforme ensinada pela CENPLAFAM/WOOMB Internacional
```

**Definition of Ready:**
- [ ] System prompt redigido e aprovado (inclui: instrucoes do metodo Billings, lista de termos proibidos, instrucao de redirecionar para instrutora quando relevante, instrucao de responder em PT-BR)
- [ ] US-S7-04 concluida (dependencia direta — mesma Edge Function)
- [ ] Validacao do system prompt por pelo menos 1 instrutora CENPLAFAM/WOOMB
- [ ] Estimativa: 3 story points (incluso no esforco de S7-04 na maior parte; ponto adicional pela validacao)

---

### US-S7-06 — Instrutora pode revisar as perguntas anonimizadas feitas ao Guia

**Como instrutora, quero ter visibilidade agregada (sem identificacao das alunas) das perguntas mais frequentes feitas ao Guia para adaptar meu ensino presencial.**

Prioridade MoSCoW: **Could Have**

**Restricao LGPD:** As perguntas das alunas sao dados pessoais. Esta feature so pode ser implementada com anonimizacao total — nenhum user_id, nome ou identificador deve estar associado as perguntas no log da instrutora. O texto da pergunta em si pode conter dados pessoais implicitos — exibir apenas categorias tematicas agregadas, nunca o texto bruto.

**Acceptance Criteria:**

AC-S7-06-1: Dashboard de topicos frequentes (anonimizado)
```
Given a instrutora acessa o billings-web
When acessa a secao "Guia IA — Insights" (se implementada)
Then o sistema exibe apenas categorias tematicas agregadas (ex: "Muco: 12 perguntas esta semana", "PBI: 5 perguntas")
And NAO exibe o texto das perguntas individuais
And NAO associa nenhuma pergunta a nenhuma aluna especifica
And o total de perguntas por aluna NAO e exibido
```

AC-S7-06-2: Sem identificacao de aluna em nenhum dado exibido
```
Given a instrutora tem 10 alunas vinculadas
When visualiza o painel de insights do Guia
Then nenhum nome, email, foto ou identificador de aluna aparece associado a nenhuma pergunta ou categoria
And a instrutora nao pode inferir quem fez qual pergunta a partir dos dados exibidos
```

**Definition of Ready:**
- [ ] Decisao arquitetural sobre armazenamento de logs de perguntas (Edge Function deve logar apenas categoria tematica — nao o texto bruto — para viabilizar esta feature sem violar LGPD)
- [ ] CISO review aprovado para esta feature antes da implementacao
- [ ] US-S7-04 e US-S7-05 concluidas
- [ ] Estimativa: 5 story points
- [ ] ALERTA: Esta story SO entra no sprint apos CISO review confirmar que a anonimizacao e tecnicamente garantida. Se houver qualquer duvida, e parkada para V2.

---

## Bloco 3 — Lancamento Publico

### US-S7-07 — Instrutora interessada preenche formulario de cadastro e recebe email de boas-vindas

**Como instrutora que encontrou o Billings Grafico, quero preencher um formulario de interesse para criar minha conta e receber instrucoes de como comecar a usar o dashboard.**

Prioridade MoSCoW: **Must Have**

**Restricao LGPD:** O formulario de interesse coleta apenas: nome, email profissional e numero de alunas aproximado (dado nao-sensivel). Nenhum dado de saude e coletado no formulario de onboarding. O email de boas-vindas nao contem dados clinicos. O consentimento para receber comunicacoes deve ser explicito (checkbox com texto claro).

**Acceptance Criteria:**

AC-S7-07-1: Instrutora acessa a landing page e ve o formulario de cadastro
```
Given uma instrutora acessa https://billings-web.vercel.app/ (rota publica /)
When a pagina carrega
Then o sistema exibe a landing page com: descricao do produto, beneficios para instrutoras, formulario de interesse (nome, email, numero de alunas)
And exibe checkbox de consentimento: "Concordo em receber comunicacoes sobre o Billings Grafico"
And o formulario tem campo obrigatorio de email com validacao de formato
And a landing page e acessivel sem autenticacao
```

AC-S7-07-2: Formulario enviado com sucesso — email de boas-vindas disparado
```
Given a instrutora preencheu o formulario com nome, email valido e consentimento marcado
When clica em "Quero comecar" ou "Enviar"
Then o sistema cria um registro de interesse no banco (instructor_interest: nome, email, num_alunas, consented_at)
And dispara um email de boas-vindas para o email informado com: link para criar conta no billings-web, instrucoes de primeiros passos, link para agendar onboarding (Calendly ou similar)
And exibe mensagem de confirmacao na pagina: "Perfeito! Verifique seu email para comecar."
And o email NAO contem dados clinicos de nenhuma aluna
```

AC-S7-07-3: Validacao de email duplicado
```
Given o email informado ja existe na tabela instructor_interest ou em auth.users como instrutora
When a instrutora clica em "Enviar"
Then o sistema exibe mensagem: "Este email ja esta cadastrado. Acesse seu painel em /login."
And nao cria registro duplicado
And nao envia email duplicado
```

AC-S7-07-4: Onboarding de instrutoras alem das 5 beta — sem aprovacao manual necessaria
```
Given uma nova instrutora que nao e das 5 beta preenche o formulario e cria a conta
When a conta e criada via magic link no billings-web
Then a instrutora e criada com role "instructor" no user_profiles (trigger SECURITY DEFINER — Sprint 5 SEC-003)
And a instrutora tem acesso imediato a tela de planos para assinar
And NAO e necessario aprovacao manual do admin para liberar o acesso
And a instrutora pode comecar a adicionar alunas imediatamente apos assinar o plano
```

**Definition of Ready:**
- [ ] Tabela instructor_interest criada no schema (campos: id, name, email, num_students_approx, consented_at, created_at)
- [ ] Rota publica GET / configurada no billings-web (React Router — sem RequireInstructor guard)
- [ ] Endpoint POST /api/instructor-interest ou Supabase direct insert via anon key com RLS restritiva
- [ ] Template de email de boas-vindas redigido e aprovado (sem dados clinicos)
- [ ] Servico de envio de email configurado (Supabase Auth email ou Resend)
- [ ] Estimativa: 5 story points

---

### US-S7-08 — Instrutora e aluna encontram instrucoes de instalacao do PWA na landing page

**Como instrutora ou aluna que nao sabe o que e um PWA, quero encontrar instrucoes claras de como instalar o aplicativo no meu celular diretamente da landing page, sem precisar ir a App Store ou Google Play.**

Prioridade MoSCoW: **Should Have**

**Acceptance Criteria:**

AC-S7-08-1: Landing page exibe secao de instalacao para iOS e Android
```
Given um usuario (instrutora ou aluna) acessa a landing page no celular
When visualiza a secao "Como instalar o app"
Then o sistema exibe instrucoes passo a passo para iOS: "Safari > Compartilhar > Adicionar a Tela de Inicio"
And exibe instrucoes para Android: "Chrome > Menu > Adicionar a Tela inicial"
And cada instrucao tem icones ou screenshots ilustrativos
And a secao e responsiva e legivel em telas pequenas (320px+)
```

AC-S7-08-2: Banner de instalacao no PWA detecta dispositivo sem app instalado
```
Given a aluna acessa https://billings-mob.vercel.app/ pelo navegador do celular
And o PWA ainda nao esta instalado no dispositivo (standalone mode nao detectado)
When a pagina carrega
Then o sistema exibe um banner discreto (nao bloqueante): "Instale o app para acesso mais rapido. Toque aqui para ver como."
And o banner tem botao "Dispensar" que fecha o banner e nao o exibe novamente na semana
And ao tocar no banner, abre um modal com instrucoes de instalacao especificas para o SO detectado (iOS ou Android)
```

AC-S7-08-3: PWA ja instalado — banner nao e exibido
```
Given a aluna ja instalou o PWA e esta acessando em modo standalone (window.navigator.standalone = true ou display-mode: standalone)
When abre o app
Then o sistema NAO exibe o banner de instalacao
And a experiencia e identica a de um app nativo (sem barra de navegacao do browser)
```

AC-S7-08-4: Link "Ver no navegador" disponivel na landing page para desktop
```
Given um usuario acessa a landing page em um computador desktop
When visualiza a secao de instalacao
Then o sistema exibe instrucoes de instalacao PWA para desktop (Chrome: icone de instalacao na barra de endereco)
And tambem exibe link direto para https://billings-mob.vercel.app/ para alunas acessarem pelo browser desktop se preferirem
```

**Definition of Ready:**
- [ ] US-S7-07 concluida (landing page base ja existe)
- [ ] Componente InstallBanner implementado com deteccao de beforeinstallprompt (Android) e navigator.standalone (iOS)
- [ ] Criterio de dismissal persistido em localStorage (nao cookie — sem consentimento adicional necessario para dado nao-sensivel)
- [ ] Estimativa: 3 story points

---

### US-S7-09 — Landing page apresenta o produto e converte instrutoras em cadastros

**Como produto, quero que a landing page comunique claramente o valor do Billings Grafico para instrutoras CENPLAFAM/WOOMB e converta visitantes em cadastros, sem exigir conta para visualizar o conteudo publico.**

Prioridade MoSCoW: **Should Have**

**Acceptance Criteria:**

AC-S7-09-1: Conteudo principal visivel sem autenticacao
```
Given qualquer visitante acessa https://billings-web.vercel.app/
When a pagina carrega (sem autenticacao)
Then o sistema exibe: headline principal, proposta de valor (acompanhe suas alunas sem WhatsApp manual), secao de beneficios, formulario de interesse, secao de instalacao do app
And a pagina carrega em menos de 3 segundos em conexao 4G (LCP < 2.5s)
And a pagina e responsiva para mobile (min 320px) e desktop
And nenhum dado de instrutoras ou alunas cadastradas e exibido na pagina publica
```

AC-S7-09-2: Instrutora ja cadastrada e redirecionada para /login
```
Given uma instrutora que ja tem conta acessa a landing page /
When clica em "Entrar" ou "Acessar meu painel"
Then o sistema redireciona para /login
And o fluxo de magic link continua funcionando normalmente
```

AC-S7-09-3: Pagina respeita restricao clinica em todo o conteudo marketing
```
Given o copywriter redige o conteudo da landing page
When o conteudo e publicado
Then nenhuma frase, imagem, metadado ou texto alternativo de imagem usa os termos: fertil, infertil, seguro, inseguro, dias ferteis, periodo fertil ou equivalentes
And o conteudo descreve o produto como "ferramenta de registro e acompanhamento do Metodo Billings" sem classificar ciclos
```

**Definition of Ready:**
- [ ] Copywriting da landing page aprovado pela instrutora piloto e revisado quanto a restricoes clinicas
- [ ] Design da landing page definido (Wise-inspired design system — Sprint 6.5)
- [ ] Rota publica / sem RequireInstructor guard confirmada no React Router
- [ ] Meta tags (OG, Twitter Card, favicon) configuradas para SEO minimo
- [ ] Estimativa: 5 story points

---

## Resumo MoSCoW — Sprint 7

### Must Have (nao entrega Sprint 7 sem estes)

| ID | Historia | Story Points |
|----|----------|-------------|
| US-S7-01 | Instrutora assina plano mensal ou anual via Asaas | 8 |
| US-S7-02 | Instrutora visualiza status e historico da assinatura | 3 |
| US-S7-03 | Alunas so aparecem para instrutoras com assinatura ativa | 3 |
| US-S7-04 | Aluna faz pergunta ao Guia e recebe resposta em streaming | 8 |
| US-S7-05 | Guia responde com contexto do Metodo Billings (system prompt) | 3 |
| US-S7-07 | Instrutora preenche formulario e recebe email de boas-vindas | 5 |

**Total Must Have: 30 story points**

### Should Have (entrega no sprint se houver capacidade apos Must)

| ID | Historia | Story Points |
|----|----------|-------------|
| US-S7-08 | Instrucoes de instalacao PWA na landing page e no app | 3 |
| US-S7-09 | Landing page converte visitantes em cadastros | 5 |

**Total Should Have: 8 story points**

### Could Have (candidatos ao sprint somente se Must + Should forem concluidos antes do prazo)

| ID | Historia | Story Points |
|----|----------|-------------|
| US-S7-06 | Instrutora ve topicos frequentes anonimizados do Guia IA | 5 |

**Total Could Have: 5 story points**

**Total geral do sprint (Must + Should): 38 story points**

---

### Wont Have no Sprint 7 (parkado para V2 ou Sprint 8+)

| Feature | Motivo do park |
|---------|----------------|
| App nativo React Native (iOS/Android) | Fora do escopo MVP — PWA e suficiente para lancamento; native e Sprint 9+ |
| Analytics avancado com PostHog | Definido como out-of-scope no MVP boundary (ARCHITECTURE.md Stage 2) |
| Relatorio mensal automatico para instrutora | Out-of-scope MVP — Sprint 8+ |
| Guia IA com contexto do ciclo da aluna | Violaria LGPD hard constraint — nenhum dado clinico vai ao Claude. Jamais implementar sem CISO review e consentimento explicito da aluna |
| Pagamento por aluna (modelo SaaS per-seat) | Complexidade excessiva para lancamento — avaliar em Sprint 8 com dados reais de uso |
| Historico de perguntas ao Guia IA (por aluna, persistido) | Dado pessoal — requer consentimento adicional e avaliacao CISO; parkado para V2 |
| Suporte multilingue no Guia IA (EN/ES) | Should responder apenas em PT-BR no MVP; multilingue e Sprint 8+ |
| Portal de auto-servico Asaas (cancelamento dentro do app) | Instrutora usa portal Asaas diretamente via link; implementacao propria e Sprint 8+ |
| Programa de afiliados para instrutoras | Fora do escopo do produto atual; avaliar como feature separada |

---

## Definition of Ready — Sprint 7 (geral)

Uma historia esta pronta para entrar em desenvolvimento quando todos os criterios abaixo estao satisfeitos:

1. **Acceptance Criteria**: todos os ACs estao no formato Given/When/Then, sao testáveis e nao ambiguos. O QA consegue escrever um cenario de teste automatizado a partir de cada AC sem perguntar ao product-manager.

2. **Restricoes verificadas (inegociaveis):**
   - Nenhum AC usa os termos: fertil, infertil, seguro, inseguro, dias ferteis, periodo fertil, ou qualquer sinonimo de classificacao de ciclo
   - Nenhum dado clinico (stamp, observations, notes, relations, cycle_id) e enviado ao Claude ou a qualquer servico externo de IA
   - Dados de pagamento (numero de cartao, CVV) nunca transitam pela API Billings — apenas tokens/IDs do Asaas
   - Dados de uma aluna nunca sao exibidos para outra aluna ou para uma instrutora sem assinatura ativa
   - LGPD: consentimento explicito para qualquer nova coleta de dado pessoal

3. **Dependencias resolvidas**: todas as dependencias de stories anteriores estao marcadas CONCLUIDO no TODO.md ou sao dependencias internas do Sprint 7 explicitamente declaradas na story

4. **Estimativa validada pelo tech-lead**: story points revisados antes do sprint planning com base no esforco tecnico real

5. **Design aprovado**: wireframe ou descricao de UI suficiente para o desenvolvedor comecar sem ambiguidade. Para billing: fluxo de checkout Asaas mockado. Para Guia IA: mockup do estado de streaming. Para landing page: design Wise-inspired definido em Sprint 6.5

6. **Infra confirmada**:
   - Schema billing_subscriptions existe no banco ou migracao planejada
   - Supabase Edge Function /functions/v1/ai-guide criada (mesmo que stub)
   - ANTHROPIC_API_KEY configurada como secret na Edge Function
   - AsaasPort interface definida no ADR antes do inicio do S7-07

7. **CISO review**: stories que tocam em dados de pagamento (US-S7-01, US-S7-02, US-S7-03) e em IA com dados pessoais (US-S7-04, US-S7-05) devem ter CISO review concluido (S7-12) antes de entrar em producao — podem ser implementadas em paralelo mas nao deployed sem GO do CISO

---

## Alertas LGPD por Story

| Story | Categoria de dado tocada | Nivel de risco | Medida de controle obrigatoria |
|-------|--------------------------|----------------|-------------------------------|
| US-S7-01 | Dados financeiros da instrutora (plano, pagamento) | MEDIO | Tokenizacao pelo Asaas; API Billings nunca armazena dados de cartao; HTTPS enforced |
| US-S7-02 | Dados financeiros da instrutora | MEDIO | RLS: instrutora ve apenas seus proprios dados de billing; audit_log sem dados de pagamento |
| US-S7-03 | Dados clinicos das alunas (acesso controlado) | ALTO | Middleware requireActiveSubscription antes de qualquer query; dados preservados mesmo sem acesso |
| US-S7-04 | Pergunta da aluna (dado pessoal potencial) | ALTO | Pergunta NAO logada no banco; apenas categoria tematica se S7-06 implementada; Sentry sem texto da pergunta |
| US-S7-05 | Nenhum dado pessoal adicional | BAIXO | System prompt enforcea restricoes; validacao manual do output antes do lancamento |
| US-S7-06 | Perguntas anonimizadas (dado pessoal anonimizado) | ALTO | CISO review obrigatorio antes de implementar; exibir APENAS categorias agregadas, nunca texto bruto |
| US-S7-07 | Nome, email, numero de alunas da instrutora | MEDIO | Consentimento explicito (checkbox); dados coletados apenas para contato; retencao definida em politica de privacidade |
| US-S7-08 | Nenhum dado pessoal | BAIXO | localStorage para dismissal de banner — sem consentimento necessario para dado nao-sensivel |
| US-S7-09 | Nenhum dado de usuarios cadastrados exibido publicamente | BAIXO | Verificar que a landing page nao vaza lista de instrutoras ou alunas cadastradas |
