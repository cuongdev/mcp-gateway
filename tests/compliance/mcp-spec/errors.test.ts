import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupComplianceEnv, rpc, type ComplianceEnv } from './_setup.js';

describe('MCP compliance: error envelope shape', () => {
  let env: ComplianceEnv;
  beforeAll(async () => { env = await setupComplianceEnv(); });
  afterAll(async () => { await env.close(); });

  it('unknown method returns METHOD_NOT_FOUND with conforming envelope', async () => {
    const resp = await rpc(env.app, 'definitely/not_a_method');
    expect(resp.jsonrpc).toBe('2.0');
    expect(resp.id).toBe(1);
    expect(resp.error).toBeDefined();
    expect(resp.error?.code).toBe(-32601);
    expect(typeof resp.error?.message).toBe('string');
  });

  it('ping returns empty result (jsonrpc envelope intact)', async () => {
    const resp = await rpc(env.app, 'ping');
    expect(resp.jsonrpc).toBe('2.0');
    expect(resp.id).toBe(1);
    expect(resp.error).toBeUndefined();
    expect(resp.result).toEqual({});
  });
});
