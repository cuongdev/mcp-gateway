import { describe, it, expect, vi } from 'vitest';
import {
  InMemoryStateMachine,
  DEFAULT_CIRCUIT_CONFIG,
  type CallRecord,
  type TransitionEvent,
} from '../../../src/health/state-machine.js';

function ok(latencyMs = 5): CallRecord {
  return { ts: Date.now(), success: true, latencyMs };
}
function err(code = 'upstream_error', latencyMs = 5): CallRecord {
  return { ts: Date.now(), success: false, errorCode: code, latencyMs };
}

function makeSM(overrides: Partial<typeof DEFAULT_CIRCUIT_CONFIG> = {}) {
  return new InMemoryStateMachine({ ...DEFAULT_CIRCUIT_CONFIG, ...overrides });
}

describe('InMemoryStateMachine', () => {
  it('starts a server as healthy on first observation', () => {
    const sm = makeSM();
    const h = sm.getState('srv-a');
    expect(h.state).toBe('healthy');
    expect(h.rolling).toEqual([]);
    expect(h.consecutiveErrors).toBe(0);
    expect(h.totalCallsSinceRegister).toBe(0);
  });

  it('warmup window suppresses transitions', () => {
    const sm = makeSM({ warmupCalls: 5, consecutiveErrorsToTrip: 2 });
    for (let i = 0; i < 5; i++) sm.recordCall('s', err());
    // would otherwise trip — but warmup blocks it
    expect(sm.getState('s').state).toBe('healthy');
  });

  it('healthy -> degraded when rolling error rate breaches threshold past warmup', () => {
    const sm = makeSM({
      warmupCalls: 0,
      windowSize: 10,
      errorRateThreshold: 0.5,
      consecutiveErrorsToTrip: 999,
    });
    for (let i = 0; i < 5; i++) sm.recordCall('s', ok());
    for (let i = 0; i < 5; i++) sm.recordCall('s', err());
    expect(sm.getState('s').state).toBe('degraded');
  });

  it('healthy -> circuit_open on consecutive errors', () => {
    const sm = makeSM({
      warmupCalls: 0,
      consecutiveErrorsToTrip: 3,
      errorRateThreshold: 0.99,
    });
    sm.recordCall('s', err());
    sm.recordCall('s', err());
    expect(sm.getState('s').state).not.toBe('circuit_open');
    sm.recordCall('s', err());
    const h = sm.getState('s');
    expect(h.state).toBe('circuit_open');
    expect(h.openedAt).toBeTypeOf('number');
  });

  it('circuit_open -> half_open after cooldown elapses (lazy)', async () => {
    const sm = makeSM({
      warmupCalls: 0,
      consecutiveErrorsToTrip: 1,
      cooldownMs: 10,
    });
    sm.recordCall('s', err());
    expect(sm.getState('s').state).toBe('circuit_open');
    await new Promise((r) => setTimeout(r, 15));
    expect(sm.getState('s').state).toBe('half_open');
  });

  it('half_open -> healthy on success probe', async () => {
    const sm = makeSM({
      warmupCalls: 0,
      consecutiveErrorsToTrip: 1,
      cooldownMs: 5,
    });
    sm.recordCall('s', err());
    await new Promise((r) => setTimeout(r, 10));
    expect(sm.getState('s').state).toBe('half_open');
    sm.recordCall('s', ok());
    const h = sm.getState('s');
    expect(h.state).toBe('healthy');
    expect(h.reopenCount).toBe(0);
  });

  it('half_open -> circuit_open on failure with reopenCount++', async () => {
    const sm = makeSM({
      warmupCalls: 0,
      consecutiveErrorsToTrip: 1,
      cooldownMs: 5,
      quarantineAfterReopens: 99,
    });
    sm.recordCall('s', err());
    await new Promise((r) => setTimeout(r, 10));
    sm.recordCall('s', err()); // half_open fails
    const h = sm.getState('s');
    expect(h.state).toBe('circuit_open');
    expect(h.reopenCount).toBe(1);
  });

  it('auto-quarantine after quarantineAfterReopens flap cycles', async () => {
    const sm = makeSM({
      warmupCalls: 0,
      consecutiveErrorsToTrip: 1,
      cooldownMs: 5,
      quarantineAfterReopens: 2,
    });
    // initial trip
    sm.recordCall('s', err());
    // flap #1: cooldown -> half_open -> fail -> circuit_open (reopenCount=1)
    await new Promise((r) => setTimeout(r, 10));
    sm.recordCall('s', err());
    expect(sm.getState('s').reopenCount).toBe(1);
    // flap #2: cooldown -> half_open -> fail -> quarantined (reopenCount=2)
    await new Promise((r) => setTimeout(r, 10));
    sm.recordCall('s', err());
    expect(sm.getState('s').state).toBe('quarantined');
  });

  it('quarantined is sticky: further recordCall does not change state', () => {
    const sm = makeSM();
    sm.trip('s', 'force');
    // force quarantine via manual transitions by abusing recordCall — use a fresh harness
    const sm2 = makeSM({
      warmupCalls: 0,
      consecutiveErrorsToTrip: 1,
      cooldownMs: 1,
      quarantineAfterReopens: 1,
    });
    sm2.recordCall('s', err());
    return new Promise<void>((resolve) => setTimeout(() => {
      sm2.recordCall('s', err()); // -> quarantined
      expect(sm2.getState('s').state).toBe('quarantined');
      sm2.recordCall('s', ok());
      sm2.recordCall('s', ok());
      expect(sm2.getState('s').state).toBe('quarantined');
      resolve();
    }, 5));
  });

  it('degraded -> healthy when rate drops well below threshold', () => {
    const sm = makeSM({
      warmupCalls: 0,
      windowSize: 10,
      errorRateThreshold: 0.5,
      consecutiveErrorsToTrip: 999,
    });
    for (let i = 0; i < 5; i++) sm.recordCall('s', err());
    for (let i = 0; i < 5; i++) sm.recordCall('s', ok());
    expect(sm.getState('s').state).toBe('degraded');
    // push more successes — rolling window fills with ok, rate falls below threshold*0.5
    for (let i = 0; i < 10; i++) sm.recordCall('s', ok());
    expect(sm.getState('s').state).toBe('healthy');
  });

  it('manual trip transitions to circuit_open', () => {
    const sm = makeSM();
    sm.trip('s', 'admin trip');
    const h = sm.getState('s');
    expect(h.state).toBe('circuit_open');
    expect(h.lastTransitionReason).toBe('admin trip');
  });

  it('manual close transitions to healthy and clears counters', () => {
    const sm = makeSM();
    sm.trip('s', 'fail');
    sm.close('s', 'admin close');
    const h = sm.getState('s');
    expect(h.state).toBe('healthy');
    expect(h.consecutiveErrors).toBe(0);
  });

  it('reset wipes rolling window and counters', () => {
    const sm = makeSM({ warmupCalls: 0, consecutiveErrorsToTrip: 999 });
    sm.recordCall('s', err());
    sm.recordCall('s', err());
    sm.reset('s');
    const h = sm.getState('s');
    expect(h.state).toBe('healthy');
    expect(h.rolling.length).toBe(0);
    expect(h.consecutiveErrors).toBe(0);
    expect(h.totalCallsSinceRegister).toBe(0);
  });

  it('setEnabled(false) transitions to manual_disabled and (true) restores healthy', () => {
    const sm = makeSM();
    sm.setEnabled('s', false, 'admin');
    expect(sm.getState('s').state).toBe('manual_disabled');
    sm.setEnabled('s', true, 'admin');
    expect(sm.getState('s').state).toBe('healthy');
  });

  it('manual_disabled blocks state transitions via recordCall', () => {
    const sm = makeSM({ warmupCalls: 0, consecutiveErrorsToTrip: 1 });
    sm.setEnabled('s', false);
    sm.recordCall('s', err());
    sm.recordCall('s', err());
    expect(sm.getState('s').state).toBe('manual_disabled');
  });

  it('setConfig merges into the per-server config', () => {
    const sm = makeSM();
    sm.setConfig('s', { errorRateThreshold: 0.9, windowSize: 5 });
    const h = sm.getState('s');
    expect(h.config.errorRateThreshold).toBe(0.9);
    expect(h.config.windowSize).toBe(5);
    // unchanged keys retained
    expect(h.config.cooldownMs).toBe(DEFAULT_CIRCUIT_CONFIG.cooldownMs);
  });

  it('onTransition listener receives every transition event', () => {
    const sm = makeSM();
    const events: TransitionEvent[] = [];
    sm.onTransition((e) => events.push(e));
    sm.trip('s', 'r1');
    sm.close('s', 'r2');
    expect(events.length).toBe(2);
    expect(events[0]).toMatchObject({
      serverName: 's',
      from: 'healthy',
      to: 'circuit_open',
      reason: 'r1',
    });
    expect(events[1]).toMatchObject({
      from: 'circuit_open',
      to: 'healthy',
      reason: 'r2',
    });
  });

  it('onTransition returns an unsubscribe function', () => {
    const sm = makeSM();
    const fn = vi.fn();
    const off = sm.onTransition(fn);
    sm.trip('s', 'r');
    off();
    sm.close('s', 'r');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('listener errors do not break transition flow', () => {
    const sm = makeSM();
    sm.onTransition(() => {
      throw new Error('boom');
    });
    expect(() => sm.trip('s', 'r')).not.toThrow();
    expect(sm.getState('s').state).toBe('circuit_open');
  });

  it('rolling window is bounded by windowSize', () => {
    const sm = makeSM({
      warmupCalls: 0,
      windowSize: 3,
      consecutiveErrorsToTrip: 999,
      errorRateThreshold: 0.99,
    });
    for (let i = 0; i < 10; i++) sm.recordCall('s', ok());
    expect(sm.getState('s').rolling.length).toBe(3);
  });

  it('listAll returns every tracked server', () => {
    const sm = makeSM();
    sm.getState('a');
    sm.getState('b');
    const all = sm.listAll();
    expect(all.map((h) => h.serverName).sort()).toEqual(['a', 'b']);
  });
});
