/**
 * E2E — Sistema de Feedback Comunitário (billings-mob).
 *
 * Cenários cobertos:
 *  C1 — Tab "Feedback" abre a FeedbackList com FAB e filtros visíveis
 *  C2 — Criar novo feedback: preenche form, submete, item aparece na lista
 *  C3 — Validação client-side: título curto (< 5 chars) bloqueia envio
 *  C4 — Validação client-side: conteúdo curto (< 10 chars) bloqueia envio
 *  C5 — Clicar num card abre FeedbackDetail e exibe thread de comentários
 *  C6 — Adicionar comentário numa thread existente
 *  C7 — Restrição clínica: nenhum termo proibido presente no DOM da página
 *
 * Estratégia:
 *  - Sessão Supabase simulada via localStorage (padrão de billing-ai-guide.spec.ts).
 *  - Todas as chamadas de rede interceptadas via page.route() — sem backend real.
 *  - API de feedback mockada com dados controláveis e determinísticos.
 *  - Nenhum teste depende de servidor rodando: todos são "offline-safe".
 *
 * RESTRIÇÃO CLÍNICA INVIOLÁVEL: nenhum teste usa ou verifica os termos
 * "fértil", "infértil", "seguro" ou "inseguro" — nem como texto esperado,
 * nem como valor de asserção positiva. O Cenário C7 CONFIRMA A AUSÊNCIA.
 * LGPD: nenhum teste acessa ou exibe os campos `relations` ou `notes`.
 */
import { test, expect, type Page } from '@playwright/test';
import type { FeedbackItem, FeedbackComment } from '../src/types/feedback';

// ── Shared mock session ───────────────────────────────────────────────────────

/**
 * expires_at MUST be a Unix timestamp (seconds) in the future.
 * The Supabase auth-js SDK validates sessions via _isValidSession(), which
 * checks for 'access_token', 'refresh_token', and 'expires_at' fields.
 * Without expires_at the session is considered invalid and removed from storage,
 * causing the AuthGate to render the login screen instead of the app.
 *
 * If expires_at is present but in the past, the SDK calls _callRefreshToken()
 * which makes a real network request — so we set it 1 hour in the future.
 */
const MOCK_STUDENT_SESSION = {
  access_token: 'mock-student-access-token',
  refresh_token: 'mock-student-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: 'mock-aluna-uuid-001',
    email: 'aluna@teste.com.br',
    user_metadata: { role: 'student', full_name: 'Maria Teste' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  },
};

// ── Shared mock feedback data ─────────────────────────────────────────────────

