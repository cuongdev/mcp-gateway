import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../../src/registry/tool.registry.js';
import { PromptRegistry } from '../../../src/registry/prompt.registry.js';
import { ResourceRegistry } from '../../../src/registry/resource.registry.js';
import { RootRegistry } from '../../../src/registry/root.registry.js';
import { CapabilityRegistry } from '../../../src/capability/registry.js';

describe('CapabilityRegistry', () => {
  let storage: SqliteAdapter;
  let registry: CapabilityRegistry;
  let toolReg: ToolRegistry;
  let promptReg: PromptRegistry;
  let resourceReg: ResourceRegistry;
  let rootReg: RootRegistry;

  beforeEach(async () => {
    storage = await makeStorage();
    toolReg = new ToolRegistry(storage);
    promptReg = new PromptRegistry(storage);
    resourceReg = new ResourceRegistry(storage);
    rootReg = new RootRegistry(storage);

    await storage.servers.upsert({ name: "s1", transportType: "streamable-http", transportConfig: { url: "http://x" } });
    await toolReg.registerServerTools('s1', [
      { name: 't1', description: 'tool 1', inputSchema: { type: 'object' } },
    ]);
    await promptReg.registerServerPrompts('s1', [
      { name: 'p1', description: 'prompt 1', argumentsSchema: { type: 'object' } },
    ]);
    await resourceReg.registerServerResources('s1', [
      { uri: 'file:///a' },
    ]);
    await rootReg.registerServerRoots('s1', [
      { uri: 'file:///workspace' },
    ]);

    registry = new CapabilityRegistry(toolReg, promptReg, resourceReg, rootReg);
  });

  afterEach(async () => { await storage.close(); });

  it('list() returns union of all kinds', () => {
    const caps = registry.list();
    const kinds = caps.map((c) => c.kind).sort();
    expect(kinds).toEqual(['prompt', 'resource', 'root', 'tool']);
  });

  it('list({kind:"tool"}) filters', () => {
    const caps = registry.list({ kind: 'tool' });
    expect(caps).toHaveLength(1);
    expect(caps[0].kind).toBe('tool');
  });

  it('list({serverName}) filters', async () => {
    await storage.servers.upsert({ name: "s1", transportType: "streamable-http", transportConfig: { url: "http://x" } });
    await storage.servers.upsert({ name: "s2", transportType: "streamable-http", transportConfig: { url: "http://y" } });
    await toolReg.registerServerTools("s2", [
      { name: 'x', description: 'd', inputSchema: {} },
    ]);
    const s1 = registry.list({ serverName: 's1' });
    const s2 = registry.list({ serverName: 's2' });
    expect(s1.length).toBeGreaterThan(0);
    expect(s2).toHaveLength(1);
    expect(s2[0].serverName).toBe('s2');
  });

  it('get() by kind', () => {
    const tool = registry.get('s1__t1', 'tool');
    expect(tool?.kind).toBe('tool');
    const prompt = registry.get('s1__p1', 'prompt');
    expect(prompt?.kind).toBe('prompt');
  });

  it('get() returns undefined for missing canonical', () => {
    expect(registry.get('nope', 'tool')).toBeUndefined();
  });

  it('enabledOnly filter respects per-kind enabled flag', async () => {
    const caps = registry.list({ kind: 'resource' });
    expect(caps[0].enabled).toBe(true);
    await resourceReg.setEnabled(caps[0].canonicalName, false);
    const enabled = registry.list({ kind: 'resource', enabledOnly: true });
    expect(enabled).toHaveLength(0);
  });

  it('accessors return underlying registries', () => {
    expect(registry.tools()).toBe(toolReg);
    expect(registry.prompts()).toBe(promptReg);
    expect(registry.resources()).toBe(resourceReg);
    expect(registry.roots()).toBe(rootReg);
  });
});
