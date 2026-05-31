/**
 * E2E — Auth flow (Sprint 5 S5-03).
 *
 * Cenários cobertos:
 *  C1 — Smoke test: PWA carrega sem erro JS
 *  C2 — AuthGate renderiza formulário de magic link (label "E-mail" visível)
 *  C3 — Submeter magic link exibe confirmação "Verifique seu e-mail"
 *  C4 — Rota inexistente mantém a SPA (não causa erro 404 de recurso crítico)
 *
 * Nota arquitetural: billings-mob é uma SPA sem React Router.
 * Toda navegação é baseada em tabs (estado interno do componente App).
 * "Rotas" não existem no sentido convencional — a URL raiz é o único entry point.
 *
 * Estratégia de autenticação: a app usa Supabase Auth (magic link).
 * Os testes cobrem o estado *não autenticado* (estado inicial da SPA).
 * O estado autenticado requer um token Supabase real — isso é coberto em
 * observation.spec.ts via interceptação de rede (page.route).
 *
 * RESTRIÇÃO CLÍNICA: nenhum teste usa ou verifica os termos
 * "fértil", "infértil", "seguro" ou "inseguro".
 * LGPD: nenhum teste acessa ou exibe o campo `relations` ou `notes`.
 */
import { test, expect } from '@playwright/test';

test.describe('Auth — magic link', () => {
  test('C1 — smoke test: PWA carrega sem erro JS crítico', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/');
    // SPA deve montar — aguarda um elemento estável aparecer
    await expect(page.locator('body')).toBeVisible();
    // Nenhum erro JS fatal deve ter sido lançado
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('C2 — AuthGate renderiza o formulário de magic link', async ({ page }) => {
    await page.goto('/');

    // O AuthGate pode mostrar brevemente um spinner de carregamento;
    // aguarda o formulário ou o spinner desaparecer.
    // A label "E-mail" identifica o formulário de magic link (acessibilidade Sprint 4.5 C-01).
    await expect(page.getByText('Billings Grafico')).toBeVisible({ timeout: 10_000 });

    // Aguarda o estado de "no session" (formulário de login)
    await expect(page.getByLabel('E-mail')).toBeVisible({ timeout: 10_000 });

    // Botão de submit deve estar presente
    await expect(
      page.getByRole('button', { name: /enviar link de acesso/i })
    ).toBeVisible();
  });

  test('C3 — submeter magic link exibe confirmação de envio', async ({ page }) => {
    // Intercepta a chamada ao Supabase Auth para evitar disparo real de e-mail
    await page.route('**/auth/v1/otp**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto('/');
    await expect(page.getByLabel('E-mail')).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('E-mail').fill('aluna@teste.com.br');
    await page.getByRole('button', { name: /enviar link de acesso/i }).click();

    // Confirmação deve aparecer após envio bem-sucedido
    await expect(page.getByText(/verifique seu e-mail/i)).toBeVisible({ timeout: 10_000 });

    // Deve exibir o e-mail digitado no banner de confirmação
    await expect(page.getByText('aluna@teste.com.br')).toBeVisible();

    // Botão para usar outro e-mail deve estar disponível
    await expect(
      page.getByRole('button', { name: /usar outro e-mail/i })
    ).toBeVisible();
  });

  test('C4 — URL inválida não causa crash da SPA (auth guard via AuthGate)', async ({ page }) => {
    // billings-mob é uma SPA — qualquer URL carrega o index.html
    // O Vite dev server e o Vercel servem o SPA para todas as rotas
    await page.goto('/rota-que-nao-existe');
    await expect(page.locator('body')).toBeVisible();

    // A SPA deve carregar normalmente — o AuthGate renderiza o formulário
    // de login (não há router para mostrar um 404 de componente)
    await expect(page.getByText('Billings Grafico')).toBeVisible({ timeout: 10_000 });
  });
});
