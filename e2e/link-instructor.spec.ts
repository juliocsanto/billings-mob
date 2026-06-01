/**
 * E2E — LinkInstructorPage (Sprint 5 S5-03).
 *
 * Cenários cobertos:
 *  C1 — Sem autenticação, a SPA mostra o formulário de login (AuthGate guard)
 *  C2 — Com autenticação, a tab Vínculo renderiza o campo de busca de instrutora
 *  C3 — Restrição clínica: nenhum termo proibido aparece na página de vínculo
 *
 * Nota arquitetural:
 *  - LinkInstructorPage NÃO é uma rota separada — é renderizada quando
 *    tab === 'vinculo' dentro do App.jsx principal.
 *  - Não há redirect de /link-instructor — a SPA não usa React Router.
 *    A proteção é via AuthGate (envolve o App inteiro).
 *
 * RESTRIÇÃO CLÍNICA: nenhum teste usa ou verifica os termos
 * "fértil", "infértil", "seguro" ou "inseguro".
 * LGPD: nenhum teste acessa ou exibe o campo `relations` ou `notes`.
 */
import { test, expect, type Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sessão falsa para simular aluna autenticada */
async function setupAuthenticatedSession(page: Page): Promise<void> {
  const MOCK_SESSION = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'mock-aluna-uuid-001',
      email: 'aluna@teste.com.br',
      user_metadata: { role: 'student', full_name: 'Maria Teste' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  };

  await page.addInitScript((session) => {
    const projectRef = 'gcwxwrjzbbqkuzcweyut';
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify(session));
  }, MOCK_SESSION);

  await page.route('**/auth/v1/token**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SESSION),
    });
  });

  // Mock da busca de instrutora e dos vínculos existentes
  await page.route('**/api/instructor-student-links**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

// ── Testes ────────────────────────────────────────────────────────────────────

test.describe('LinkInstructorPage', () => {
  test('C1 — sem autenticação, AuthGate exibe formulário de magic link (guard)', async ({ page }) => {
    // Sem injetar sessão, o AuthGate deve exibir o formulário de login
    await page.goto('/');
    await expect(page.getByText('Billings Grafico')).toBeVisible({ timeout: 10_000 });

    // O formulário de magic link protege toda a app — incluindo a tab Vínculo
    await expect(page.getByLabel('E-mail')).toBeVisible({ timeout: 10_000 });

    // A tab Vínculo não deve estar acessível sem autenticação
    // (o App inteiro está dentro do AuthGate)
    await expect(
      page.getByRole('button', { name: /vínculo/i })
    ).not.toBeVisible();
  });

  test('C2 — com autenticação, tab Vínculo renderiza busca de instrutora', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await page.goto('/');

    await expect(page.getByText('Billings Gráfico')).toBeVisible({ timeout: 15_000 });

    // Navega para a tab Vínculo (header e nav inferior)
    await page.getByRole('button', { name: 'Vínculo' }).first().click();

    // LinkInstructorPage renderiza com o campo de busca por e-mail
    await expect(page.getByText('Minha instrutora')).toBeVisible({ timeout: 5_000 });

    // O campo de busca de instrutora deve estar presente
    // (aria-label="E-mail da instrutora" — definido em LinkInstructorPage.tsx)
    await expect(page.getByLabel('E-mail da instrutora')).toBeVisible({ timeout: 5_000 });

    // O botão de busca deve estar presente
    await expect(page.getByRole('button', { name: /buscar/i })).toBeVisible();

    // Estado vazio: nenhum vínculo ainda
    await expect(page.getByText('Nenhum vínculo ainda')).toBeVisible({ timeout: 5_000 });
  });

  test('C3 — restrição clínica: nenhum termo proibido aparece na página de vínculo', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await page.goto('/');

    await expect(page.getByText('Billings Gráfico')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Vínculo' }).first().click();
    await expect(page.getByText('Minha instrutora')).toBeVisible({ timeout: 5_000 });

    // Captura o texto completo da página
    const pageText = await page.locator('body').innerText();

    // Termos proibidos — restrição clínica inviolável
    const forbiddenTerms = ['fértil', 'infértil', 'seguro', 'inseguro'];
    for (const term of forbiddenTerms) {
      expect(
        pageText.toLowerCase(),
        `Termo proibido encontrado na página de vínculo: "${term}"`
      ).not.toContain(term.toLowerCase());
    }

    // Restrição LGPD: os campos sensíveis não devem aparecer em texto
    expect(pageText.toLowerCase()).not.toContain('"relations"');
    expect(pageText.toLowerCase()).not.toContain('"notes"');
  });
});
