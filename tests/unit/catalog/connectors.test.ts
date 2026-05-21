import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConnectorRegistry } from '../../../src/catalog/connectors.js';

describe('ConnectorRegistry', () => {
  const registry = new ConnectorRegistry();

  beforeAll(() => {
    registry.loadBuiltin();
  });

  it('loads at least 30 connectors via loadBuiltin()', () => {
    expect(registry.size).toBeGreaterThanOrEqual(30);
    expect(registry.list().length).toBe(registry.size);
  });

  it('get("github") returns a template', () => {
    const tpl = registry.get('github');
    expect(tpl).toBeDefined();
    expect(tpl?.id).toBe('github');
    expect(tpl?.category).toBe('developer-tools');
    expect(tpl?.transport.kind).toBe('stdio');
  });

  it('filter({category:"databases"}) returns at least 3', () => {
    const dbs = registry.filter({ category: 'databases' });
    expect(dbs.length).toBeGreaterThanOrEqual(3);
    for (const c of dbs) expect(c.category).toBe('databases');
  });

  it('filter({supports:"tools"}) returns at least 20', () => {
    const withTools = registry.filter({ supports: 'tools' });
    expect(withTools.length).toBeGreaterThanOrEqual(20);
    for (const c of withTools) expect(c.supports.tools).toBe(true);
  });

  it('list() is sorted by id', () => {
    const ids = registry.list().map((t) => t.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it('every loaded entry has a valid stdio or streamable-http transport', () => {
    for (const t of registry.list()) {
      if (t.transport.kind === 'stdio') {
        expect(typeof t.transport.command).toBe('string');
        expect(Array.isArray(t.transport.args)).toBe(true);
      } else {
        expect(typeof t.transport.urlTemplate).toBe('string');
      }
    }
  });

  it('skips malformed entries and keeps valid ones (logs warning, does not throw)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-catalog-'));
    const path = join(dir, 'connectors.json');
    writeFileSync(
      path,
      JSON.stringify({
        version: '1',
        connectors: [
          {
            id: 'good',
            displayName: 'Good',
            category: 'local',
            docsUrl: 'https://example.com',
            templateVersion: '1.0.0',
            transport: { kind: 'stdio', command: 'echo', args: ['hi'] },
            requiredEnv: [],
            supports: {
              tools: true,
              resources: false,
              prompts: false,
              sampling: false,
              roots: false,
            },
          },
          { id: 'broken-no-displayName' },
          {
            id: 'bad-category',
            displayName: 'Bad Category',
            category: 'not-a-real-category',
            docsUrl: 'https://example.com',
            templateVersion: '1.0.0',
            transport: { kind: 'stdio', command: 'x', args: [] },
            requiredEnv: [],
            supports: {
              tools: true,
              resources: false,
              prompts: false,
              sampling: false,
              roots: false,
            },
          },
        ],
      }),
      'utf8',
    );

    const r = new ConnectorRegistry();
    expect(() => r.loadFromFile(path)).not.toThrow();
    expect(r.size).toBe(1);
    expect(r.get('good')?.displayName).toBe('Good');
    expect(r.get('broken-no-displayName')).toBeUndefined();
    expect(r.get('bad-category')).toBeUndefined();
  });

  it('loadFromFile on missing path logs and leaves registry unchanged', () => {
    const r = new ConnectorRegistry();
    expect(() => r.loadFromFile('/tmp/definitely-does-not-exist.json')).not.toThrow();
    expect(r.size).toBe(0);
  });
});
