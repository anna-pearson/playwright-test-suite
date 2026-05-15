import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,

  // retry failed tests once in CI to handle flakiness
  retries: process.env.CI ? 1 : 0,

  // always generate both: terminal output + HTML report
  reporter: [['list'], ['html', { open: 'never' }]],

  projects: [
    // API tests hit the server directly — no browser needed, run once
    { name: 'api', testMatch: 'api.spec.ts' },
    // E2E tests run in all 3 browsers
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: 'api.spec.ts' },
    { name: 'firefox', use: { browserName: 'firefox' }, testIgnore: 'api.spec.ts' },
    { name: 'webkit', use: { browserName: 'webkit' }, testIgnore: 'api.spec.ts' },
  ],

  use: {
    baseURL: 'http://localhost:4173',

    // headless in CI (no screen), visible locally so you can watch
    headless: !!process.env.CI,

    screenshot: 'only-on-failure',

    // capture a trace on first retry (helps debug failures in CI)
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'node server.js',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
