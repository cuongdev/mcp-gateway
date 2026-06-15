import { defineConfig } from '@playwright/test';

// Standalone config to capture real dashboard screenshots for docs/wiki/.
// Run: `npx playwright test -c playwright.shots.config.ts`
// Not part of the normal test:e2e run or CI — it writes PNGs into
// ../docs/wiki/images/ from the live gateways.
const PORT = 3001;        // dashboard (dev mode, open)
const OIDC_PORT = 3002;   // OIDC provider configured
const PAT_PORT = 3003;    // requireAuthForApi → user-cookie login
const MOCK_MCP_PORT = 8900;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // crisp retina screenshots
  },
  projects: [
    { name: 'shots-dashboard', testMatch: ['**/_shots/dashboard.shots.ts'], use: { baseURL: `http://localhost:${PORT}` } },
    { name: 'shots-oidc', testMatch: ['**/_shots/oidc.shots.ts'], use: { baseURL: `http://localhost:${OIDC_PORT}` } },
    { name: 'shots-pat', testMatch: ['**/_shots/my-tokens.shots.ts'], use: { baseURL: `http://localhost:${PAT_PORT}` } },
  ],
  webServer: [
    {
      command: 'node tests/e2e/support/mock-mcp.mjs',
      url: `http://localhost:${MOCK_MCP_PORT}/fs`,
      reuseExistingServer: true,
      timeout: 10_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `cd .. && GATEWAY_PORT=${PORT} STORAGE_PATH=./data/shots.sqlite NODE_ENV=test npm start`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `cd .. && GATEWAY_PORT=${OIDC_PORT} GATEWAY_CONFIG=./config/e2e-oidc.json STORAGE_PATH=./data/shots-oidc.sqlite NODE_ENV=test npm start`,
      url: `http://localhost:${OIDC_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `cd .. && GATEWAY_PORT=${PAT_PORT} GATEWAY_CONFIG=./config/e2e-pat.json STORAGE_PATH=./data/shots-pat.sqlite NODE_ENV=test npm start`,
      url: `http://localhost:${PAT_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
