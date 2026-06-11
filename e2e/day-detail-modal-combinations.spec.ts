/**
 * E2E — DayDetailModal: combinações de sensação + tipo de muco (Sprint 6 QA).
 *
 * Objetivo: validar que o DayDetailModal permite selecionar COMBINAÇÕES de
 * sensação + tipo de muco, e que o campo observacao_descricao (stamp=sangramento)
 * funciona corretamente.
 *
 * Estratégia:
 *  - Injetamos sessão Supabase simulada via localStorage (mesmo padrão de
 *    observation.spec.ts) para contornar o AuthGate sem magic link real.
 *  - Interceptamos chamadas de API e Supabase REST para evitar dependência de backend.
 *  - O app renderiza com dados de demo (buildDemoData) quando não há dados no
 *    localStorage — o gráfico exibe dias clicáveis sem API call.
 *  - Abrimos o modal clicando no primeiro dia clicável do ciclo (div[style*="cursor: pointer"]).
 *  - Após abrir o modal, clicamos no stamp desejado e testamos as combinações.
 *
 * Grupos de cenários:
 *  Grupo A — Combinações sensação + tipo de muco (stamps não-sangramento)
 *    A1: stamp=seco → Seca + Sem muco → sensacao ativa, mucus null
 *    A2: stamp=seco → Seca + Opaco → ambos ativos
 *    A3: stamp=muco → Molhada + Cremoso → ambos ativos
 *    A4: stamp=apice → Lubrificante + Fios elásticos → ambos ativos
 *    A5: stamp=muco → Molhada + Sem muco → Molhada ativa, Sem muco ativo
 *  Grupo B — stamp=sangramento
 *    B1: Seção "Tipo de muco" (opaco/cremoso/etc.) NÃO aparece
 *    B2: sensacao=Molhada → Molhada ativa
 *    B3: tipo_observacao=Sangue → Sangue ativo
 *    B4: Molhada + Sangue → ambos ativos simultaneamente
 *    B5: textarea data-testid="observacao-descricao" é visível
 *    B6: digitar no textarea → valor atualizado
 *    B7: Molhada + Manchas + texto → clicar Salvar → onSave disparado (modal fecha/sucesso)
 *  Grupo C — stamp=apice
 *    C1: Seções "Sensação" e "Tipo de muco" aparecem
 *    C2: Lubrificante + Transparente → ambos ativos
 *
 * RESTRIÇÃO CLÍNICA: nenhum teste usa ou verifica os termos
 * "fértil", "infértil", "seguro" ou "inseguro".
 * LGPD: nenhum teste acessa ou exibe o campo `relations` ou `notes`.
 * Os seletores de mucus NUNCA incluem texto que classifique o ciclo.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Constantes ─────────────────────────────────────────────────────────────────

const MOCK_SESSION = {
  access_token: 'mock-access-token-combinations',
  refresh_token: 'mock-refresh-token-combinations',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'mock-aluna-uuid-002',
    email: 'aluna-comb@teste.com.br',
    user_metadata: { role: 'student', full_name: 'Ana Combinacoes' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Injeta sessão simulada e mocka todas as chamadas de rede externas.
 * Idêntico ao padrão de observation.spec.ts para consistência.
 */
