import { defineConfig } from 'vitest/config';

/**
 * Config for running the worldgen-matrix authoring tool ONLY (change 244 re-pin path):
 *   npx vitest run --config scripts/worldgen/vitest.author.config.ts
 * It exists because the root vitest.config.ts includes only tests/unit/**, which keeps this
 * authoring test out of CI and the normal suite. Run it after a deliberate worldgen/registry
 * change to regenerate PINNED_V1_CATALOG / PINNED_V1_MATRIX_HASH /
 * PINNED_WORLDGEN_STATE_FINGERPRINT (see src/worldgen/WorldgenRegressionMatrix.ts).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/worldgen/**/*.test.ts'],
    testTimeout: 30000,
  },
});
