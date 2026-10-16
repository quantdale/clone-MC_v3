import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Overworld is now 384 blocks (24 sections, 6×64 slabs). Software WebGL in
  // headless Chromium renders at ~5 FPS, so the initial generation/mesh budget
  // needs ~15s; allow 90s per test to avoid flakiness on CI.
  timeout: 90_000,
  // WebGL rendering is software-rendered in headless Chromium and starves
  // under parallel load (pages load at ~10 FPS). A single worker keeps the
  // suite stable.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Test-only Chromium flags (239): expose `window.gc()` so the long-session
    // memory suite can force GC before settled heap samples. Never affects the
    // production build.
    launchOptions: {
      args: [
        '--js-flags=--expose-gc',
        ...(process.env.PW_SWIFT ? ['--use-angle=swiftshader'] : []),
      ],
    },
  },
  webServer: {
    // Build and serve the exact production artifact used for release. The
    // test-only hook is enabled at build time, never through a URL parameter.
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
    env: {
      VITE_E2E: 'true',
    },
    timeout: 120_000,
  },
});
