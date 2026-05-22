import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../../src/storage/sqlite.adapter.js';

describe('RedactionFindingRepo', () => {
  let storage: SqliteAdapter;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(async () => { await storage.close(); });

  it('recordMany + list', async () => {
    await storage.redactionFindings.recordMany([
      { id: 'f1', ruleId: 'r1', requestId: 'req1', scope: 'request', mode: 'redact', matchCount: 2,
        serverName: 'srv1', capabilityName: 'srv1__tool', capabilityKind: 'tool' },
      { id: 'f2', ruleId: 'r1', requestId: 'req2', scope: 'response', mode: 'block', matchCount: 1,
        serverName: 'srv2' },
    ]);
    const all = await storage.redactionFindings.list();
    expect(all.length).toBe(2);
  });

  it('list applies filters: ruleId, server, scope, mode, since', async () => {
    const t0 = Date.now() - 60_000;
    const t1 = Date.now();
    await storage.redactionFindings.recordMany([
      { id: 'f1', ruleId: 'r1', requestId: 'q', scope: 'request',  mode: 'redact', matchCount: 1, serverName: 'a', occurredAt: t0 },
      { id: 'f2', ruleId: 'r2', requestId: 'q', scope: 'response', mode: 'block',  matchCount: 1, serverName: 'a', occurredAt: t1 },
      { id: 'f3', ruleId: 'r2', requestId: 'q', scope: 'request',  mode: 'warn',   matchCount: 1, serverName: 'b', occurredAt: t1 },
    ]);
    expect((await storage.redactionFindings.list({ ruleId: 'r2' })).length).toBe(2);
    expect((await storage.redactionFindings.list({ serverName: 'a' })).length).toBe(2);
    expect((await storage.redactionFindings.list({ scope: 'response' })).length).toBe(1);
    expect((await storage.redactionFindings.list({ mode: 'warn' })).length).toBe(1);
    expect((await storage.redactionFindings.list({ since: t1 })).length).toBe(2);
  });

  it('statsByRule + statsByServer aggregates', async () => {
    const now = Date.now();
    await storage.redactionFindings.recordMany([
      { id: 'a', ruleId: 'r1', requestId: 'q', scope: 'request', mode: 'redact', matchCount: 3, serverName: 's1', occurredAt: now },
      { id: 'b', ruleId: 'r1', requestId: 'q', scope: 'request', mode: 'redact', matchCount: 2, serverName: 's2', occurredAt: now },
      { id: 'c', ruleId: 'r2', requestId: 'q', scope: 'request', mode: 'block',  matchCount: 1, serverName: 's1', occurredAt: now },
    ]);
    const byRule = await storage.redactionFindings.statsByRule(now - 1000);
    expect(byRule.find((x) => x.ruleId === 'r1')?.count).toBe(5);
    expect(byRule.find((x) => x.ruleId === 'r2')?.count).toBe(1);
    const byServer = await storage.redactionFindings.statsByServer(now - 1000);
    expect(byServer.find((x) => x.serverName === 's1')?.count).toBe(4);
    expect(byServer.find((x) => x.serverName === 's2')?.count).toBe(2);
  });

  it('purgeOlderThan deletes old rows', async () => {
    const old = Date.now() - 86_400_000;
    const fresh = Date.now();
    await storage.redactionFindings.recordMany([
      { id: 'old', ruleId: 'r', requestId: 'q', scope: 'request', mode: 'redact', matchCount: 1, occurredAt: old },
      { id: 'new', ruleId: 'r', requestId: 'q', scope: 'request', mode: 'redact', matchCount: 1, occurredAt: fresh },
    ]);
    const cutoff = Date.now() - 3600_000;
    const removed = await storage.redactionFindings.purgeOlderThan(cutoff);
    expect(removed).toBe(1);
    const all = await storage.redactionFindings.list();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe('new');
  });
});
