import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupComplianceEnv, rpc, type ComplianceEnv } from './_setup.js';

describe('MCP compliance: tools/*', () => {
  let env: ComplianceEnv;
  beforeAll(async () => { env = await setupComplianceEnv(); });
  afterAll(async () => { await env.close(); });

  it('tools/list returns tools array with required fields', async () => {
    const resp = await rpc(env.app, 'tools/list');
    expect(resp.error).toBeUndefined();
    const result = resp.result as { tools: Array<Record<string, unknown>> };
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);
    for (const t of result.tools) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.inputSchema).toBe('object');
      const schema = t.inputSchema as { type?: string };
      expect(schema.type).toBe('object');
    }
  });

  it('tools/list returns canonical names (server__tool format)', async () => {
    const resp = await rpc(env.app, 'tools/list');
    const result = resp.result as { tools: Array<{ name: string }> };
    const found = result.tools.find((t) => t.name === 'srv1__add');
    expect(found).toBeDefined();
  });

  it('tools/call with missing tool name returns INVALID_PARAMS', async () => {
    const resp = await rpc(env.app, 'tools/call', {});
    expect(resp.error).toBeDefined();
    expect(resp.error?.code).toBe(-32602); // MCP_ERROR_CODES.INVALID_PARAMS
  });

  it('tools/call with unknown tool returns METHOD_NOT_FOUND', async () => {
    const resp = await rpc(env.app, 'tools/call', { name: 'srv1__nope', arguments: {} });
    expect(resp.error).toBeDefined();
    expect(resp.error?.code).toBe(-32601);
  });
});