const MOCK_FEEDBACK_ITEM: FeedbackItem = {
  id: 'mock-feedback-uuid-001',
  author_id: 'mock-aluna-uuid-001',
  author_role: 'student',
  category: 'bug',
  title: 'Botão de registro não responde',
  content: 'Ao clicar no botão de registrar observação, nada acontece na primeira tentativa.',
  status: 'pending_triage',
  discount_applied: false,
  comment_count: 1,
  created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

const MOCK_COMMENT: FeedbackComment = {
  id: 'mock-comment-uuid-001',
  feedback_id: 'mock-feedback-uuid-001',
  author_id: 'mock-aluna-uuid-002',
  author_role: 'student',
  content: 'Tive o mesmo problema no meu dispositivo.',
  created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
};

const MOCK_NEW_COMMENT: FeedbackComment = {
  id: 'mock-comment-uuid-002',
  feedback_id: 'mock-feedback-uuid-001',
  author_id: 'mock-aluna-uuid-001',
  author_role: 'student',
  content: 'Comentário de teste E2E via Playwright.',
  created_at: new Date().toISOString(),
};

// ── Helper: setup sessão autenticada + mocks de rede ─────────────────────────

/**
 * Injeta sessão de aluna no localStorage e mocka todas as chamadas de rede
 * relevantes para os testes de feedback.
 *
 * @param feedbackItems — lista de itens a retornar em GET /api/feedback
 * @param feedbackDetail — detalhe a retornar em GET /api/feedback/:id
 * @param commentsAfterPost — comentários a retornar após POST de comentário
 */
async function setupStudentSession(
  page: Page,
  options: {
    feedbackItems?: FeedbackItem[];
    feedbackDetail?: FeedbackItem;
    existingComments?: FeedbackComment[];
    commentsAfterPost?: FeedbackComment[];
    createdFeedback?: FeedbackItem;
  } = {},
): Promise<void> {
  const {
    feedbackItems = [],
    feedbackDetail = MOCK_FEEDBACK_ITEM,
    existingComments = [MOCK_COMMENT],
    commentsAfterPost = [MOCK_COMMENT, MOCK_NEW_COMMENT],
    createdFeedback = {
      ...MOCK_FEEDBACK_ITEM,
      id: 'mock-feedback-uuid-new',
      title: 'Teste E2E',
      content: 'Conteudo de teste E2E com pelo menos 10 caracteres',
      created_at: new Date().toISOString(),
      comment_count: 0,
    },
  } = options;

  // 1. Injeta sessão no localStorage antes de qualquer navegação
  await page.addInitScript((session) => {
    const projectRef = 'gcwxwrjzbbqkuzcweyut';
    const key = `sb-${projectRef}-auth-token`;
    localStorage.setItem(key, JSON.stringify(session));
  }, MOCK_STUDENT_SESSION);

  // 2. Mock: token refresh do Supabase Auth
  await page.route('**/auth/v1/token**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STUDENT_SESSION),
    });
  });

  // 3. Mock: user endpoint do Supabase Auth
  await page.route('**/auth/v1/user**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user: MOCK_STUDENT_SESSION.user }, error: null }),
    });
  });

  // 4. Mock: Supabase REST (observações, ciclos, etc.) — retorna vazio
  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // 5. Mock de todas as chamadas /api/feedback/* e /api/feedback
  //
  // Estratégia: usar page.route com função de URL para capturar TODAS as variantes:
  //   - GET  /api/feedback                       → lista (com ou sem query string)
  //   - GET  /api/feedback?category=bug&limit=10 → lista filtrada
  //   - POST /api/feedback                       → criação
  //   - GET  /api/feedback/{uuid}                → detalhe
  //   - POST /api/feedback/{uuid}/comments       → adicionar comentário
  //   - POST /api/feedback/{uuid}/approve        → aprovar
  //
  // IMPORTANTE: no Playwright, '**/api/feedback' NÃO captura query strings.
  // Usamos uma função de match (URLPattern string com **) que captura tudo.
  let postCommentCallCount = 0;

  await page.route(
    (url) => url.pathname.startsWith('/api/feedback') || url.pathname.includes('/api/feedback'),
    (route) => {
      const req = route.request();
      const method = req.method();
      const pathname = new URL(req.url()).pathname;

      // POST /api/feedback/{id}/comments
      if (method === 'POST' && pathname.match(/\/api\/feedback\/[^/]+\/comments$/)) {
        postCommentCallCount++;
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: MOCK_NEW_COMMENT }),
        });
        return;
      }

      // POST /api/feedback (criação)
      if (method === 'POST' && pathname === '/api/feedback') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: createdFeedback }),
        });
        return;
      }

      // POST /api/feedback/{id}/approve|reject|deploy|final-approve
      if (method === 'POST' && pathname.match(/\/api\/feedback\/[^/]+\//)) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: feedbackDetail }),
        });
        return;
      }

      // GET /api/feedback/{id} — detalhe
      if (method === 'GET' && pathname.match(/\/api\/feedback\/[^/]+$/)) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: feedbackDetail,
            comments: postCommentCallCount > 0 ? commentsAfterPost : existingComments,
          }),
        });
        return;
      }

      // GET /api/feedback (listagem, com ou sem query string)
      if (method === 'GET' && pathname === '/api/feedback') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: feedbackItems,
            total: feedbackItems.length,
          }),
        });
        return;
      }

      // Fallback: continua para o servidor (não deve acontecer em testes)
      route.continue();
    },
  );

  // 6. Fallback: demais chamadas /api/* (billing, cycles, observations, etc.)
  await page.route(
    (url) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/feedback'),
    (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    },
  );
}

