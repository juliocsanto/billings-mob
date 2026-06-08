/**
 * E2E — NotificationPreferencesPage (Sprint 5 S5-03).
 *
 * Cenários cobertos:
 *  C1 — Sem autenticação, AuthGate exibe formulário de login (guard)
 *  C2 — Restrição clínica: nenhum termo proibido na página de notificações
 *
 * Nota arquitetural:
 *  - NotificationPreferencesPage NÃO é uma rota separada.
 *    É renderizada quando tab === 'notificacoes' AND user !== null.
 *  - Quando não autenticado, o App.jsx renderiza a mensagem
 *    "Faça login para gerenciar suas notificações."
 *    — mas esse estado é inacessível sem AuthGate passar children,
 *    que só ocorre quando há sessão.
 *    Na prática: sem sessão → AuthGate mostra login form, não o App.
 *
 * RESTRIÇÃO CLÍNICA: nenhum teste usa ou verifica os termos
 * "fértil", "infértil", "seguro" ou "inseguro".
 * LGPD: nenhum teste acessa ou exibe o campo `relations` ou `notes`.
 */
import { test, expect, type Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupAuthenticatedSession(page: Page): Promise<void> {
  const MOCK_SESSION = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
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

  // Mock das preferências de notificação
  await page.route('**/api/users/push-preferences**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        daily_reminder_enabled: false,
        daily_reminder_time: '21:00',
        apex_alert_enabled: true,
        conflict_alert_enabled: true,
      }),
    });
  });

  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

// ── Testes ────────────────────────────────────────────────────────────────────

test.describe('NotificationPreferencesPage', () => {
  test('C1 — sem autenticação, AuthGate protege o app inteiro (guard)', async ({ page }) => {
    // Sem sessão injetada → AuthGate mostra formulário de magic link
    await page.goto('/');
    await expect(page.getByText('Billings Grafico')).toBeVisible({ timeout: 10_000 });

    // Formulário de login visível — tab Notific. não acessível sem auth
    await expect(page.getByLabel('E-mail')).toBeVisible({ timeout: 10_000 });

    // As tabs do app (incluindo Notific.) estão dentro do AuthGate —
    // não são renderizadas sem sessão
    await expect(
      page.getByRole('button', { name: /notific/i })
    ).not.toBeVisible();
  });

  test('C2 — restrição clínica: nenhum termo proibido na página de notificações', async ({ page }) => {
    await setupAuthenticatedSession(page);
    await page.goto('/');

    await expect(page.getByText('Billings Gráfico')).toBeVisible({ timeout: 15_000 });

    // Navega para a tab de Notificações
    await page.getByRole('button', { name: /notific/i }).first().click();

    // O cabeçalho da página deve aparecer
    await expect(page.getByText('Notificações')).toBeVisible({ timeout: 5_000 });

    // A seção de Lembretes deve estar visível
    await expect(page.getByText('Lembretes')).toBeVisible();

    // Captura o texto completo da página para verificar restrições
    const pageText = await page.locator('body').innerText();

    // Restrição clínica inviolável — nenhum desses termos pode aparecer
    const forbiddenClinicalTerms = ['fértil', 'infértil', 'seguro', 'inseguro'];
    for (const term of forbiddenClinicalTerms) {
      expect(
        pageText.toLowerCase(),
        `Termo clínico proibido encontrado na página de notificações: "${term}"`
      ).not.toContain(term.toLowerCase());
    }

    // Restrição LGPD: campos sensíveis não devem aparecer em texto visível
    expect(pageText.toLowerCase()).not.toContain('"relations"');
    expect(pageText.toLowerCase()).not.toContain('"notes"');

    // Verificação positiva: os toggles de notificação estão presentes
    // Toggle "Lembrete diário" — id="daily-reminder" (aria-labelledby)
    await expect(page.getByText('Lembrete diário')).toBeVisible();
    // Toggle de alertas da instrutora
    await expect(page.getByText('Alertas')).toBeVisible();

    // As notificações contêm apenas conteúdo de app-events — nunca dados clínicos
    await expect(page.getByText(/nunca cont[eê]m dados cl[ií]nicos/i)).toBeVisible();
  });
});
