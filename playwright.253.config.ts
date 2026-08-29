import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--js-flags=--expose-gc',
        ...(process.env.PW_SWIFT ? ['--use-angle=swiftshader'] : []),
      ],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: false,
    env: { VITE_E2E: 'true' },
    timeout: 120_000,
  },
});
