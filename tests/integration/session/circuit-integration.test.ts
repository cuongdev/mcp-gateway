// Integration: StateMachine wired into SessionManager.send() (P6).

import { describe, it, expect } from 'vitest';
import { SessionManager } from '../../../src/session/session.manager.js';
import {
  InMemoryStateMachine,
  DEFAULT_CIRCUIT_CONFIG,
} from '../../../src/health/state-machine.js';
import { UpstreamCircuitOpenError } from '../../../src/types/errors.js';

/**
 * Internal helper — patches SessionManager.dispatch via a class extension
 * so we don't need a real upstream. The state machine + send() guard +
 * recordCall path are still exercised exactly as in production.
 */
class FakeSessionManager extends SessionManager {
  public failNext = 0;
  public callCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected dispatchOverride: (server: string, request: any) => Promise<any> = async () => {
    this.callCount++;
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('boom');
    }
    return { jsonrpc: '2.0', id: 1, result: {} };
  };

  // Override the private dispatch by monkey-patching at construction time.
  // SessionManager.send is the public entrypoint; we replace dispatch
  // (a private method, but accessible via prototype access through `any`).
  constructor() {
    super();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).dispatch = this.dispatchOverride;
  }
}

describe('SessionManager + StateMachine integration', () => {
  it('records each call and trips circuit after consecutive failures', async () => {
    const sm = new InMemoryStateMachine({
      ...DEFAULT_CIRCUIT_CONFIG,
      warmupCalls: 0,
      consecutiveErrorsToTrip: 5,
      cooldownMs: 5_000,
    });
    const mgr = new FakeSessionManager();
    mgr.setStateMachine(sm);
    mgr.failNext = 5;

    // Drive 5 failing calls — circuit should trip after the 5th.
    for (let i = 0; i < 5; i++) {
      await expect(
        mgr.send('srv', { jsonrpc: '2.0', id: i + 1, method: 'tools/list' }),
      ).rejects.toThrow();
    }

    expect(sm.getState('srv').state).toBe('circuit_open');
    expect(mgr.callCount).toBe(5);

    // 6th call must be rejected by the circuit BEFORE dispatch is invoked.
    await expect(
      mgr.send('srv', { jsonrpc: '2.0', id: 99, method: 'tools/list' }),
    ).rejects.toBeInstanceOf(UpstreamCircuitOpenError);
    expect(mgr.callCount).toBe(5); // dispatch was not called

    await mgr.shutdown();
  });

  it('successful calls do not record as failures and circuit stays healthy', async () => {
    const sm = new InMemoryStateMachine({
      ...DEFAULT_CIRCUIT_CONFIG,
      warmupCalls: 0,
      consecutiveErrorsToTrip: 5,
    });
    const mgr = new FakeSessionManager();
    mgr.setStateMachine(sm);

    for (let i = 0; i < 10; i++) {
      const r = await mgr.send('srv', { jsonrpc: '2.0', id: i + 1, method: 'tools/list' });
      expect(r).toMatchObject({ jsonrpc: '2.0' });
    }
    expect(sm.getState('srv').state).toBe('healthy');

    await mgr.shutdown();
  });

  it('rawSend bypasses circuit guard and the state machine record', async () => {
    const sm = new InMemoryStateMachine({
      ...DEFAULT_CIRCUIT_CONFIG,
      warmupCalls: 0,
      consecutiveErrorsToTrip: 1,
    });
    const mgr = new FakeSessionManager();
    mgr.setStateMachine(sm);
    sm.trip('srv', 'forced for test');

    // send() must reject
    await expect(
      mgr.send('srv', { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    ).rejects.toBeInstanceOf(UpstreamCircuitOpenError);

    // rawSend() must NOT consult the circuit — dispatch is reached.
    const r = await mgr.rawSend('srv', { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(r).toMatchObject({ jsonrpc: '2.0' });
    expect(mgr.callCount).toBe(1);

    // rawSend MUST NOT have recorded a call (state stays circuit_open since
    // we tripped it; rawSend never advances rolling window on its own).
    expect(sm.getState('srv').state).toBe('circuit_open');

    await mgr.shutdown();
  });

  it('backwards compatible — when no state machine is set, send() behaves as before', async () => {
    const mgr = new FakeSessionManager();
    // no setStateMachine() call
    mgr.failNext = 3;
    for (let i = 0; i < 3; i++) {
      await expect(
        mgr.send('srv', { jsonrpc: '2.0', id: i, method: 'tools/list' }),
      ).rejects.toThrow();
    }
    // No state machine → no circuit_open behaviour.
    const r = await mgr.send('srv', { jsonrpc: '2.0', id: 100, method: 'tools/list' });
    expect(r).toMatchObject({ jsonrpc: '2.0' });
    expect(mgr.callCount).toBe(4);
    await mgr.shutdown();
  });
});
