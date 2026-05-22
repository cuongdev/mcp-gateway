// Integration: persisting state-machine transitions to server_state rows
// and restoring them on boot (P6).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import {
  InMemoryStateMachine,
  DEFAULT_CIRCUIT_CONFIG,
  type TransitionEvent,
} from '../../../src/health/state-machine.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';

describe('server_state persistence + restore round-trip', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('a manual trip writes a server_state row', async () => {
    const sm = new InMemoryStateMachine({
      ...DEFAULT_CIRCUIT_CONFIG,
      warmupCalls: 0,
    });
    // Wire a listener mirroring what Gateway does in start().
    sm.onTransition((event: TransitionEvent) => {
      void storage.serverStates.upsert({
        serverName: event.serverName,
        state: event.to,
        consecutiveErrors: sm.getState(event.serverName).consecutiveErrors,
        rollingWindow: sm.getState(event.serverName).rolling,
        openedAt: sm.getState(event.serverName).openedAt ?? null,
        lastTransitionReason: event.reason,
      });
    });

    sm.trip('srv-a', 'integration test');
    // Give the fire-and-forget listener a tick to flush.
    await new Promise((r) => setTimeout(r, 50));

    const row = await storage.serverStates.get('srv-a');
    expect(row).not.toBeNull();
    expect(row?.state).toBe('circuit_open');
    expect(row?.lastTransitionReason).toBe('integration test');
  });

  it('restore() rehydrates an in-memory entry from a persisted row WITHOUT firing transitions', async () => {
    // Pre-seed a persisted row representing a previously-tripped server.
    // openedAt is recent so the cooldown has NOT elapsed; otherwise
    // getState() lazy-promotes to half_open which is correct behaviour
    // but not what we want to assert in this restore test.
    const recentOpenedAt = Date.now();
    await storage.serverStates.upsert({
      serverName: 'srv-b',
      state: 'circuit_open',
      consecutiveErrors: 5,
      openedAt: recentOpenedAt,
      lastTransitionReason: 'pre-restart trip',
    });

    const transitions: TransitionEvent[] = [];
    const sm = new InMemoryStateMachine({
      ...DEFAULT_CIRCUIT_CONFIG,
      cooldownMs: 60_000, // long cooldown so lazy half-open is not triggered
    });
    const unsub = sm.onTransition((e) => transitions.push(e));

    const rows = await storage.serverStates.list();
    for (const r of rows) {
      sm.restore(r.serverName, {
        state: r.state,
        rolling: r.rollingWindow,
        consecutiveErrors: r.consecutiveErrors,
        openedAt: r.openedAt ?? undefined,
        lastTransitionReason: r.lastTransitionReason ?? undefined,
      });
    }

    expect(transitions.length).toBe(0); // restore must not fire listeners
    expect(sm.getState('srv-b').state).toBe('circuit_open');
    expect(sm.getState('srv-b').openedAt).toBe(recentOpenedAt);
    unsub();
  });
});