/**
 * Navega para a tab Feedback dentro do app autenticado.
 *
 * O App.jsx renderiza tabs como role="tab" com label "Feedback" (hardcoded, sem i18n).
 * Aguarda o app principal carregar (presença de qualquer role="tab" de navegação)
 * antes de procurar a tab Feedback.
 */
async function navigateToFeedbackTab(page: Page): Promise<void> {
  // Aguarda o app principal carregar — AuthGate deve ter resolvido a sessão.
  // O app renderiza um tablist de navegação assim que autenticado.
  // Usamos waitForFunction para aguardar até que role="tab" com texto "Feedback" apareça.
  await page.waitForFunction(
    () => {
      const tabs = document.querySelectorAll('[role="tab"]');
      return Array.from(tabs).some((t) => t.textContent?.includes('Feedback'));
    },
    undefined,
    { timeout: 15_000 },
  );

  // O app usa role="tab" para os botões de navegação — sem data-testid nos tabs do App.jsx
  // Pode haver dois tabuleiros (header + nav inferior) — clicamos no primeiro visível
  const feedbackTab = page.getByRole('tab', { name: 'Feedback' }).first();
  await feedbackTab.click();

  // Aguarda render da FeedbackList (cabeçalho "Sugestões da comunidade")
  await expect(page.getByText('Sugestões da comunidade')).toBeVisible({ timeout: 8_000 });
}

// ── Testes ────────────────────────────────────────────────────────────────────

test.describe('Feedback — Cenário C1: listar feedback (usuária autenticada)', () => {
  test('C1a — tab Feedback abre FeedbackList com lista vazia e FAB visível', async ({ page }) => {
    await setupStudentSession(page, { feedbackItems: [] });
    await page.goto('/');

    // Aguarda app carregar com sessão simulada
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Navega para a tab Feedback
    await navigateToFeedbackTab(page);

    // FAB "Nova sugestão" deve estar visível
    await expect(page.getByTestId('new-feedback-fab')).toBeVisible();

    // Filtros de categoria devem estar presentes
    await expect(page.getByTestId('filter-tab-all')).toBeVisible();
    await expect(page.getByTestId('filter-tab-bug')).toBeVisible();
    await expect(page.getByTestId('filter-tab-feature')).toBeVisible();
    await expect(page.getByTestId('filter-tab-improvement')).toBeVisible();

    // Estado vazio deve ser exibido (sem itens)
    await expect(page.getByText('Nenhuma sugestão ainda')).toBeVisible();

    // Título/header da seção deve estar visível
    await expect(page.getByText('Sugestões da comunidade')).toBeVisible();
  });

  test('C1b — tab Feedback com itens existentes exibe FeedbackCards', async ({ page }) => {
    await setupStudentSession(page, { feedbackItems: [MOCK_FEEDBACK_ITEM] });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    // Card do feedback mock deve aparecer com o testid dinâmico
    await expect(
      page.getByTestId(`feedback-card-${MOCK_FEEDBACK_ITEM.id}`)
    ).toBeVisible({ timeout: 8_000 });

    // Título do feedback deve estar visível no card
    await expect(page.getByText(MOCK_FEEDBACK_ITEM.title)).toBeVisible();

    // Status badge "Em análise" (pending_triage) deve estar visível
    await expect(page.getByText('Em análise')).toBeVisible();

    // FAB continua visível com itens na lista
    await expect(page.getByTestId('new-feedback-fab')).toBeVisible();
  });

  test('C1c — filtro de categoria filtra a lista corretamente', async ({ page }) => {
    const bugItem: FeedbackItem = { ...MOCK_FEEDBACK_ITEM, category: 'bug' };
    await setupStudentSession(page, { feedbackItems: [bugItem] });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    // Filtro "Erros" (bug) deve ser clicável
    const bugFilterTab = page.getByTestId('filter-tab-bug');
    await expect(bugFilterTab).toBeVisible();
    await bugFilterTab.click();

    // O filtro "Erros" deve estar selecionado (aria-selected)
    await expect(bugFilterTab).toHaveAttribute('aria-selected', 'true');

    // Filtro "Todos" deve estar deselecionado
    await expect(page.getByTestId('filter-tab-all')).toHaveAttribute('aria-selected', 'false');
  });
});

