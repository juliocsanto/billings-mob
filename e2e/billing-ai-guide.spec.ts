/**
 * E2E — Billing + Guia IA flows (Sprint 7 S7-14).
 *
 * Cenários cobertos:
 *  C1 — Instrutora com status trial vê planos disponíveis na aba Faturamento
 *  C2 — Instrutora clica "Assinar" → POST /api/billing/subscribe chamado com plano correto
 *  C3 — Instrutora com status active vê badge "Ativo" e data de vencimento
 *  C4 — Instrutora com status expired vê banner de renovação no dashboard
 *  C5 — Aluna abre aba Guia → campo de input visível (sem campo de API key)
 *  C6 — Aluna digita pergunta e envia → loading state aparece
 *
 * Estratégia:
 *  - Sessão Supabase simulada via localStorage (mesmo padrão de observation.spec.ts).
 *  - Todas as chamadas de rede interceptadas via page.route() — sem backend real.
 *  - Chamadas à API de billing mockadas para retornar estados controláveis.
 *  - Edge Function de Guia IA mockada via page.route() com SSE simulado.
 *
 * RESTRIÇÃO CLÍNICA: nenhum teste usa ou verifica os termos
 * "fértil", "infértil", "seguro" ou "inseguro".
 * LGPD: nenhum teste acessa ou exibe o campo `relations` ou `notes`.
 *
 * Seletores: exclusivamente data-testid — nunca classes CSS ou texto.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Shared mock data ──────────────────────────────────────────────────────────

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

const MOCK_INSTRUCTOR_SESSION = {
  access_token: 'mock-instructor-access-token',
  refresh_token: 'mock-instructor-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: 'mock-instrutora-uuid-001',
    email: 'instrutora@teste.com.br',
    user_metadata: { role: 'instructor', full_name: 'Ana Instrutora' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Injeta sessão de aluna no localStorage antes de navegar.
 * Intercepta chamadas de rede para evitar dependência de backend.
 */
async function setupStudentSession(page: Page): Promise<void> {
  await page.addInitScript((session) => {
    const projectRef = 'gcwxwrjzbbqkuzcweyut';
    const key = `sb-${projectRef}-auth-token`;
    localStorage.setItem(key, JSON.stringify(session));
  }, MOCK_STUDENT_SESSION);

  await page.route('**/auth/v1/token**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STUDENT_SESSION),
    });
  });

  await page.route('**/auth/v1/user**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user: MOCK_STUDENT_SESSION.user }, error: null }),
    });
  });

  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/api/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

/**
 * Injeta sessão de instrutora no localStorage antes de navegar.
 * Intercepta chamadas de rede incluindo /api/billing/*.
 */