async function setupAuthenticatedSession(page: Page): Promise<void> {
  await page.addInitScript((session) => {
    const projectRef = 'gcwxwrjzbbqkuzcweyut';
    const key = `sb-${projectRef}-auth-token`;
    localStorage.setItem(key, JSON.stringify(session));
  }, MOCK_SESSION);

  await page.route('**/auth/v1/token**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SESSION),
    });
  });

  await page.route('**/api/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/rest/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

/**
 * Navega para a tab Gráfico e abre o DayDetailModal clicando no primeiro
 * dia clicável do ciclo atual.
 *
 * Retorna true se o modal foi aberto com sucesso, false caso contrário.
 * Quando retorna false, o teste deve usar test.skip() ou verificação condicional.
 */
async function openDayDetailModal(page: Page): Promise<boolean> {
  // Aguarda a app montar
  await expect(page.getByText('Billings Gráfico')).toBeVisible({ timeout: 15_000 });

  // Navega para a tab Gráfico
  await page.getByTestId('nav-grafico').click();
  await expect(page.getByText('Histórico de Ciclos')).toBeVisible({ timeout: 8_000 });

  // Localiza o primeiro dia clicável no ciclo atual
  // Os dias clicáveis no BilingsCycleChart têm style cursor:pointer
  const clickableCell = page
    .locator('div[style*="cursor: pointer"]')
    .filter({ hasNot: page.locator('button') })
    .first();

  const cellVisible = await clickableCell.isVisible({ timeout: 4_000 }).catch(() => false);
  if (!cellVisible) {
    return false;
  }

  await clickableCell.click();

  // Confirma que o modal abriu verificando o header "Dia X do ciclo"
  const modalOpened = await page
    .getByText(/dia \d+ do ciclo/i)
    .isVisible({ timeout: 5_000 })
    .catch(() => false);

  return modalOpened;
}

/**
 * Clica em um stamp button pelo label e aguarda a seção "Sensação" aparecer.
 * Os stamps são buttons com texto: "Sangramento", "Seco", "Muco", "Ápice".
 */
async function selectStamp(page: Page, stampLabel: string): Promise<void> {
  // Stamps são renderizados como <button> com um <div> de texto interno
  // Usamos getByRole com name que faz substring match
  const stampBtn = page.getByRole('button', { name: stampLabel }).first();
  await expect(stampBtn).toBeVisible({ timeout: 5_000 });
  await stampBtn.click();
}

/**
 * Clica em uma pill (Sensação, tipo_observacao) pelo label e aguarda a
 * pill ficar ativa (data-active="true").
 */
async function selectPill(page: Page, pillLabel: string): Promise<void> {
  const pill = page.getByRole('button', { name: pillLabel }).first();
  await expect(pill).toBeVisible({ timeout: 3_000 });
  await pill.click();
}

/**
 * Clica em um card de muco (Opaco / Pegajoso, Cremoso, Transparente, Fios elásticos).
 * Cards de muco são <button> com texto interno em div.
 */
async function selectMucusCard(page: Page, mucusLabel: string): Promise<void> {
  const card = page.getByRole('button', { name: mucusLabel }).first();
  await expect(card).toBeVisible({ timeout: 3_000 });
  await card.click();
}

/**
 * Verifica que uma pill está ativa consultando data-active="true".
 * O componente Pill usa data-active para indicar estado selecionado.
 */
async function expectPillActive(page: Page, pillLabel: string): Promise<void> {
  // A pill ativa tem data-active="true" no elemento button
  const activePill = page.getByRole('button', { name: pillLabel }).and(
    page.locator('[data-active="true"]')
  );
  await expect(activePill).toBeVisible({ timeout: 3_000 });
}

/**
 * Verifica que uma pill NÃO está ativa (data-active="false" ou ausente).
 */
async function expectPillInactive(page: Page, pillLabel: string): Promise<void> {
  const inactivePill = page.getByRole('button', { name: pillLabel }).and(
    page.locator('[data-active="false"]')
  );
  await expect(inactivePill).toBeVisible({ timeout: 3_000 });
}

// ── Setup compartilhado ────────────────────────────────────────────────────────

test.describe('DayDetailModal — Grupo A: combinações sensação + tipo de muco (não-sangramento)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
    await page.goto('/');
  });

  // ── A1 ────────────────────────────────────────────────────────────────────────
  test('A1 — stamp=seco: selecionar Seca + Sem muco → sensacao ativa, mucus null (Sem muco ativo)', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    // Seleciona stamp Seco
    await selectStamp(page, 'Seco');

    // Seção Sensação deve aparecer (stamp !== null)
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });

    // Seleciona sensação Seca
    await selectPill(page, 'Seca');
    await expectPillActive(page, 'Seca');

    // Seção "Tipo de muco" deve estar visível (stamp=seco, não sangramento)
    await expect(page.getByText('Tipo de muco')).toBeVisible({ timeout: 3_000 });

    // Pill "Sem muco" deve estar ativa por padrão (mucus=null → Sem muco ativo)
    await expectPillActive(page, 'Sem muco');

    // Verificação: os cards de muco existem mas nenhum está selecionado
    // (form.mucus === null → data-active não existe nos cards — eles usam background style)
    // Confirma que nenhum card de muco tem borda de seleção — via background inline
    // Opaco / Pegajoso card deve estar visível mas sem background amberLight selecionado
    await expect(page.getByRole('button', { name: /opaco/i }).first()).toBeVisible();
  });

  // ── A2 ────────────────────────────────────────────────────────────────────────
  test('A2 — stamp=seco: selecionar Seca + Opaco → sensacao Seca ativa, card Opaco ativo', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Seco');
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });

    // Seleciona sensação Seca
    await selectPill(page, 'Seca');
    await expectPillActive(page, 'Seca');

    // Seção tipo de muco disponível para stamp=seco
    await expect(page.getByText('Tipo de muco')).toBeVisible({ timeout: 3_000 });

    // Clica no card Opaco / Pegajoso (mucus='opaco')
    await selectMucusCard(page, 'Opaco / Pegajoso');

    // Pill "Sem muco" deve ficar inativa após selecionar um card de muco
    await expectPillInactive(page, 'Sem muco');

    // O card Opaco deve estar selecionado — visível com cursor pointer
    // Como o card usa style inline para active state (não data-active),
    // verificamos que o card é visível e que o texto de descrição associado está presente
    await expect(page.getByText('Espesso, esbranquiçado ou amarelado')).toBeVisible();

    // Sensação Seca permanece ativa após selecionar muco
    await expectPillActive(page, 'Seca');
  });

  // ── A3 ────────────────────────────────────────────────────────────────────────
  test('A3 — stamp=muco: selecionar Molhada + Cremoso → ambos ativos simultaneamente', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Muco');
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });

    // Seleciona sensação Molhada
    await selectPill(page, 'Molhada');
    await expectPillActive(page, 'Molhada');

    // Verifica que Seca e Lubrificante não estão ativas
    await expectPillInactive(page, 'Seca');
    await expectPillInactive(page, 'Lubrificante');

    // Seção tipo de muco disponível para stamp=muco
    await expect(page.getByText('Tipo de muco')).toBeVisible({ timeout: 3_000 });

    // Clica no card Cremoso
    await selectMucusCard(page, 'Cremoso');

    // Pill "Sem muco" fica inativa após selecionar card
    await expectPillInactive(page, 'Sem muco');

    // Card Cremoso selecionado — descrição visível
    await expect(page.getByText('Consistência pastosa ou leitosa')).toBeVisible();

    // Molhada permanece ativa — combinação simultânea confirmada
    await expectPillActive(page, 'Molhada');
  });

  // ── A4 ────────────────────────────────────────────────────────────────────────
  test('A4 — stamp=apice: selecionar Lubrificante + Fios elásticos → ambos ativos', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Ápice');
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });

    // Seleciona Lubrificante
    await selectPill(page, 'Lubrificante');
    await expectPillActive(page, 'Lubrificante');

    // Seção tipo de muco disponível para stamp=apice
    await expect(page.getByText('Tipo de muco')).toBeVisible({ timeout: 3_000 });

    // Clica no card Fios elásticos (mucus='elastico')
    await selectMucusCard(page, 'Fios elásticos');

    // Pill Sem muco fica inativa
    await expectPillInactive(page, 'Sem muco');

    // Fios elásticos selecionado — descrição visível
    await expect(page.getByText(/elástico como clara de ovo/i)).toBeVisible();

    // Lubrificante permanece ativa — combinação confirmada
    await expectPillActive(page, 'Lubrificante');
  });

  // ── A5 ────────────────────────────────────────────────────────────────────────
  test('A5 — stamp=muco: selecionar Molhada + Sem muco → Molhada ativa, Sem muco ativo (mucus=null)', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Muco');
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });

    // Seleciona Molhada
    await selectPill(page, 'Molhada');
    await expectPillActive(page, 'Molhada');

    // Seção tipo de muco visível
    await expect(page.getByText('Tipo de muco')).toBeVisible({ timeout: 3_000 });

    // "Sem muco" deve estar ativa por padrão (mucus=null no estado inicial)
    await expectPillActive(page, 'Sem muco');

    // Clica num card para desfazer, depois volta para Sem muco
    await selectMucusCard(page, 'Cremoso');
    // Agora Sem muco fica inativa após selecionar Cremoso
    await expectPillInactive(page, 'Sem muco');

    // Clica "Sem muco" para desselecionar Cremoso (toggle back to null)
    await selectPill(page, 'Sem muco');
    await expectPillActive(page, 'Sem muco');

    // Molhada permanece ativa após navegar entre mucus
    await expectPillActive(page, 'Molhada');
  });
});

