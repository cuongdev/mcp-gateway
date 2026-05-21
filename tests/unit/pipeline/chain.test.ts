import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineChain } from '../../../src/pipeline/chain.js';
import {
  PipelineReject,
  type Interceptor,
  type PipelineContext,
  type PipelineOutcome,
} from '../../../src/pipeline/types.js';
import type { Principal } from '../../../src/identity/principal.js';

// ---------- helpers ----------

function makeSpan() {
  return { setAttribute: vi.fn() } as any;
}

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const principal: Principal = {
    id: 'p1',
    type: 'service_account',
    displayName: 'tester',
    disabled: false,
    authMethod: 'none',
  };
  return {
    requestId: 'req-1',
    jsonrpcId: 1,
    method: 'tools/call',
    params: { name: 'echo', arguments: {} },
    principal,
    tenantId: 't1',
    metadata: new Map(),
    span: makeSpan(),
    startedAt: performance.now(),
    ...overrides,
  };
}

interface RecordedCall {
  name: string;
  phase: 'before' | 'after' | 'finally' | 'upstream';
  ts: number;
}

function makeRecorder() {
  const calls: RecordedCall[] = [];
  let counter = 0;
  const tick = () => ++counter;
  return { calls, tick };
}

function makeInterceptor(
  name: string,
  priority: number,
  recorder: ReturnType<typeof makeRecorder>,
  opts: Partial<Interceptor> = {},
): Interceptor {
  return {
    name,
    priority,
    enabled: true,
    async before(_ctx) {
      recorder.calls.push({ name, phase: 'before', ts: recorder.tick() });
    },
    async after(_ctx, result) {
      recorder.calls.push({ name, phase: 'after', ts: recorder.tick() });
      return result;
    },
    async finally(_ctx, _outcome) {
      recorder.calls.push({ name, phase: 'finally', ts: recorder.tick() });
    },
    ...opts,
  };
}

// ---------- tests ----------

