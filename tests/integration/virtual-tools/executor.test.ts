import { describe, it, expect, vi } from 'vitest';
import { VirtualToolExecutor } from '../../../src/virtual-tools/executor.js';
import type { VirtualToolPlan } from '../../../src/virtual-tools/types.js';
import type { CapabilityRegistry } from '../../../src/capability/registry.js';
import type { SessionManager } from '../../../src/session/session.manager.js';
import type { RegisteredTool } from '../../../src/registry/tool.registry.js';

function makeRegistry(tools: Record<string, { server: string; original: string }>): CapabilityRegistry {
  const lookup = (name: string): RegisteredTool | undefined => {
    const t = tools[name];
    if (!t) return undefined;
    return {
      canonicalName: name, serverName: t.server, originalName: t.original,
      description: '', inputSchema: {}, enabled: true,
      cacheable: false, cacheTtlSec: null, cachePerPrincipal: false, sensitive: false,
    };
  };
  return {
    tools: () => ({ get: lookup }) as never,
    prompts: () => undefined as never,
    resources: () => undefined as never,
    roots: () => undefined as never,
    list: () => [] as never,
    get: () => undefined,
  } as unknown as CapabilityRegistry;
}

function makeSession(
  responses: Record<string, (args: unknown) => Promise<unknown> | unknown>,
): SessionManager {
  return {
    send: vi.fn(async (server: string, req: { params?: { name?: string; arguments?: unknown } }) => {
      const name = req?.params?.name ?? '';
      const handler = responses[`${server}/${name}`];
      if (!handler) throw new Error(`no mock for ${server}/${name}`);
      const result = await handler(req?.params?.arguments);
      return { jsonrpc: '2.0', id: 'x', result };
    }),
  } as unknown as SessionManager;
}

