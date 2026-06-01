/**
 * Playwright configuration — billings-mob E2E tests.
 *
 * Sprint 5 S5-03: golden-path tests for auth, observation grid,
 * link-instructor, and notification-preferences flows.
 *
 * Base URL: Vite dev server on port 5173.
 * Override with PLAYWRIGHT_BASE_URL in CI (staging Vercel URL).
 *
 * Clinical constraint: no test asserts text containing
 * "fértil", "infértil", "seguro" or "inseguro".
 * LGPD: no test reads or displays the `relations` or `notes` fields.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Start Vite dev server automatically during local E2E runs.
   * In CI, PLAYWRIGHT_BASE_URL points to the staging deployment. */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