describe('PipelineChain', () => {
  let recorder: ReturnType<typeof makeRecorder>;

  beforeEach(() => {
    recorder = makeRecorder();
  });

  it('runs before in ascending priority, upstream, then after in descending priority', async () => {
    const a = makeInterceptor('a', 10, recorder);
    const b = makeInterceptor('b', 20, recorder);
    const c = makeInterceptor('c', 30, recorder);

    // Construct out-of-order to ensure sorting happens.
    const chain = new PipelineChain([c, a, b]);

    const ctx = makeCtx();
    const result = await chain.run(ctx, async () => {
      recorder.calls.push({ name: '__upstream__', phase: 'upstream', ts: recorder.tick() });
      return { ok: true };
    });

    expect(result).toEqual({ ok: true });

    const order = recorder.calls.map((c) => `${c.name}:${c.phase}`);
    expect(order).toEqual([
      'a:before',
      'b:before',
      'c:before',
      '__upstream__:upstream',
      'c:after',
      'b:after',
      'a:after',
      'c:finally',
      'b:finally',
      'a:finally',
    ]);
  });

  it('sorts interceptors once at construction (pipeline getter is stable + ordered)', async () => {
    const a = makeInterceptor('a', 10, recorder);
    const b = makeInterceptor('b', 20, recorder);
    const c = makeInterceptor('c', 30, recorder);

    const chain = new PipelineChain([c, a, b]);
    const first = chain.pipeline.map((i) => i.name);
    expect(first).toEqual(['a', 'b', 'c']);

    // Mutating the original priority must NOT re-sort the chain.
    (b as { priority: number }).priority = 5;
    const second = chain.pipeline.map((i) => i.name);
    expect(second).toEqual(first);
  });

  it('drops disabled interceptors at construction', async () => {
    const a = makeInterceptor('a', 10, recorder);
    const b = makeInterceptor('b', 20, recorder, { enabled: false });
    const c = makeInterceptor('c', 30, recorder);

    const chain = new PipelineChain([a, b, c]);
    expect(chain.pipeline.map((i) => i.name)).toEqual(['a', 'c']);

    await chain.run(makeCtx(), async () => 'ok');
    expect(recorder.calls.find((c) => c.name === 'b')).toBeUndefined();
  });

  it('PipelineReject thrown from before short-circuits the rest of before + upstream + after', async () => {
    const upstream = vi.fn(async () => 'should-not-run');
    const reject = new PipelineReject(403, 'redaction_block', 'nope');

    const a = makeInterceptor('a', 10, recorder);
    const b = makeInterceptor('b', 20, recorder, {
      async before() {
        recorder.calls.push({ name: 'b', phase: 'before', ts: recorder.tick() });
        throw reject;
      },
    });
    const c = makeInterceptor('c', 30, recorder);

    const chain = new PipelineChain([a, b, c]);
    await expect(chain.run(makeCtx(), upstream)).rejects.toBe(reject);

    expect(upstream).not.toHaveBeenCalled();

    // a ran before; b threw inside before (not recorded as ran); c never ran.
    // Only `a` is eligible for `finally`.
    const phases = recorder.calls.map((c) => `${c.name}:${c.phase}`);
    expect(phases).toEqual(['a:before', 'b:before', 'a:finally']);
  });

  it('finally hooks receive { kind: "rejected", reason } when before throws PipelineReject', async () => {
    const reject = new PipelineReject(429, 'rate_limited', 'slow down');
    const finallyA = vi.fn(async (_ctx: PipelineContext, _outcome: PipelineOutcome) => {});

    const a: Interceptor = {
      name: 'a',
      priority: 10,
      enabled: true,
      finally: finallyA,
    };
    const b: Interceptor = {
      name: 'b',
      priority: 20,
      enabled: true,
      async before() {
        throw reject;
      },
    };

    const chain = new PipelineChain([a, b]);
    await expect(chain.run(makeCtx(), async () => 'x')).rejects.toBe(reject);

    expect(finallyA).toHaveBeenCalledTimes(1);
    const outcome = finallyA.mock.calls[0]![1];
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') {
      expect(outcome.reason).toBe(reject);
      expect(typeof outcome.latencyMs).toBe('number');
    }
  });

  it('finally hooks receive { kind: "upstream_error", error } when upstream throws non-PipelineReject', async () => {
    const err = new Error('boom');
    const finallyA = vi.fn(async (_ctx: PipelineContext, _outcome: PipelineOutcome) => {});

    const a: Interceptor = {
      name: 'a',
      priority: 10,
      enabled: true,
      finally: finallyA,
    };

    const chain = new PipelineChain([a]);
    await expect(
      chain.run(makeCtx(), async () => {
        throw err;
      }),
    ).rejects.toBe(err);

    expect(finallyA).toHaveBeenCalledTimes(1);
    const outcome = finallyA.mock.calls[0]![1];
    expect(outcome.kind).toBe('upstream_error');
    if (outcome.kind === 'upstream_error') {
      expect(outcome.error).toBe(err);
    }
  });

  it('finally hooks run in reverse priority order on success', async () => {
    const a = makeInterceptor('a', 10, recorder);
    const b = makeInterceptor('b', 20, recorder);
    const c = makeInterceptor('c', 30, recorder);

    const chain = new PipelineChain([a, b, c]);
    await chain.run(makeCtx(), async () => 'ok');

    const finallies = recorder.calls
      .filter((x) => x.phase === 'finally')
      .map((x) => x.name);
    expect(finallies).toEqual(['c', 'b', 'a']);
  });

  it('finally hooks run in reverse for the rejection path as well', async () => {
    const a = makeInterceptor('a', 10, recorder);
    const b = makeInterceptor('b', 20, recorder);
    const c = makeInterceptor('c', 30, recorder, {
      async before() {
        recorder.calls.push({ name: 'c', phase: 'before', ts: recorder.tick() });
        throw new PipelineReject(403, 'denied', 'no');
      },
    });

    const chain = new PipelineChain([a, b, c]);
    await expect(chain.run(makeCtx(), async () => 'never')).rejects.toBeInstanceOf(PipelineReject);

    const finallies = recorder.calls
      .filter((x) => x.phase === 'finally')
      .map((x) => x.name);
    // c failed inside before -> not recorded; a + b ran before -> finally reversed.
    expect(finallies).toEqual(['b', 'a']);
  });

  it('errors thrown in finally are swallowed and do not affect the outcome', async () => {
    const a: Interceptor = {
      name: 'a',
      priority: 10,
      enabled: true,
      async finally() {
        throw new Error('finally-boom-a');
      },
    };
    const b: Interceptor = {
      name: 'b',
      priority: 20,
      enabled: true,
      async finally() {
        throw new Error('finally-boom-b');
      },
    };

    const chain = new PipelineChain([a, b]);
    const result = await chain.run(makeCtx(), async () => ({ ok: 1 }));
    expect(result).toEqual({ ok: 1 });

    // Rejection path also swallows finally throws.
    const reject = new PipelineReject(500, 'oops', 'oops');
    const c: Interceptor = {
      name: 'c',
      priority: 5,
      enabled: true,
      async before() {
        throw reject;
      },
    };
    const chain2 = new PipelineChain([c, a]);
    // chain2: c (priority 5) runs first and throws; a (priority 10) never ran
    // before, so it should not receive `finally`. To exercise the swallow
    // path on the reject branch, put a BEFORE c.
    const chain3 = new PipelineChain([a, c]);
    await expect(chain3.run(makeCtx(), async () => 'x')).rejects.toBe(reject);
    // If we got here without throwing, finally errors were swallowed.
  });

  it('after hook can rewrite the result; returning undefined keeps prior result', async () => {
    const interceptor: Interceptor = {
      name: 'rewrite',
      priority: 10,
      enabled: true,
      async after(_ctx, result) {
        return { wrapped: result };
      },
    };
    const noop: Interceptor = {
      name: 'noop',
      priority: 20,
      enabled: true,
      async after() {
        return undefined;
      },
    };

    const chain = new PipelineChain([interceptor, noop]);
    const result = await chain.run(makeCtx(), async () => 'inner');
    // noop (priority 20) runs after first (returns undefined -> keep 'inner'),
    // then rewrite (priority 10) wraps it.
    expect(result).toEqual({ wrapped: 'inner' });
  });

  it('interceptor without before/after still receives finally', async () => {
    const finallyOnly: Interceptor = {
      name: 'finally-only',
      priority: 50,
      enabled: true,
      finally: vi.fn(async () => {}),
    };
    const chain = new PipelineChain([finallyOnly]);
    await chain.run(makeCtx(), async () => 'ok');
    expect(finallyOnly.finally).toHaveBeenCalledTimes(1);
  });

  it('span.setAttribute is called for each before phase', async () => {
    const ctx = makeCtx();
    const a = makeInterceptor('alpha', 10, recorder);
    const chain = new PipelineChain([a]);
    await chain.run(ctx, async () => 'ok');
    const attrs = (ctx.span.setAttribute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0],
    );
    expect(attrs).toContain('mcp.interceptor.alpha.before_ms');
    expect(attrs).toContain('mcp.upstream_ms');
  });

  it('PipelineReject carries httpStatus + code + publicMessage + metadata', () => {
    const r = new PipelineReject(429, 'rate_limited', 'too many', { retryAfter: 5 });
    expect(r.httpStatus).toBe(429);
    expect(r.code).toBe('rate_limited');
    expect(r.publicMessage).toBe('too many');
    expect(r.metadata).toEqual({ retryAfter: 5 });
    expect(r.message).toBe('too many');
    expect(r.name).toBe('PipelineReject');
    expect(r).toBeInstanceOf(Error);
  });
});
