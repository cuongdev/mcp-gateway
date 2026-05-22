// Integration: /api/circuits admin routes (P6).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { InMemoryStateMachine, DEFAULT_CIRCUIT_CONFIG } from '../../../src/health/state-machine.js';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import { createCircuitsRoutes } from '../../../src/routes/admin/circuits.routes.js';

async function setup() {
  const storage = await makeStorage();
  const stateMachine = new InMemoryStateMachine({
    ...DEFAULT_CIRCUIT_CONFIG,
    warmupCalls: 0,
    consecutiveErrorsToTrip: 2,
  });
  const app = new Hono();
  app.route('/api/circuits', createCircuitsRoutes({ stateMachine, storage }));
  return { storage, stateMachine, app };
}

describe('GET /api/circuits', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('returns empty list on a fresh state machine', async () => {
    const r = await env.app.request('/api/circuits');
    expect(r.status).toBe(200);
    const body = await r.json() as { circuits: unknown[] };
    expect(body.circuits).toEqual([]);
  });

  it('lists known circuits after recordCall touches the state machine', async () => {
    env.stateMachine.getState('srv-a'); // auto-tracks
    const r = await env.app.request('/api/circuits');
    const body = await r.json() as { circuits: Array<{ serverName: string; state: string }> };
    expect(body.circuits.length).toBe(1);
    expect(body.circuits[0].serverName).toBe('srv-a');
    expect(body.circuits[0].state).toBe('healthy');
  });
});

describe('GET /api/circuits/:server', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('auto-creates the circuit if absent and includes rolling history', async () => {
    const r = await env.app.request('/api/circuits/new-server');
    expect(r.status).toBe(200);
    const body = await r.json() as { circuit: { serverName: string; state: string; rolling: unknown[] } };
    expect(body.circuit.serverName).toBe('new-server');
    expect(body.circuit.state).toBe('healthy');
    expect(Array.isArray(body.circuit.rolling)).toBe(true);
  });
});

describe('POST /api/circuits/:server/trip', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('trips and reports the new state', async () => {
    const r = await env.app.request('/api/circuits/srv/trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'test trip' }),
    });
    expect(r.status).toBe(200);
    expect(env.stateMachine.getState('srv').state).toBe('circuit_open');
  });

  it('accepts empty body and uses default reason', async () => {
    const r = await env.app.request('/api/circuits/srv2/trip', { method: 'POST' });
    expect(r.status).toBe(200);
    expect(env.stateMachine.getState('srv2').state).toBe('circuit_open');
  });
});

describe('POST /api/circuits/:server/close', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('closes an open circuit', async () => {
    env.stateMachine.trip('srv', 'pre-test');
    const r = await env.app.request('/api/circuits/srv/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'recovered' }),
    });
    expect(r.status).toBe(200);
    expect(env.stateMachine.getState('srv').state).toBe('healthy');
  });
});

describe('POST /api/circuits/:server/reset', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('returns healthy after reset', async () => {
    env.stateMachine.trip('srv', 'pre-test');
    const r = await env.app.request('/api/circuits/srv/reset', { method: 'POST' });
    expect(r.status).toBe(200);
    expect(env.stateMachine.getState('srv').state).toBe('healthy');
  });
});

describe('PATCH /api/circuits/:server/config', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('updates partial config and persists in-memory', async () => {
    const r = await env.app.request('/api/circuits/srv/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorRateThreshold: 0.9, windowSize: 50 }),
    });
    expect(r.status).toBe(200);
    const h = env.stateMachine.getState('srv');
    expect(h.config.errorRateThreshold).toBe(0.9);
    expect(h.config.windowSize).toBe(50);
  });

  it('400s on invalid body', async () => {
    const r = await env.app.request('/api/circuits/srv/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorRateThreshold: 5 }), // > 1 → invalid
    });
    expect(r.status).toBe(400);
  });
});

describe('GET/PATCH /api/circuits/config/defaults', () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { env = await setup(); });
  afterEach(async () => { await env.storage.close(); });

  it('returns current defaults', async () => {
    const r = await env.app.request('/api/circuits/config/defaults');
    expect(r.status).toBe(200);
    const body = await r.json() as { defaults: { errorRateThreshold: number } };
    expect(body.defaults.errorRateThreshold).toBeTypeOf('number');
  });

  it('updates defaults and reflects them in next GET', async () => {
    const patch = await env.app.request('/api/circuits/config/defaults', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cooldownMs: 99_999 }),
    });
    expect(patch.status).toBe(200);
    const r = await env.app.request('/api/circuits/config/defaults');
    const body = await r.json() as { defaults: { cooldownMs: number } };
    expect(body.defaults.cooldownMs).toBe(99_999);
  });
});