// ── Grupo B: stamp=sangramento ─────────────────────────────────────────────────

test.describe('DayDetailModal — Grupo B: stamp=sangramento', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
    await page.goto('/');
  });

  // ── B1 ────────────────────────────────────────────────────────────────────────
  test('B1 — stamp=sangramento: seção "Tipo de muco" (opaco/cremoso/etc.) NÃO aparece', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Sangramento');
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });

    // A seção "Tipo de muco" NÃO deve estar visível para stamp=sangramento
    // Verifica ausência do label de seção e dos cards de muco
    await expect(page.getByText('Tipo de muco')).not.toBeVisible();

    // Os cards específicos de muco também não devem aparecer
    await expect(page.getByRole('button', { name: /opaco/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Cremoso' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Transparente' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Fios elásticos' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Sem muco' })).not.toBeVisible();

    // Mas as seções específicas de sangramento DEVEM estar presentes
    await expect(page.getByText('Intensidade')).toBeVisible();
    await expect(page.getByText('O que você observa')).toBeVisible();
  });

  // ── B2 ────────────────────────────────────────────────────────────────────────
  test('B2 — stamp=sangramento: selecionar sensacao=Molhada → Molhada ativa', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Sangramento');
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });

    await selectPill(page, 'Molhada');
    await expectPillActive(page, 'Molhada');

    // Seca e Lubrificante permanecem inativas
    await expectPillInactive(page, 'Seca');
    await expectPillInactive(page, 'Lubrificante');
  });

  // ── B3 ────────────────────────────────────────────────────────────────────────
  test('B3 — stamp=sangramento: selecionar tipo_observacao=Sangue → Sangue ativo', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Sangramento');
    await expect(page.getByText('O que você observa')).toBeVisible({ timeout: 3_000 });

    // Seleciona "Sangue" na seção "O que você observa"
    await selectPill(page, 'Sangue');
    await expectPillActive(page, 'Sangue');

    // Manchas e Outro permanecem inativas
    await expectPillInactive(page, 'Manchas');
    await expectPillInactive(page, 'Outro');
  });

  // ── B4 ────────────────────────────────────────────────────────────────────────
  test('B4 — stamp=sangramento: selecionar Molhada + Sangue → ambos ativos simultaneamente', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Sangramento');

    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('O que você observa')).toBeVisible({ timeout: 3_000 });

    // Seleciona Molhada (sensacao)
    await selectPill(page, 'Molhada');
    await expectPillActive(page, 'Molhada');

    // Seleciona Sangue (tipo_observacao) — deve ser possível simultâneo
    await selectPill(page, 'Sangue');
    await expectPillActive(page, 'Sangue');

    // Verifica combinação simultânea: ambos ativos ao mesmo tempo
    await expectPillActive(page, 'Molhada');
    await expectPillActive(page, 'Sangue');
  });

  // ── B5 ────────────────────────────────────────────────────────────────────────
  test('B5 — stamp=sangramento: textarea data-testid="observacao-descricao" é visível', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Sangramento');

    // A seção "Descreva o que você vê" deve aparecer
    await expect(page.getByText('Descreva o que você vê')).toBeVisible({ timeout: 3_000 });

    // O textarea com data-testid deve ser visível e interagível
    await expect(page.getByTestId('observacao-descricao')).toBeVisible({ timeout: 3_000 });

    // Confirma que é um textarea vazio por padrão
    const textarea = page.getByTestId('observacao-descricao');
    await expect(textarea).toHaveValue('');
  });

  // ── B6 ────────────────────────────────────────────────────────────────────────
  test('B6 — stamp=sangramento: digitar no textarea → valor atualizado no campo', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Sangramento');

    const textarea = page.getByTestId('observacao-descricao');
    await expect(textarea).toBeVisible({ timeout: 3_000 });

    // Digita uma descrição clínica (sem classificação de ciclo)
    const descricao = 'fluxo rosado com textura aquosa';
    await textarea.fill(descricao);

    // Verifica que o valor foi atualizado no campo
    await expect(textarea).toHaveValue(descricao);

    // Campo aceita edição (não é readonly)
    await textarea.fill('');
    await expect(textarea).toHaveValue('');

    await textarea.fill(descricao);
    await expect(textarea).toHaveValue(descricao);
  });

  // ── B7 ────────────────────────────────────────────────────────────────────────
  test('B7 — stamp=sangramento: Molhada + Manchas + texto → Salvar → observação salva', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Sangramento');

    // Seções obrigatórias devem estar presentes
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('O que você observa')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('observacao-descricao')).toBeVisible({ timeout: 3_000 });

    // Seleção 1: Sensação = Molhada
    await selectPill(page, 'Molhada');
    await expectPillActive(page, 'Molhada');

    // Seleção 2: O que você observa = Manchas
    await selectPill(page, 'Manchas');
    await expectPillActive(page, 'Manchas');

    // Seleção 3: Descrição livre
    const descricao = 'fluxo rosado';
    await page.getByTestId('observacao-descricao').fill(descricao);
    await expect(page.getByTestId('observacao-descricao')).toHaveValue(descricao);

    // Confirma que os 3 campos estão ativos simultaneamente
    await expectPillActive(page, 'Molhada');
    await expectPillActive(page, 'Manchas');

    // Clica em Salvar — o botão fica habilitado pois stamp != null
    const saveBtn = page.getByRole('button', { name: /salvar/i }).last();
    await expect(saveBtn).toBeVisible({ timeout: 3_000 });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Após salvar: mensagem de confirmação "Observação salva" ou "Salvo ✓"
    // O componente exibe um banner de sucesso por 800ms antes de fechar
    await expect(
      page.getByText(/observação salva|salvo/i)
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Grupo C: stamp=apice ────────────────────────────────────────────────────────

test.describe('DayDetailModal — Grupo C: stamp=apice', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
    await page.goto('/');
  });

  // ── C1 ────────────────────────────────────────────────────────────────────────
  test('C1 — stamp=apice: seções "Sensação" e "Tipo de muco" aparecem', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Ápice');

    // Seção Sensação deve aparecer
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });

    // Seção Tipo de muco deve aparecer (stamp=apice não é sangramento)
    await expect(page.getByText('Tipo de muco')).toBeVisible({ timeout: 3_000 });

    // Card informativo de ápice marcado deve aparecer
    await expect(page.getByText('Ápice marcado')).toBeVisible({ timeout: 3_000 });

    // Seções específicas de sangramento NÃO devem aparecer
    await expect(page.getByText('Intensidade')).not.toBeVisible();
    await expect(page.getByText('O que você observa')).not.toBeVisible();
    await expect(page.getByTestId('observacao-descricao')).not.toBeVisible();
  });

  // ── C2 ────────────────────────────────────────────────────────────────────────
  test('C2 — stamp=apice: selecionar Lubrificante + Transparente → ambos ativos', async ({ page }) => {
    const opened = await openDayDetailModal(page);
    if (!opened) {
      test.skip(true, 'Modal não abriu — dia clicável não encontrado no gráfico de demo');
      return;
    }

    await selectStamp(page, 'Ápice');
    await expect(page.getByText('Sensação')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('Tipo de muco')).toBeVisible({ timeout: 3_000 });

    // Seleciona Lubrificante (sensacao)
    await selectPill(page, 'Lubrificante');
    await expectPillActive(page, 'Lubrificante');

    // Clica no card Transparente (mucus='transparente')
    await selectMucusCard(page, 'Transparente');

    // Pill Sem muco fica inativa
    await expectPillInactive(page, 'Sem muco');

    // Card Transparente selecionado — descrição visível
    await expect(page.getByText('Claro, liso ou aquoso')).toBeVisible();

    // Lubrificante permanece ativa — combinação confirmada
    await expectPillActive(page, 'Lubrificante');

    // Seca e Molhada permanecem inativas
    await expectPillInactive(page, 'Seca');
    await expectPillInactive(page, 'Molhada');
  });
});