describe('VirtualToolExecutor', () => {
  it('sequential 3-step plan merges output via templates', async () => {
    const reg = makeRegistry({
      srv__a: { server: 'srv', original: 'a' },
      srv__b: { server: 'srv', original: 'b' },
      srv__c: { server: 'srv', original: 'c' },
    });
    const session = makeSession({
      'srv/a': () => ({ value: 10 }),
      'srv/b': (args) => ({ doubled: ((args as { x: number }).x) * 2 }),
      'srv/c': (args) => ({ shouted: String((args as { msg: string }).msg).toUpperCase() }),
    });
    const plan: VirtualToolPlan = {
      name: 'vt_chain',
      description: '',
      inputSchema: {},
      errorPolicy: 'fail_fast',
      steps: [
        { id: 's1', tool: 'srv__a', args: {} },
        { id: 's2', tool: 'srv__b', args: { x: '{{steps.s1.value}}' } },
        { id: 's3', tool: 'srv__c', args: { msg: '{{input.greeting}}' } },
      ],
      output: { format: 'merged', shape: {
        first: '{{steps.s1}}',
        doubled: '{{steps.s2.doubled}}',
        shouted: '{{steps.s3.shouted}}',
      } },
    };
    const exec = new VirtualToolExecutor(reg, session);
    const out = await exec.execute(plan, { greeting: 'hi' });
    expect(out).toEqual({
      first: { value: 10 },
      doubled: 20,
      shouted: 'HI',
    });
  });

  it('parallel group runs concurrently', async () => {
    const reg = makeRegistry({
      srv__a: { server: 'srv', original: 'a' },
      srv__b: { server: 'srv', original: 'b' },
    });
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const session = makeSession({
      'srv/a': async () => { await delay(80); return { ok: 'a' }; },
      'srv/b': async () => { await delay(80); return { ok: 'b' }; },
    });
    const plan: VirtualToolPlan = {
      name: 'vt_par', description: '', inputSchema: {}, errorPolicy: 'fail_fast',
      steps: [
        { id: 's1', tool: 'srv__a', args: {}, parallel: true },
        { id: 's2', tool: 'srv__b', args: {}, parallel: true },
      ],
      output: { format: 'merged', shape: { a: '{{steps.s1.ok}}', b: '{{steps.s2.ok}}' } },
    };
    const exec = new VirtualToolExecutor(reg, session);
    const t0 = Date.now();
    const out = await exec.execute(plan, {});
    const elapsed = Date.now() - t0;
    expect(out).toEqual({ a: 'a', b: 'b' });
    // If they ran sequentially this would be >= 160ms — allow generous threshold.
    expect(elapsed).toBeLessThan(160);
  });

  it('when=path skips the step when path is falsy', async () => {
    const reg = makeRegistry({ srv__a: { server: 'srv', original: 'a' } });
    const send = vi.fn();
    const session = { send } as unknown as SessionManager;
    const plan: VirtualToolPlan = {
      name: 'vt_when', description: '', inputSchema: {}, errorPolicy: 'fail_fast',
      steps: [{ id: 's1', tool: 'srv__a', args: {}, when: 'input.flag' }],
      output: { format: 'select', shape: '{{steps.s1}}' },
    };
    const exec = new VirtualToolExecutor(reg, session);
    const out = await exec.execute(plan, { flag: false });
    expect(send).not.toHaveBeenCalled();
    expect(out).toBeUndefined();
  });

  it('fail_fast halts on first step error', async () => {
    const reg = makeRegistry({
      srv__a: { server: 'srv', original: 'a' },
      srv__b: { server: 'srv', original: 'b' },
    });
    const callOrder: string[] = [];
    const session = makeSession({
      'srv/a': () => { callOrder.push('a'); throw new Error('boom'); },
      'srv/b': () => { callOrder.push('b'); return { ok: true }; },
    });
    const plan: VirtualToolPlan = {
      name: 'vt_ff', description: '', inputSchema: {}, errorPolicy: 'fail_fast',
      steps: [
        { id: 's1', tool: 'srv__a', args: {} },
        { id: 's2', tool: 'srv__b', args: {} },
      ],
      output: { format: 'merged', shape: { a: '{{steps.s1}}', b: '{{steps.s2}}' } },
    };
    const exec = new VirtualToolExecutor(reg, session);
    await expect(exec.execute(plan, {})).rejects.toThrow(/boom/);
    expect(callOrder).toEqual(['a']);
  });

  it('best_effort continues + records errors', async () => {
    const reg = makeRegistry({
      srv__a: { server: 'srv', original: 'a' },
      srv__b: { server: 'srv', original: 'b' },
    });
    const session = makeSession({
      'srv/a': () => { throw new Error('first-failed'); },
      'srv/b': () => ({ ok: true }),
    });
    const plan: VirtualToolPlan = {
      name: 'vt_be', description: '', inputSchema: {}, errorPolicy: 'best_effort',
      steps: [
        { id: 's1', tool: 'srv__a', args: {} },
        { id: 's2', tool: 'srv__b', args: {} },
      ],
      output: { format: 'merged', shape: {
        first: '{{steps.s1}}',
        second: '{{steps.s2.ok}}',
      } },
    };
    const exec = new VirtualToolExecutor(reg, session);
    const out = (await exec.execute(plan, {})) as { first: unknown; second: unknown };
    expect(out.second).toBe(true);
    expect(out.first).toEqual({ error: 'first-failed' });
  });

  it('dryRun returns per-step report', async () => {
    const reg = makeRegistry({ srv__a: { server: 'srv', original: 'a' } });
    const session = makeSession({ 'srv/a': () => ({ ok: 1 }) });
    const plan: VirtualToolPlan = {
      name: 'vt_d', description: '', inputSchema: {}, errorPolicy: 'fail_fast',
      steps: [{ id: 's1', tool: 'srv__a', args: { q: '{{input.q}}' } }],
      output: { format: 'select', shape: '{{steps.s1}}' },
    };
    const exec = new VirtualToolExecutor(reg, session);
    const report = await exec.dryRun(plan, { q: 'hello' });
    expect(report.steps.s1.args).toEqual({ q: 'hello' });
    expect(report.steps.s1.result).toEqual({ ok: 1 });
    expect(report.output).toEqual({ ok: 1 });
  });
});
