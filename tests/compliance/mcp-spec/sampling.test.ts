import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupComplianceEnv, rpc, type ComplianceEnv } from './_setup.js';

describe('MCP compliance: sampling/createMessage + roots/list', () => {
  let env: ComplianceEnv;
  beforeAll(async () => { env = await setupComplianceEnv(); });
  afterAll(async () => { await env.close(); });

  it('sampling/createMessage returns METHOD_NOT_FOUND in v0.8 (deferred)', async () => {
    // v0.8 logs the attempt + returns method_not_found. v0.9 wires the
    // ReverseChannelMux and this test should change to a success/timeout case.
    const resp = await rpc(env.app, 'sampling/createMessage', { messages: [] });
    expect(resp.error).toBeDefined();
    expect(resp.error?.code).toBe(-32601); // METHOD_NOT_FOUND
    expect(resp.error?.message).toMatch(/deferred|v0\.9|reverse channel/i);
  });

  it('roots/list returns roots array (empty in v0.8 — gateway-managed view)', async () => {
    const resp = await rpc(env.app, 'roots/list');
    expect(resp.error).toBeUndefined();
    const result = resp.result as { roots: unknown[] };
    expect(Array.isArray(result.roots)).toBe(true);
  });
});
