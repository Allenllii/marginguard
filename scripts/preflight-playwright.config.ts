import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Independent local regression harness; no provider flags, secret loading,
// publication, evaluation suite or recording command is involved.
export default defineConfig({
  testDir: '../tests',
  testMatch: ['browser.spec.ts', 'preflight.browser.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx server/index.ts --offline-qa',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { PORT: '4178', BIND_HOST: '127.0.0.1', TAVILY_ENABLE_LIVE: 'false', NEBIUS_ENABLE_LIVE: 'false' },
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../evidence/preflight-browser-results.json', import.meta.url)) }]],
});
