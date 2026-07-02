/**
 * E2E — HojePage: tipo de muco com ápice + toggle afirmativo de relações
 * (Feedback MOB 2026-07-02).
 *
 * Cenários cobertos:
 *  C1 — Selecionar "Ápice" na aba Hoje exibe a seção "Tipo de muco"
 *       (pill "Sem muco" + qualidades), em paridade com o DayDetailModal
 *  C2 — Selecionar uma qualidade de muco com Ápice ativo marca aria-pressed
 *  C3 — O controle de relações exibe apenas o rótulo afirmativo — a tela
 *       nunca mostra "Não houve" (o estado desmarcado não induz clique)
 *
 * Estratégia: sessão Supabase simulada via localStorage + interceptação de
 * /api/** e /rest/v1/** (mesma abordagem de observation.spec.ts).
 *
 * RESTRIÇÃO CLÍNICA: nenhum teste usa ou verifica os termos
 * "fértil", "infértil", "seguro" ou "inseguro".
 * LGPD: nenhum teste lê dados reais — a sessão é mock e nenhum valor de
 * `relations`/`notes` de usuária é acessado; apenas rótulos estáticos da UI.
 */
import { test, expect, type Page } from '@playwright/test';

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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION) });
  });
  await page.route('**/api/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function gotoHoje(page: Page): Promise<void> {
  await setupAuthenticatedSession(page);
  await page.goto('/');
  await expect(page.getByText('Billings Gráfico')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('nav-hoje').click();
  await expect(page.getByTestId('stamp-apice')).toBeVisible({ timeout: 10_000 });
}

test.describe('HojePage — muco com Ápice (paridade com DayDetailModal)', () => {
  test('C1 — selecionar Ápice exibe a seção Tipo de muco com "Sem muco" ativo', async ({ page }) => {
    await gotoHoje(page);

    // Antes de selecionar um stamp, a seção de muco não aparece
    await expect(page.getByTestId('mucus-none')).not.toBeVisible();

    await page.getByTestId('stamp-apice').click();

    await expect(page.getByTestId('mucus-none')).toBeVisible();
    await expect(page.getByTestId('mucus-elastico')).toBeVisible();
    // mucus=null por padrão → "Sem muco" pressionado
    await expect(page.getByTestId('mucus-none')).toHaveAttribute('aria-pressed', 'true');
  });

  test('C2 — selecionar qualidade de muco com Ápice ativo', async ({ page }) => {
    await gotoHoje(page);
    await page.getByTestId('stamp-apice').click();

    await page.getByTestId('mucus-elastico').click();
    await expect(page.getByTestId('mucus-elastico')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('mucus-none')).toHaveAttribute('aria-pressed', 'false');

    // Botão de salvar habilitado com stamp+muco selecionados
    await expect(page.getByTestId('save-observation')).toBeEnabled();
  });

  test('C1b — Sangramento NÃO exibe a seção Tipo de muco', async ({ page }) => {
    await gotoHoje(page);
    await page.getByTestId('stamp-sangramento').click();
    await expect(page.getByTestId('mucus-none')).not.toBeVisible();
  });
});

test.describe('HojePage — toggle afirmativo de relações', () => {
  test('C3 — rótulo afirmativo fixo; a tela nunca exibe "Não houve"', async ({ page }) => {
    await gotoHoje(page);

    const toggle = page.getByTestId('toggle-relations');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toContainText('Houve relação íntima hoje');

    // Estado desmarcado não afirma ausência de relação
    const body = (await page.textContent('body')) ?? '';
    expect(body.toLowerCase()).not.toContain('não houve');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toContainText('Houve relação íntima hoje');
  });
});