test.describe('Feedback — Cenário C2: criar novo feedback', () => {
  test('C2 — usuária cria feedback completo e item aparece na lista', async ({ page }) => {
    const newItem: FeedbackItem = {
      ...MOCK_FEEDBACK_ITEM,
      id: 'mock-feedback-uuid-new',
      title: 'Teste E2E',
      content: 'Conteudo de teste E2E com pelo menos 10 caracteres',
      category: 'bug',
      status: 'pending_triage',
      comment_count: 0,
      created_at: new Date().toISOString(),
    };

    // Primeira chamada GET retorna lista vazia; após POST o componente chama refresh()
    // Simulamos isso: após o POST, a lista retorna o item criado.
    let postFeedbackCalled = false;

    // setupStudentSession com createdFeedback e feedbackItems vazia.
    // Depois adicionamos um handler de MAIOR PRIORIDADE (via page.route adicionado depois)
    // para sobrescrever a lógica de listagem dinâmica (com/sem item criado).
    // Em Playwright, o handler registrado MAIS RECENTEMENTE tem maior prioridade.
    await setupStudentSession(page, {
      feedbackItems: [],
      createdFeedback: newItem,
    });

    // Handler de maior prioridade para GET /api/feedback — retorna lista dinâmica
    await page.route(
      (url) => url.pathname === '/api/feedback',
      (route) => {
        const method = route.request().method();
        if (method === 'POST') {
          postFeedbackCalled = true;
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ data: newItem }),
          });
        } else if (method === 'GET') {
          // GET: retorna lista com o item se já foi criado, senão vazia
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: postFeedbackCalled ? [newItem] : [],
              total: postFeedbackCalled ? 1 : 0,
            }),
          });
        } else {
          route.continue();
        }
      },
    );

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    // Abre o modal de nova sugestão
    await page.getByTestId('new-feedback-fab').click();

    // Modal deve aparecer com o título "Nova sugestão"
    // Usa o locator do dialog para escopo — evita strict mode violation com o FAB
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // O título "Nova sugestão" dentro do dialog (o FAB também tem esse texto, hence scoped)
    await expect(dialog.getByText('Nova sugestão')).toBeVisible();

    // Preenche categoria
    await page.getByTestId('feedback-category-select').selectOption('bug');

    // Preenche título (>= 5 chars)
    await page.getByTestId('feedback-title-input').fill('Teste E2E');

    // Preenche conteúdo (>= 10 chars)
    await page.getByTestId('feedback-content-textarea').fill(
      'Conteudo de teste E2E com pelo menos 10 caracteres',
    );

    // Submete o formulário
    await page.getByTestId('submit-feedback-btn').click();

    // Modal deve fechar após envio bem-sucedido
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });

    // Confirma que o POST foi chamado
    expect(postFeedbackCalled).toBe(true);

    // Item criado deve aparecer na lista (a FeedbackList chama refresh() em onSuccess)
    await expect(
      page.getByTestId(`feedback-card-${newItem.id}`)
    ).toBeVisible({ timeout: 8_000 });

    // Título deve estar visível na lista
    await expect(page.getByText('Teste E2E')).toBeVisible();

    // Status "Em análise" (pending_triage) deve estar visível
    await expect(page.getByText('Em análise')).toBeVisible();
  });
});

