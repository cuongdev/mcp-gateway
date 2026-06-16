import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';

// Regression: development mode must default a session-cookie secret so that
// POST /auth/dev-login (and the OIDC callback) work out of the box. Without it
// the route returns 500 "session_misconfigured" — the dashboard "Enter as
// Admin (Dev Mode)" button then fails with "Dev login failed: Internal Server
// Error". loadConfig() with no path loads ./config/gateway.config.json (dev).
describe('loadConfig — development session-cookie secret default', () => {
  it('populates auth.sessionCookieSecret in development mode', () => {
    const cfg = loadConfig();
    expect(cfg.mode).toBe('development');
    expect(cfg.auth.sessionCookieSecret).toBeTruthy();
    expect((cfg.auth.sessionCookieSecret as string).length).toBeGreaterThanOrEqual(32);
  });
});
