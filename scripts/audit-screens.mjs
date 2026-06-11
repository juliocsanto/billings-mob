// UI audit sweep for billings-mob (:5173) and billings-web (:5174).
// Screenshots every screen at mobile (375x812) + desktop (1280x900), captures
// console warnings/errors + pageerrors + failed requests, and runs axe-core
// WCAG 2.1 AA checks per screen/viewport.
//
// Prereqs: both dev servers running; /tmp/session-aluna.json and
// /tmp/session-instrutora.json produced by scripts/get-test-session.mjs.
//
// Usage: node scripts/audit-screens.mjs
// Output: docs/audit-screenshots/*.png + docs/audit-data.json (workspace root)

import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`;
const OUT_DIR = '/home/juliocsanto/billings/docs/audit-screenshots';
const STORAGE_KEY = 'sb-gcwxwrjzbbqkuzcweyut-auth-token';
const ALUNA_ID = 'e2e00000-0000-4000-8000-000000000001';

const sessionAluna = readFileSync('/tmp/session-aluna.json', 'utf8');
const sessionInstrutora = readFileSync('/tmp/session-instrutora.json', 'utf8');

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 900 },
};

const MOB_TABS = ['hoje', 'grafico', 'analise', 'guia', 'feedback', 'vinculo', 'notificacoes', 'perfil'];
const WEB_ROUTES = [
  { name: 'login', path: '/login', auth: false },
  { name: 'privacy', path: '/privacy', auth: false },
  { name: 'dashboard', path: '/', auth: true },
  { name: 'student-detail', path: `/students/${ALUNA_ID}`, auth: true },
  { name: 'conflicts', path: '/conflicts', auth: true },
  { name: 'links', path: '/links', auth: true },
  { name: 'billing', path: '/billing', auth: true },
  { name: 'feedback', path: '/feedback', auth: true },
];

mkdirSync(OUT_DIR, { recursive: true });
const findings = [];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
const OUT_JSON = `/home/juliocsanto/billings/docs/audit-data${THEME === 'dark' ? '-dark' : ''}.json`;

async function newPage(viewport, session, { disableLocks = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'pt-BR' });
  await ctx.addInitScript((t) => localStorage.setItem('billings-theme', t), THEME);
  if (session) {
    await ctx.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [STORAGE_KEY, session]
    );
  }
  if (disableLocks) {
    // Workaround for P0 web-auth deadlock (supabase query awaited inside
    // onAuthStateChange holds the Navigator LockManager lock). Audit-only.
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    });
  }
  const page = await ctx.newPage();
  const logs = { console: [], pageerrors: [], failedRequests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      logs.console.push(`[${m.type()}] ${m.text().slice(0, 400)}`);
  });
  page.on('pageerror', (e) => logs.pageerrors.push(String(e).slice(0, 400)));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.includes('sentry') && !u.startsWith('ws'))
      logs.failedRequests.push(`${r.method()} ${u.slice(0, 200)} :: ${r.failure()?.errorText}`);
  });
  return { ctx, page, logs };
}

async function capture(app, name, vpName, page, logs) {
  const file = `${app}-${name}-${vpName}${THEME === 'dark' ? '-dark' : ''}.png`;
  await page.screenshot({ path: `${OUT_DIR}/${file}`, fullPage: true });
  let axe = { violations: [] };
  try {
    const res = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    axe.violations = res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.html?.slice(0, 200),
    }));
  } catch (e) {
    axe.error = String(e).slice(0, 200);
  }
  findings.push({
    app, screen: name, viewport: vpName, file,
    console: [...logs.console], pageerrors: [...logs.pageerrors],
    failedRequests: [...logs.failedRequests], axe,
  });
  logs.console.length = 0; logs.pageerrors.length = 0; logs.failedRequests.length = 0;
  console.log(`  ✓ ${file} (axe: ${axe.violations?.length ?? '?'} violations)`);
}

const ONLY = process.argv[2] || 'all'; // 'mob' | 'web' | 'all'

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  // ── billings-mob ──
  if (ONLY !== 'web') {
  console.log(`\n— billings-mob @ ${vpName} —`);
  {
    const { ctx, page, logs } = await newPage(viewport, null);
    await page.goto('http://localhost:5173/', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await capture('mob', 'login', vpName, page, logs);
    await ctx.close();
  }
  {
    const { ctx, page, logs } = await newPage(viewport, sessionAluna);
    await page.goto('http://localhost:5173/', { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    // Sprint 6 nav: 5 primary tabs (data-testid nav-*); vinculo/notificacoes/
    // feedback live as menu entries inside Perfil (data-testid menu-*).
    const go = async (testId) => {
      await page.getByTestId(testId).click({ timeout: 5000 });
      await page.waitForTimeout(1200);
    };
    try {
      await capture('mob', 'tab-hoje', vpName, page, logs);
      await go('nav-grafico');
      await capture('mob', 'tab-grafico', vpName, page, logs);
      try {
        await page.locator('div[role="button"][aria-label]').first().click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        await capture('mob', 'day-detail-modal', vpName, page, logs);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      } catch {
        console.log('  ⚠ day-detail-modal: click failed');
      }
      await go('nav-analise');
      await capture('mob', 'tab-analise', vpName, page, logs);
      await go('nav-guia');
      await capture('mob', 'tab-guia', vpName, page, logs);
      await go('nav-perfil');
      await capture('mob', 'tab-perfil', vpName, page, logs);
      await go('menu-vinculo');
      await capture('mob', 'tab-vinculo', vpName, page, logs);
      await go('nav-perfil');
      await go('menu-notificacoes');
      await capture('mob', 'tab-notificacoes', vpName, page, logs);
      await go('nav-perfil');
      await go('menu-feedback');
      await capture('mob', 'tab-feedback', vpName, page, logs);
    } catch (e) {
      console.log(`  ⚠ mob nav: ${String(e).slice(0, 140)}`);
    }
    await ctx.close();
  }
  }

  // ── billings-web ──
  if (ONLY === 'mob') continue;
  console.log(`\n— billings-web @ ${vpName} —`);
  for (const route of WEB_ROUTES) {
    const { ctx, page, logs } = await newPage(viewport, route.auth ? sessionInstrutora : null, { disableLocks: route.auth });
    try {
      await page.goto(`http://localhost:5174${route.path}`, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      await capture('web', route.name, vpName, page, logs);
    } catch (e) {
      console.log(`  ⚠ ${route.name}: ${String(e).slice(0, 120)}`);
    }
    await ctx.close();
  }
}

await browser.close();
// Merge with previous run when only one app was recaptured
let merged = findings;
if (ONLY !== 'all') {
  try {
    const prev = JSON.parse(readFileSync(OUT_JSON, 'utf8'));
    merged = [...prev.filter((f) => f.app !== (ONLY === 'web' ? 'web' : 'mob')), ...findings];
  } catch { /* first run */ }
}
writeFileSync(OUT_JSON, JSON.stringify(merged, null, 2));
console.log(`\nDone. ${findings.length} captures → docs/audit-data.json`);
