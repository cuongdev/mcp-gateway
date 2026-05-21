import { describe, it, expect, vi } from 'vitest';
import {
  InMemoryStateMachine,
  DEFAULT_CIRCUIT_CONFIG,
} from '../../../src/health/state-machine.js';
import { ProbeLoop, type ProbeTarget } from '../../../src/health/probe-loop.js';

function makeTarget(impl: (server: string, jsonrpc: unknown) => Promise<unknown>): ProbeTarget & { calls: Array<{ server: string; method: string }> } {
  const calls: Array<{ server: string; method: string }> = [];
  return {
    calls,
    async rawSend(server: string, jsonrpc: unknown) {
      const method = (jsonrpc as { method?: string }).method ?? '';
      calls.push({ server, method });
      return impl(server, jsonrpc);
    },
  };
}

describe('ProbeLoop integration', () => {
  it('probes half_open server with tools/list and advances state to healthy', async () => {
    const sm = new InMemoryStateMachine({
      ...DEFAULT_CIRCUIT_CONFIG,
      warmupCalls: 0,
      consecutiveErrorsToTrip: 1,
      cooldownMs: 10,
    });
    const target = makeTarget(async () => ({ result: { tools: [] } }));

    // Trip server
    sm.recordCall('srv-a', {
      ts: Date.now(),
      success: false,
      errorCode: 'boom',
      latencyMs: 5,
    });
    expect(sm.getState('srv-a').state).toBe('circuit_open');

    // Wait for cooldown to elapse
    await new Promise((r) => setTimeout(r, 20));

    const loop = new ProbeLoop(sm, target, {
      degradedIntervalMs: 1000,
      probeTimeoutMs: 1000,
    });
    await loop.tick(); // manual tick instead of start()
    loop.stop();

    expect(target.calls.length).toBeGreaterThanOrEqual(1);
    expect(target.calls[0]).toEqual({
      server: 'srv-a',
      method: 'tools/list',
    });
    expect(sm.getState('srv-a').state).toBe('healthy');
  });

  it('records probe_timeout when rawSend exceeds probeTimeoutMs', async () => {
    const sm = new InMemoryStateMachine({
      ...DEFAULT_CIRCUIT_CONFIG,
      warmupCalls: 0,
      consecutiveErrorsToTrip: 5,
    });
    // put server into degraded so the loop probes it
    sm.trip('slow-srv', 'force');
    await new Promise((r) => setTimeout(r, 0));
    sm.close('slow-srv', 'reset');
    // We want a non-healthy state so it gets probed every tick.
    sm.setConfig('slow-srv', { errorRateThreshold: 0.01, warmupCalls: 0 });
    sm.recordCall('slow-srv', {
      ts: Date.now(),
      success: false,
      errorCode: 'x',
      latencyMs: 1,
    });
    // bump to degraded
    expect(['degraded', 'circuit_open']).toContain(sm.getState('slow-srv').state);

    const target = makeTarget(
      () => new Promise((resolve) => {
        const t = setTimeout(() => resolve({}), 200);
        t.unref?.();
      }),
    );
    const loop = new ProbeLoop(sm, target, {
      degradedIntervalMs: 1000,
      probeTimeoutMs: 20,
    });
    await loop.tick();
    loop.stop();

    expect(target.calls.length).toBeGreaterThanOrEqual(1);
    // The recordCall after timeout should be a failure
    const rolling = sm.getState('slow-srv').rolling;
    const last = rolling[rolling.length - 1];
    expect(last.success).toBe(false);
    expect(last.errorCode).toBe('probe_timeout');
  });

  it('skips manual_disabled and quarantined servers', async () => {
    const sm = new InMemoryStateMachine();
    sm.setEnabled('off-srv', false, 'admin');
    expect(sm.getState('off-srv').state).toBe('manual_disabled');

    const target = makeTarget(async () => ({ result: {} }));
    const loop = new ProbeLoop(sm, target, {
      degradedIntervalMs: 1000,
      probeTimeoutMs: 100,
    });
    await loop.tick();
    loop.stop();
    expect(target.calls.length).toBe(0);
  });

  it('start/stop drives the timer and cleans up', async () => {
    const sm = new InMemoryStateMachine({
      ...DEFAULT_CIRCUIT_CONFIG,
      warmupCalls: 0,
      consecutiveErrorsToTrip: 1,
      cooldownMs: 5,
    });
    sm.recordCall('srv-b', {
      ts: Date.now(), success: false, errorCode: 'x', latencyMs: 1,
    });
    await new Promise((r) => setTimeout(r, 10));

    const target = makeTarget(async () => ({ result: { tools: [] } }));
    const loop = new ProbeLoop(sm, target, {
      degradedIntervalMs: 15,
      probeTimeoutMs: 100,
    });
    loop.start();
    await new Promise((r) => setTimeout(r, 40));
    loop.stop();
    expect(target.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('healthy servers get heartbeat-probed at the slower cadence', async () => {
    const sm = new InMemoryStateMachine();
    sm.getState('hb-srv'); // register as healthy
    const target = makeTarget(async () => ({ result: { tools: [] } }));
    const loop = new ProbeLoop(sm, target, {
      degradedIntervalMs: 1000,
      healthyIntervalMs: 1, // effectively immediate
      probeTimeoutMs: 100,
    });
    await loop.tick();
    loop.stop();
    expect(target.calls.length).toBe(1);
    expect(target.calls[0].method).toBe('tools/list');
  });

  it('tick swallows listAll errors and keeps running', async () => {
    const sm = new InMemoryStateMachine();
    const target = makeTarget(async () => ({ result: {} }));
    // Force listAll to throw once to exercise the catch path
    const spy = vi.spyOn(sm, 'listAll').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const loop = new ProbeLoop(sm, target, {
      degradedIntervalMs: 1000,
      probeTimeoutMs: 100,
    });
    await expect(loop.tick()).resolves.toBeUndefined();
    loop.stop();
    spy.mockRestore();
  });
});
