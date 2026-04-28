import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,

  // retry failed tests once in CI to handle flakiness
  retries: process.env.CI ? 1 : 0,

  // generate an HTML report after each run
  reporter: process.env.CI ? 'html' : 'list',

  use: {
    browserName: 'chromium',

    // headless in CI (no screen), visible locally so you can watch
    headless: !!process.env.CI,

    screenshot: 'only-on-failure',

    // capture a trace on first retry (helps debug failures in CI)
    trace: 'on-first-retry',
  },
});
