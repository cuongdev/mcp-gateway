import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupComplianceEnv, rpc, type ComplianceEnv } from './_setup.js';

describe('MCP compliance: resources/*', () => {
  let env: ComplianceEnv;
  beforeAll(async () => { env = await setupComplianceEnv(); });
  afterAll(async () => { await env.close(); });

  it('resources/list returns resources array with required fields', async () => {
    const resp = await rpc(env.app, 'resources/list');
    expect(resp.error).toBeUndefined();
    const result = resp.result as { resources: Array<Record<string, unknown>> };
    expect(Array.isArray(result.resources)).toBe(true);
    for (const r of result.resources) {
      expect(typeof r.uri).toBe('string');
      expect(typeof r.name).toBe('string');
    }
  });

  it('resources/templates/list returns resourceTemplates array (possibly empty)', async () => {
    const resp = await rpc(env.app, 'resources/templates/list');
    expect(resp.error).toBeUndefined();
    const result = resp.result as { resourceTemplates: unknown[] };
    expect(Array.isArray(result.resourceTemplates)).toBe(true);
  });

  it('resources/read without uri returns INVALID_PARAMS', async () => {
    const resp = await rpc(env.app, 'resources/read', {});
    expect(resp.error).toBeDefined();
    expect(resp.error?.code).toBe(-32602);
  });
});
