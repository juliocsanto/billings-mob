/**
 * Vitest configuration — Sprint 1
 *
 * Coverage targets (ARCHITECTURE.md §10.1):
 *   - Global: >= 80%
 *   - Domain modules (api/_lib, api/observations, api/cycles): >= 95%
 *
 * Includes API unit tests (pure functions: vectorClock, sanitizeAuditData, schemas).
 * Integration tests against real Supabase are separate (test:integration).
 *
 * ADR-002: Node.js 22 runtime for API tests.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use node environment for API tests (no DOM needed for unit tests)
    environment: 'node',
    // Include all test files in api/ and src/
    include: [
      'api/**/__tests__/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
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
      ],
    },
    // TypeScript support
    typecheck: {
      enabled: false, // separate tsc --noEmit step in CI
    },
  },
});
