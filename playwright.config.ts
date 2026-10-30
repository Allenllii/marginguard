import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: ['browser.spec.ts', 'csv-mapping.browser.spec.ts', 'policy-to-test.browser.spec.ts', 'policy-test-audit.browser.spec.ts', 'preflight.browser.spec.ts', 'preflight-bridge.browser.spec.ts', 'preflight-comparison.browser.spec.ts'], workers: 1, retries: 0,
  use: { baseURL: process.env.MARGINGUARD_TEST_URL || 'http://127.0.0.1:3000', viewport: { width: 1440, height: 1080 }, browserName: 'chromium', channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list'], ['json', { outputFile: 'evidence/browser-results.json' }]],
});
