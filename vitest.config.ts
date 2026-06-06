/**
 * Vitest configuration — Sprint 2 (updated)
 *
 * Coverage targets (ARCHITECTURE.md §10.1):
 *   - Global: >= 80%
 *   - Domain modules (api/_lib, api/observations, api/cycles): >= 95%
 *
 * Environments:
 *   - api/**  → node (no DOM needed for Hono serverless unit tests)
 *   - src/**  → jsdom (React hooks + localStorage + Testing Library)
 *
 * ADR-002: Node.js 24 runtime for API tests.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default to node; src/ tests override to jsdom via environmentMatchGlobs
    environment: 'node',
    environmentMatchGlobs: [
      // All src/ tests need browser APIs (localStorage, DOM, renderHook)
      ['src/**/*.{test,spec}.{ts,tsx,js,jsx}', 'jsdom'],
      ['src/**/__tests__/**/*.{test,spec}.{ts,tsx,js,jsx}', 'jsdom'],
    ],
    // setupFiles for jsdom environment — provides jest-dom matchers for src/ tests
    setupFiles: ['./src/test-setup.ts'],
    // Include all test files in api/ and src/ (ts, tsx, js, jsx)
    include: [
      'api/**/__tests__/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx,js,jsx}',
      'src/**/*.{test,spec}.{ts,tsx,js,jsx}',
    ],
    // Exclude node_modules and dist
    exclude: ['node_modules/**', 'dist/**'],
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // Coverage thresholds (ARCHITECTURE.md §10.1):
      // Sprint 1 complete: integration tests added via in-memory Hono mocks (vi.mock).
      // All endpoint handlers are now covered. Global threshold >= 80% enforced.
      // Current achieved: Statements 92%, Branches 80%, Functions 89%, Lines 92%.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      // Include API and src in coverage measurement
      include: ['api/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: [
        'api/**/__tests__/**',
        'src/**/__tests__/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Supabase client configuration — integration-only, no unit-testable logic
        'api/_lib/supabaseClient.ts',
        'src/lib/supabaseClient.ts',
        // AuthGate.tsx — React auth wrapper, requires E2E testing (Sprint 5)
        'src/components/AuthGate.tsx',
        // useObservationSync.ts — unit tests added in Sprint 3 item #1
      ],
    },
    // TypeScript support
    typecheck: {
      enabled: false, // separate tsc --noEmit step in CI
    },
  },
});