async function setupInstructorSession(
  page: Page,
  billingStatus: 'trial' | 'active' | 'expired' = 'trial',
): Promise<void> {
  const expiresAt =
    billingStatus === 'active'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : billingStatus === 'expired'
        ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        : null;

  const billingResponse = {
    subscriptionStatus: billingStatus,
    plan: billingStatus !== 'trial' ? 'instructor_monthly' : null,
    subscriptionId: billingStatus !== 'trial' ? 'mock_sub_abc123' : null,
    expiresAt,
  };

  await page.addInitScript((session) => {
    const projectRef = 'gcwxwrjzbbqkuzcweyut';
    const key = `sb-${projectRef}-auth-token`;
    localStorage.setItem(key, JSON.stringify(session));
  }, MOCK_INSTRUCTOR_SESSION);

  await page.route('**/auth/v1/token**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_INSTRUCTOR_SESSION),
    });
  });

  await page.route('**/auth/v1/user**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { user: MOCK_INSTRUCTOR_SESSION.user }, error: null }),
    });
  });

  // Mock billing status endpoint
  await page.route('**/api/billing/status**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(billingResponse),
    });
  });

  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // Generic API fallback (other routes)
  await page.route('**/api/**', (route) => {
    if (route.request().url().includes('/api/billing/')) {
      // Already handled above — let it pass through to the more specific route
      route.continue();
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

// ── C1–C4: Billing flows (instrutora) ────────────────────────────────────────

test.describe('Billing — fluxo de assinatura (instrutora)', () => {
  test('C1 — instrutora com status trial vê planos disponíveis na aba Faturamento', async ({ page }) => {
    await setupInstructorSession(page, 'trial');
    await page.goto('/');

    // Aguarda app carregar
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Navega para aba de faturamento/billing
    // A tab pode ter testid "tab-billing" ou "tab-faturamento"
    const billingTab = page
      .getByTestId('tab-billing')
      .or(page.getByTestId('tab-faturamento'));

    await expect(billingTab).toBeVisible({ timeout: 10_000 });
    await billingTab.click();

    // Planos de assinatura devem estar visíveis
    const plansContainer = page
      .getByTestId('billing-plans')
      .or(page.getByTestId('subscription-plans'));

    await expect(plansContainer).toBeVisible({ timeout: 10_000 });

    // Deve mostrar o status trial
    const trialBadge = page
      .getByTestId('subscription-status-trial')
      .or(page.getByTestId('billing-status'));

    await expect(trialBadge).toBeVisible({ timeout: 5_000 });

    // Garante que nenhum texto de classificação clínica aparece na tela
    await expect(page.getByText(/fértil/i)).not.toBeVisible();
    await expect(page.getByText(/infértil/i)).not.toBeVisible();
  });

  test('C2 — instrutora clica "Assinar" → POST /api/billing/subscribe chamado com plano correto', async ({ page }) => {
    await setupInstructorSession(page, 'trial');

    // Captura a requisição de subscribe para verificar o payload
    let subscribeCalled = false;
    let subscribedPlan: string | undefined;

    await page.route('**/api/billing/subscribe**', async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as { plan?: string } | null;
      subscribeCalled = true;
      subscribedPlan = body?.plan;

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          subscriptionId: 'mock_sub_new123',
          status: 'active',
          nextDueDate: '2026-07-06',
          paymentUrl: 'https://mock.asaas.com/checkout/test',
        }),
      });
    });

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Navega para aba de faturamento
    const billingTab = page
      .getByTestId('tab-billing')
      .or(page.getByTestId('tab-faturamento'));

    await expect(billingTab).toBeVisible({ timeout: 10_000 });
    await billingTab.click();

    // Aguarda planos carregarem
    await expect(
      page.getByTestId('billing-plans').or(page.getByTestId('subscription-plans')),
    ).toBeVisible({ timeout: 10_000 });

    // Clica no botão de assinar (plano mensal ou qualquer plano disponível)
    const subscribeBtn = page
      .getByTestId('subscribe-btn-monthly')
      .or(page.getByTestId('subscribe-btn'))
      .or(page.getByTestId('btn-subscribe'));

    await expect(subscribeBtn).toBeVisible({ timeout: 5_000 });
    await subscribeBtn.click();

    // Aguarda a chamada de API ser feita
    await page.waitForTimeout(1_000);

    expect(subscribeCalled).toBe(true);
    // Plano deve ser um dos valores válidos
    expect(['instructor_monthly', 'instructor_annual']).toContain(subscribedPlan);
  });

  test('C3 — instrutora com status active vê badge "Ativo" e data de vencimento', async ({ page }) => {
    await setupInstructorSession(page, 'active');
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Navega para aba de faturamento
    const billingTab = page
      .getByTestId('tab-billing')
      .or(page.getByTestId('tab-faturamento'));

    await expect(billingTab).toBeVisible({ timeout: 10_000 });
    await billingTab.click();

    // Badge de status ativo deve estar visível
    const activeBadge = page
      .getByTestId('subscription-status-active')
      .or(page.getByTestId('billing-active-badge'))
      .or(page.getByTestId('status-active'));

    await expect(activeBadge).toBeVisible({ timeout: 10_000 });

    // Data de vencimento deve estar visível
    const expiryDate = page
      .getByTestId('subscription-expires-at')
      .or(page.getByTestId('next-due-date'))
      .or(page.getByTestId('expiry-date'));

    await expect(expiryDate).toBeVisible({ timeout: 5_000 });

    // Garante ausência de classificação clínica
    await expect(page.getByText(/fértil/i)).not.toBeVisible();
    await expect(page.getByText(/infértil/i)).not.toBeVisible();
  });

  test('C4 — instrutora com status expired vê banner de renovação no dashboard', async ({ page }) => {
    await setupInstructorSession(page, 'expired');
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Banner de renovação deve aparecer (pode ser no dashboard principal ou
    // ao navegar para a aba de faturamento)
    const renewalBanner = page
      .getByTestId('billing-expired-banner')
      .or(page.getByTestId('subscription-expired-banner'))
      .or(page.getByTestId('renewal-banner'));

    // Aguarda o banner aparecer — pode ser assíncrono (api/billing/status)
    await expect(renewalBanner).toBeVisible({ timeout: 15_000 });

    // O banner não deve conter classificações clínicas
    const bannerText = await renewalBanner.textContent();
    expect(bannerText?.toLowerCase()).not.toContain('fértil');
    expect(bannerText?.toLowerCase()).not.toContain('infértil');
    expect(bannerText?.toLowerCase()).not.toContain('seguro');
  });
});

