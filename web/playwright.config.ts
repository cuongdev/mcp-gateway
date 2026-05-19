import { defineConfig } from '@playwright/test';

// Use port 3001 so Playwright tests don't conflict with a local dev server on 3000.
const TEST_PORT = 3001;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // Assumes a built gateway dashboard at dist/dashboard/ and a freshly
    // seeded sqlite at ./data/playwright.sqlite. The smoke test starts the
    // gateway against it via `npm start` from the repo root.
    command: `cd .. && GATEWAY_PORT=${TEST_PORT} STORAGE_PATH=./data/playwright.sqlite NODE_ENV=test npm start`,
    url: `http://localhost:${TEST_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
