import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupComplianceEnv, rpc, type ComplianceEnv } from './_setup.js';

describe('MCP compliance: initialize', () => {
  let env: ComplianceEnv;
  beforeAll(async () => { env = await setupComplianceEnv(); });
  afterAll(async () => { await env.close(); });

  it('returns protocolVersion + capabilities + serverInfo', async () => {
    const resp = await rpc(env.app, 'initialize');
    expect(resp.jsonrpc).toBe('2.0');
    expect(resp.id).toBe(1);
    expect(resp.error).toBeUndefined();
    const result = resp.result as Record<string, unknown>;
    expect(typeof result.protocolVersion).toBe('string');
    expect(result.capabilities).toBeDefined();
    expect(typeof (result.serverInfo as Record<string, unknown>).name).toBe('string');
    expect(typeof (result.serverInfo as Record<string, unknown>).version).toBe('string');
  });
});
