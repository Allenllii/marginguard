import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'csv-mapping.browser.spec.ts', workers: 1, retries: 0,
  use: { baseURL: process.env.MARGINGUARD_TEST_URL || 'http://127.0.0.1:4317', viewport: { width: 1440, height: 1080 }, browserName: 'chromium', channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list'], ['json', { outputFile: 'evidence/csv-mapping-browser-results.json' }]],
});