test.describe('Feedback — Cenário C3 e C4: validação do formulário', () => {
  test.beforeEach(async ({ page }) => {
    await setupStudentSession(page, { feedbackItems: [] });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);
    // Abre o modal
    await page.getByTestId('new-feedback-fab').click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });

  test('C3 — título com menos de 5 caracteres bloqueia o envio com mensagem de erro', async ({ page }) => {
    // Seleciona categoria válida para isolar o erro do título
    await page.getByTestId('feedback-category-select').selectOption('bug');

    // Título inválido: 4 chars (abaixo do mínimo de 5)
    await page.getByTestId('feedback-title-input').fill('Err');

    // Conteúdo válido para não misturar erros
    await page.getByTestId('feedback-content-textarea').fill('Conteudo valido longo o suficiente');

    // Tenta enviar
    await page.getByTestId('submit-feedback-btn').click();

    // Mensagem de erro do título deve aparecer
    await expect(
      page.getByText(/título deve ter pelo menos 5 caracteres/i)
    ).toBeVisible({ timeout: 3_000 });

    // Modal NÃO deve ter fechado — formulário foi bloqueado
    await expect(page.getByRole('dialog')).toBeVisible();

    // Botão de enviar ainda deve estar acessível (não em loading)
    await expect(page.getByTestId('submit-feedback-btn')).not.toBeDisabled();
  });

  test('C4 — conteúdo com menos de 10 caracteres bloqueia o envio com mensagem de erro', async ({ page }) => {
    // Seleciona categoria válida
    await page.getByTestId('feedback-category-select').selectOption('feature');

    // Título válido
    await page.getByTestId('feedback-title-input').fill('Titulo valido aqui');

    // Conteúdo inválido: 9 chars (abaixo do mínimo de 10)
    await page.getByTestId('feedback-content-textarea').fill('Curto');

    // Tenta enviar
    await page.getByTestId('submit-feedback-btn').click();

    // Mensagem de erro do conteúdo deve aparecer
    await expect(
      page.getByText(/descreva com pelo menos 10 caracteres/i)
    ).toBeVisible({ timeout: 3_000 });

    // Modal NÃO deve ter fechado — formulário foi bloqueado
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('C4b — campo vazio sem categoria selecionada mostra todos os erros de validação', async ({ page }) => {
    // Tenta enviar sem preencher nada
    await page.getByTestId('submit-feedback-btn').click();

    // Todos os erros de validação são renderizados com role="alert" —
    // usamos esse role para evitar strict mode violation com o <option> do select.
    const alerts = page.getByRole('alert');

    // Aguarda pelo menos um alerta aparecer
    await expect(alerts.first()).toBeVisible({ timeout: 3_000 });

    // Erro de categoria: "Selecione uma categoria." (role="alert", id="category-error")
    await expect(page.locator('#category-error')).toBeVisible();
    await expect(page.locator('#category-error')).toContainText('Selecione uma categoria');

    // Erro de título: "O título deve ter pelo menos 5 caracteres." (role="alert", id="title-error")
    await expect(page.locator('#title-error')).toBeVisible();
    await expect(page.locator('#title-error')).toContainText('pelo menos 5 caracteres');

    // Erro de conteúdo: "Descreva com pelo menos 10 caracteres." (role="alert", id="content-error")
    await expect(page.locator('#content-error')).toBeVisible();
    await expect(page.locator('#content-error')).toContainText('pelo menos 10 caracteres');

    // Modal permanece aberto
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Feedback — Cenário C5: abrir detalhe de feedback', () => {
  test('C5 — clicar no card abre FeedbackDetail com thread de comentários', async ({ page }) => {
    await setupStudentSession(page, {
      feedbackItems: [MOCK_FEEDBACK_ITEM],
      feedbackDetail: MOCK_FEEDBACK_ITEM,
      existingComments: [MOCK_COMMENT],
    });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    // Aguarda o card aparecer
    const card = page.getByTestId(`feedback-card-${MOCK_FEEDBACK_ITEM.id}`);
    await expect(card).toBeVisible({ timeout: 8_000 });

    // Clica no card
    await card.click();

    // FeedbackDetail deve carregar: botão voltar aparece
    await expect(page.getByTestId('feedback-back-btn')).toBeVisible({ timeout: 8_000 });

    // Título do feedback deve estar no detalhe
    await expect(page.getByText(MOCK_FEEDBACK_ITEM.title)).toBeVisible();

    // Seção de comentários deve estar visível
    await expect(page.getByRole('region', { name: 'Comentários' })).toBeVisible();

    // Comentário existente deve aparecer na thread
    await expect(page.getByText(MOCK_COMMENT.content)).toBeVisible();

    // Campo para novo comentário deve estar presente
    await expect(page.getByTestId('comment-input')).toBeVisible();

    // Botão "Comentar" deve estar visível
    await expect(page.getByTestId('submit-comment-btn')).toBeVisible();
  });

  test('C5b — botão Voltar retorna para a FeedbackList', async ({ page }) => {
    await setupStudentSession(page, {
      feedbackItems: [MOCK_FEEDBACK_ITEM],
      feedbackDetail: MOCK_FEEDBACK_ITEM,
      existingComments: [],
    });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    const card = page.getByTestId(`feedback-card-${MOCK_FEEDBACK_ITEM.id}`);
    await expect(card).toBeVisible({ timeout: 8_000 });
    await card.click();

    // Aguarda detalhe carregar
    await expect(page.getByTestId('feedback-back-btn')).toBeVisible({ timeout: 8_000 });

    // Clica em Voltar
    await page.getByTestId('feedback-back-btn').click();

    // FeedbackList deve ser exibida novamente
    await expect(page.getByText('Sugestões da comunidade')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('new-feedback-fab')).toBeVisible();
  });
});

test.describe('Feedback — Cenário C6: adicionar comentário', () => {
  test('C6 — usuária digita comentário e clica Comentar: comentário aparece na thread', async ({ page }) => {
    let commentPostCalled = false;
    let commentPostCount = 0;

    await setupStudentSession(page, {
      feedbackItems: [MOCK_FEEDBACK_ITEM],
      feedbackDetail: MOCK_FEEDBACK_ITEM,
      existingComments: [MOCK_COMMENT],
      commentsAfterPost: [MOCK_COMMENT, MOCK_NEW_COMMENT],
    });

    // Handler completo para /api/feedback — sobrescreve o setupStudentSession.
    // Em Playwright, o handler registrado DEPOIS tem maior prioridade.
    // Este handler cobre TODOS os casos de feedback para o C6,
    // evitando dependência do route.continue() com function matchers encadeados.
    await page.route(
      (url) => url.pathname.startsWith('/api/feedback'),
      (route) => {
        const req = route.request();
        const method = req.method();
        const pathname = new URL(req.url()).pathname;

        // POST /api/feedback/{id}/comments
        if (method === 'POST' && pathname.match(/\/api\/feedback\/[^/]+\/comments$/)) {
          commentPostCalled = true;
          commentPostCount++;
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ data: MOCK_NEW_COMMENT }),
          });
          return;
        }

        // GET /api/feedback/{id} — detalhe com comentários dinâmicos
        if (method === 'GET' && pathname.match(/\/api\/feedback\/[^/]+$/)) {
          const comments = commentPostCount > 0
            ? [MOCK_COMMENT, MOCK_NEW_COMMENT]
            : [MOCK_COMMENT];
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: MOCK_FEEDBACK_ITEM, comments }),
          });
          return;
        }

        // GET /api/feedback (listagem) — com ou sem query string
        if (method === 'GET' && pathname === '/api/feedback') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: [MOCK_FEEDBACK_ITEM],
              total: 1,
            }),
          });
          return;
        }

        // POST /api/feedback (criação — não usada neste teste)
        if (method === 'POST' && pathname === '/api/feedback') {
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ data: MOCK_FEEDBACK_ITEM }),
          });
          return;
        }

        // Fallback — não deve acontecer neste teste
        route.fulfill({ status: 404, body: 'Not found' });
      },
    );

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    // Abre o detalhe
    const card = page.getByTestId(`feedback-card-${MOCK_FEEDBACK_ITEM.id}`);
    await expect(card).toBeVisible({ timeout: 8_000 });
    await card.click();

    await expect(page.getByTestId('feedback-back-btn')).toBeVisible({ timeout: 8_000 });

    // Aguarda campo de comentário
    const commentInput = page.getByTestId('comment-input');
    await expect(commentInput).toBeVisible({ timeout: 5_000 });

    // Digita o comentário
    await commentInput.fill('Comentário de teste E2E via Playwright.');

    // Botão "Comentar" deve ficar habilitado com conteúdo preenchido
    const submitBtn = page.getByTestId('submit-comment-btn');
    await expect(submitBtn).not.toBeDisabled();

    // Clica em "Comentar"
    await submitBtn.click();

    // Aguarda a chamada ser feita
    await page.waitForTimeout(500);

    // Confirma que o POST foi chamado
    expect(commentPostCalled).toBe(true);

    // O comentário novo deve aparecer na thread (via refresh após POST)
    await expect(
      page.getByText(MOCK_NEW_COMMENT.content)
    ).toBeVisible({ timeout: 8_000 });
  });

  test('C6b — botão Comentar fica desabilitado com campo vazio', async ({ page }) => {
    await setupStudentSession(page, {
      feedbackItems: [MOCK_FEEDBACK_ITEM],
      feedbackDetail: MOCK_FEEDBACK_ITEM,
      existingComments: [],
    });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    const card = page.getByTestId(`feedback-card-${MOCK_FEEDBACK_ITEM.id}`);
    await expect(card).toBeVisible({ timeout: 8_000 });
    await card.click();

    await expect(page.getByTestId('feedback-back-btn')).toBeVisible({ timeout: 8_000 });

    const commentInput = page.getByTestId('comment-input');
    await expect(commentInput).toBeVisible({ timeout: 5_000 });

    // Campo vazio — botão deve estar desabilitado
    await expect(page.getByTestId('submit-comment-btn')).toBeDisabled();

    // Preenche e apaga — botão deve voltar a ser desabilitado
    await commentInput.fill('Algo');
    await expect(page.getByTestId('submit-comment-btn')).not.toBeDisabled();
    await commentInput.fill('');
    await expect(page.getByTestId('submit-comment-btn')).toBeDisabled();
  });
});

