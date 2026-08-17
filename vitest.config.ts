import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    // Default per-test timeout raised from the 5s default to 30s. The unit suite
    // contains heavy worldgen/terrain/worker-saturation tests that exceed 5s only
    // under full-suite v8 coverage instrumentation (the added hardening coverage
    // gate). 30s matches the existing per-test `{ timeout: 30000 }` already used by
    // LightSaturation.test.ts and keeps genuine hangs detectable without making
    // coverage-instrumentation overhead a flaky failure. Product resource ceilings
    // (geometry/memory budgets, simulation tick budgets) are unchanged.
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // No-regression thresholds pinned to the measured hardening baseline
      // (2026-08-17, commit e034c49 + testTimeout fix): Stmts 85.04%,
      // Branches 91.63%, Functions 95.21%, Lines 85.04%. Set at the observed
      // healthy baseline so any coverage drop fails CI (no gaming the floor down).
      thresholds: {
        statements: 85,
        branches: 91,
        functions: 95,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});