// ── C5–C6: Guia IA (aluna) ────────────────────────────────────────────────────

test.describe('Guia IA — aba Guia (aluna)', () => {
  test('C5 — aluna abre aba Guia → campo de input visível, sem campo de API key', async ({ page }) => {
    await setupStudentSession(page);
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Navega para a aba Guia
    const guiaTab = page
      .getByTestId('tab-guia')
      .or(page.getByRole('tab', { name: /guia/i }));

    await expect(guiaTab).toBeVisible({ timeout: 10_000 });
    await guiaTab.click();

    // Campo de input de pergunta deve estar visível
    const questionInput = page
      .getByTestId('guide-question-input')
      .or(page.getByPlaceholder(/escreva sua dúvida/i))
      .or(page.getByTestId('ai-input'));

    await expect(questionInput).toBeVisible({ timeout: 10_000 });

    // NÃO deve existir campo de API key (a Edge Function usa o JWT da sessão)
    const apiKeyField = page
      .getByTestId('api-key-input')
      .or(page.getByPlaceholder(/api key/i))
      .or(page.getByLabel(/api key/i));

    await expect(apiKeyField).not.toBeVisible();

    // Garante ausência de classificação clínica
    await expect(page.getByText(/fértil/i)).not.toBeVisible();
    await expect(page.getByText(/infértil/i)).not.toBeVisible();
  });

  test('C6 — aluna digita pergunta e envia → loading state aparece', async ({ page }) => {
    await setupStudentSession(page);

    // Mock da Edge Function ai-guide para simular resposta lenta (loading state visível)
    await page.route('**/functions/v1/ai-guide**', async (route) => {
      // Aguarda um tempo para que o loading state apareça antes de responder
      await new Promise((resolve) => setTimeout(resolve, 200));
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: [
          'data: {"token":"O Ápice"}\n\n',
          'data: {"token":" é o dia"}\n\n',
          'data: {"token":" de maior muco."}\n\n',
          'data: [DONE]\n\n',
        ].join(''),
      });
    });

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Navega para aba Guia
    const guiaTab = page
      .getByTestId('tab-guia')
      .or(page.getByRole('tab', { name: /guia/i }));

    await expect(guiaTab).toBeVisible({ timeout: 10_000 });
    await guiaTab.click();

    // Aguarda input aparecer
    const questionInput = page
      .getByTestId('guide-question-input')
      .or(page.getByPlaceholder(/escreva sua dúvida/i));

    await expect(questionInput).toBeVisible({ timeout: 10_000 });

    // Digita uma pergunta
    await questionInput.fill('O que é o Ápice?');

    // Submete a pergunta (Enter ou botão de envio)
    await questionInput.press('Enter');

    // Loading state deve aparecer imediatamente após o envio
    const loadingState = page
      .getByTestId('guide-loading')
      .or(page.getByTestId('ai-loading'))
      .or(page.locator('[aria-busy="true"]'))
      .or(page.getByRole('status', { name: /carregando/i }));

    // O loading deve aparecer enquanto a resposta é gerada
    await expect(loadingState).toBeVisible({ timeout: 5_000 });

    // Garante ausência de classificação clínica em qualquer resposta exibida
    await expect(page.getByText(/fértil/i)).not.toBeVisible();
    await expect(page.getByText(/infértil/i)).not.toBeVisible();
    await expect(page.getByText(/seguro/i)).not.toBeVisible();
    await expect(page.getByText(/inseguro/i)).not.toBeVisible();
  });
});
