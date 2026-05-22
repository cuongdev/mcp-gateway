import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupComplianceEnv, rpc, type ComplianceEnv } from './_setup.js';

describe('MCP compliance: prompts/*', () => {
  let env: ComplianceEnv;
  beforeAll(async () => { env = await setupComplianceEnv(); });
  afterAll(async () => { await env.close(); });

  it('prompts/list returns prompts array with arguments shape', async () => {
    const resp = await rpc(env.app, 'prompts/list');
    expect(resp.error).toBeUndefined();
    const result = resp.result as { prompts: Array<Record<string, unknown>> };
    expect(Array.isArray(result.prompts)).toBe(true);
    for (const p of result.prompts) {
      expect(typeof p.name).toBe('string');
      // arguments may be absent if the prompt takes none
      if (p.arguments) {
        expect(Array.isArray(p.arguments)).toBe(true);
      }
    }
  });

  it('prompts/get with disabled or unknown name returns INVALID_PARAMS', async () => {
    const resp = await rpc(env.app, 'prompts/get', { name: 'srv1__does_not_exist' });
    expect(resp.error).toBeDefined();
    expect(resp.error?.code).toBe(-32602);
  });
});
