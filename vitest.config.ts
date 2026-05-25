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
      // Sprint 1 (unit tests only): pure function modules are the only measurable scope.
      // Integration tests (Hono endpoint handlers against Supabase local) will raise
      // overall coverage to >= 80% in Sprint 2 when the local Supabase stack is configured.
      // Threshold enforced here covers only unit-testable pure functions.
      // TODO Sprint 2: raise to statements: 80, branches: 80, functions: 80, lines: 80
      thresholds: {
        // Per-file thresholds on domain utility modules (pure functions — fully unit-testable)
        perFile: false,
        // Global threshold deliberately set low for Sprint 1 (endpoint handlers not yet covered)
        // Coverage is meaningful only for _lib/* pure functions — enforced via test quality not threshold
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