test.describe('Feedback — Cenário C7c: LGPD wire-level', () => {
  test('C7c — wire-level: API /api/feedback não expõe campos LGPD relations/notes', async ({ page }) => {
    let apiResponseBody: string | undefined;

    await page.route('**/api/feedback**', async (route) => {
      const response = await route.fetch();
      apiResponseBody = await response.text();
      await route.fulfill({ response });
    });

    await setupStudentSession(page, { feedbackItems: [MOCK_FEEDBACK_ITEM] });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    // Wait for the API call to be intercepted
    await page.waitForTimeout(2000);

    expect(apiResponseBody).toBeDefined();
    if (apiResponseBody) {
      const parsed = JSON.parse(apiResponseBody) as unknown;
      const serialized = JSON.stringify(parsed);
      expect(serialized).not.toContain('"relations"');
      expect(serialized).not.toContain('"notes"');
    }
  });
});

test.describe('Feedback — Cenário C7: restrição clínica (termos proibidos)', () => {
  /**
   * RESTRIÇÃO CLÍNICA INVIOLÁVEL.
   *
   * Este teste confirma que o sistema de feedback NÃO EXIBE nenhum termo
   * de classificação de ciclo no DOM — nem em labels, placeholders,
   * mensagens de erro, títulos de seção ou conteúdo de usuário pré-carregado.
   *
   * Os termos "fértil" e "infértil" NÃO DEVEM aparecer como outputs do sistema.
   * Os termos "seguro" e "inseguro" NÃO DEVEM aparecer como labels/UI do sistema.
   *
   * Nota: o campo `relations` (LGPD) nunca deve aparecer visível.
   */
  test('C7 — nenhum termo clínico proibido aparece na página de Feedback', async ({ page }) => {
    // Usa um feedback que não contém termos clínicos no conteúdo
    const clinicallySafeItem: FeedbackItem = {
      ...MOCK_FEEDBACK_ITEM,
      title: 'Melhoria na interface de registro',
      content: 'O formulário de entrada poderia ter um contador de dias mais visível.',
    };

    await setupStudentSession(page, {
      feedbackItems: [clinicallySafeItem],
      feedbackDetail: clinicallySafeItem,
      existingComments: [],
    });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    // Aguarda a FeedbackList renderizar completamente
    await expect(page.getByTestId('new-feedback-fab')).toBeVisible({ timeout: 8_000 });

    // Captura todo o texto visível da página de Feedback
    const pageText = (await page.locator('body').innerText()).toLowerCase();

    // Termos clínicos de classificação de ciclo: NUNCA devem aparecer como output do sistema
    const forbiddenTerms = ['fértil', 'fertil', 'infértil', 'infertil'];
    for (const term of forbiddenTerms) {
      expect(
        pageText,
        `Termo clínico proibido encontrado na página de Feedback: "${term}"`,
      ).not.toContain(term.toLowerCase());
    }

    // Termos de avaliação clínica: não devem aparecer como labels ou UI do sistema
    // (podem aparecer em conteúdo de usuário, mas não em texto gerado pelo app)
    const systemLabels = await page.locator('label, button, h1, h2, h3, [role="heading"], [placeholder]')
      .allInnerTexts();
    const systemLabelText = systemLabels.join(' ').toLowerCase();

    expect(
      systemLabelText,
      'Label/botão do sistema contém "seguro" — termo de avaliação clínica proibido em UI',
    ).not.toContain('seguro');
    expect(
      systemLabelText,
      'Label/botão do sistema contém "inseguro" — termo de avaliação clínica proibido em UI',
    ).not.toContain('inseguro');

    // LGPD: campo `relations` não deve aparecer em texto visível
    expect(
      pageText,
      'Campo LGPD "relations" está exposto no DOM da página de Feedback',
    ).not.toContain('"relations"');
    expect(
      pageText,
      'Campo LGPD "notes" está exposto no DOM da página de Feedback',
    ).not.toContain('"notes"');
  });

  test('C7b — modal de nova sugestão não contém termos clínicos em labels ou placeholders', async ({ page }) => {
    await setupStudentSession(page, { feedbackItems: [] });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    await navigateToFeedbackTab(page);

    // Abre o modal
    await page.getByTestId('new-feedback-fab').click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // Captura todo o texto do modal
    const modalText = (await page.getByRole('dialog').innerText()).toLowerCase();

    // Nenhum termo clínico proibido no modal
    const forbiddenTerms = ['fértil', 'fertil', 'infértil', 'infertil', 'seguro', 'inseguro'];
    for (const term of forbiddenTerms) {
      expect(
        modalText,
        `Termo clínico proibido no modal de nova sugestão: "${term}"`,
      ).not.toContain(term.toLowerCase());
    }

    // Fecha o modal para limpar estado
    await page.getByTestId('close-new-feedback-modal').click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3_000 });
  });
});
