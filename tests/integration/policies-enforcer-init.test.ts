import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../fixtures/helpers/make-storage.js';
import { Gateway } from '../../src/gateway.js';
import { GatewayConfigSchema } from '../../src/config/schema.js';
import { newId } from '../../src/utils/uuid.js';
import { hashSecret } from '../../src/utils/crypto.js';
import { generateToken, computePrefix } from '../../src/identity/token.js';

async function setup() {
  const storage = await makeStorage();
  const id = newId();
  await storage.principals.createServiceAccount({ id, displayName: 'a' });
  const raw = generateToken('sat', 'live');
  await storage.tokens.create({
    id: newId(), principalId: id, prefix: computePrefix(raw), hash: await hashSecret(raw),
  });
  const config = GatewayConfigSchema.parse({
    mode: 'development',
    gateway: { port: 3999, host: '127.0.0.1' },
    authorization: { enabled: true, modelFile: './config/policy.model.conf', policyFile: './config/policy.csv' },
  });
  const gateway = new Gateway(config, storage);
  return { app: gateway.getApp(), storage, token: raw, gateway };
}

describe('Policies/Roles routes — enforcer init at boot', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
    // Simulate the production boot sequence — only call load() on the
    // class instance, NOT manually call initializeEnforcer. The Phase C
    // fix in gateway.ts must do that for us.
    await env.gateway.getPolicyEngine().load();
  });
  afterEach(async () => { await env.storage.close(); });

  it('GET /api/policies returns 200 with [] on fresh boot', async () => {
    const r = await env.app.fetch(new Request('http://x/api/policies', {
      headers: { Authorization: `Bearer ${env.token}` },
    }));
    expect(r.status).toBe(200);
    const body = await r.json() as { policies: string[][] };
    expect(Array.isArray(body.policies)).toBe(true);
  });

  it('GET /api/roles returns 200 with [] on fresh boot', async () => {
    const r = await env.app.fetch(new Request('http://x/api/roles', {
      headers: { Authorization: `Bearer ${env.token}` },
    }));
    expect(r.status).toBe(200);
    const body = await r.json() as { bindings: { user: string; role: string }[] };
    expect(Array.isArray(body.bindings)).toBe(true);
  });
});
