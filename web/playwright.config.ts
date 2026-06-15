import { defineConfig } from '@playwright/test';

// Three gateway instances, each a separate Playwright project, so the
// dev-mode-open dashboard suite stays isolated from the two auth-variant
// screens that need a different gateway configuration:
//   :3001 dashboard  — dev mode, admin API open, injected service_account
//   :3002 oidc       — dev mode + an OIDC provider configured (populated page)
//   :3003 my-tokens  — requireAuthForApi → user-cookie login enables PAT CRUD
const PORT = 3001;
const OIDC_PORT = 3002;
const PAT_PORT = 3003;
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
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // Everything except the two auth-variant screens, against the open
      // dev-mode gateway on :3001.
      name: 'dashboard',
      testIgnore: ['**/oidc.*.spec.ts', '**/my-tokens.*.spec.ts'],
      use: { baseURL: `http://localhost:${PORT}` },
    },
    {
      // OIDC Providers page, against the gateway that has a provider configured.
      name: 'oidc',
      testMatch: ['**/oidc.*.spec.ts'],
      use: { baseURL: `http://localhost:${OIDC_PORT}` },
    },
    {
      // My Tokens (PAT) CRUD, against the gateway that requires API auth so a
      // user-principal session cookie is honored.
      name: 'my-tokens',
      testMatch: ['**/my-tokens.*.spec.ts'],
      use: { baseURL: `http://localhost:${PAT_PORT}` },
    },
  ],
  webServer: [
    {
      // Mock MCP upstream on :8900 with /fs, /db, /gh tool/prompt/resource sets.
      command: 'node tests/e2e/support/mock-mcp.mjs',
      url: `http://localhost:${MOCK_MCP_PORT}/fs`,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Dashboard gateway — dev mode, admin API open. Assumes a built dashboard
      // at dist/dashboard/ and starts the gateway via `npm start`.
      command: `cd .. && GATEWAY_PORT=${PORT} STORAGE_PATH=./data/playwright.sqlite NODE_ENV=test npm start`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // OIDC gateway — dev mode with one OIDC provider configured.
      command: `cd .. && GATEWAY_PORT=${OIDC_PORT} GATEWAY_CONFIG=./config/e2e-oidc.json STORAGE_PATH=./data/playwright-oidc.sqlite NODE_ENV=test npm start`,
      url: `http://localhost:${OIDC_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // PAT gateway — requireAuthForApi so a user-principal cookie is honored.
      command: `cd .. && GATEWAY_PORT=${PAT_PORT} GATEWAY_CONFIG=./config/e2e-pat.json STORAGE_PATH=./data/playwright-pat.sqlite NODE_ENV=test npm start`,
      url: `http://localhost:${PAT_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
