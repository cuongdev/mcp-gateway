import { defineConfig } from '@playwright/test';

// Use port 3001 so Playwright tests don't conflict with a local dev server on 3000.
const TEST_PORT = 3001;
// Mock MCP upstream — gives the gateway real tools/prompts/resources to discover
// so "with-data" tests aren't limited to empty states.
const MOCK_MCP_PORT = 8900;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  // Fail the build on accidentally committed test.only.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // HTML report (browsable) + JUnit (CI ingestion) + line (console).
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      // Mock MCP upstream on :8900 with /fs, /db, /gh tool sets.
      command: 'node tests/e2e/support/mock-mcp.mjs',
      url: `http://localhost:${MOCK_MCP_PORT}/fs`,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Assumes a built gateway dashboard at dist/dashboard/ and a freshly
      // seeded sqlite at ./data/playwright.sqlite. The smoke test starts the
      // gateway against it via `npm start` from the repo root.
      command: `cd .. && GATEWAY_PORT=${TEST_PORT} STORAGE_PATH=./data/playwright.sqlite NODE_ENV=test npm start`,
      url: `http://localhost:${TEST_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
