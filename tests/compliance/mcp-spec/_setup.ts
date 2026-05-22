import { Hono } from 'hono';
import { makeStorage } from '../../fixtures/helpers/make-storage.js';
import type { SqliteAdapter } from '../../../src/storage/sqlite.adapter.js';
import { ToolRegistry } from '../../../src/registry/tool.registry.js';
import { PromptRegistry } from '../../../src/registry/prompt.registry.js';
import { ResourceRegistry } from '../../../src/registry/resource.registry.js';
import { ToolGroupManager } from '../../../src/registry/tool.groups.js';
import { SessionManager } from '../../../src/session/session.manager.js';
import { createMCPRoutes } from '../../../src/routes/mcp.routes.js';

export interface ComplianceEnv {
  storage: SqliteAdapter;
  app: Hono;
  close(): Promise<void>;
}

/** Build a minimal gateway with seeded capabilities for compliance tests. */
export async function setupComplianceEnv(): Promise<ComplianceEnv> {
  const storage = await makeStorage();
  await storage.servers.upsert({
    name: 'srv1',
    transportType: 'streamable-http',
    transportConfig: { url: 'http://localhost:0' },
  });
  const tools = new ToolRegistry(storage);
  await tools.registerServerTools('srv1', [
    {
      name: 'add',
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    },
  ]);
  const prompts = new PromptRegistry(storage);
  await prompts.registerServerPrompts('srv1', [
    {
      name: 'greet',
      description: 'Greet a user',
      argumentsSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Who to greet' } },
        required: ['name'],
      },
    },
  ]);
  const resources = new ResourceRegistry(storage);
  await resources.registerServerResources('srv1', [
    { uri: 'mem://hello.txt', name: 'hello', description: 'sample', mimeType: 'text/plain' },
  ]);

  const groups = new ToolGroupManager(storage, tools);
  await groups.load();
  const sessionManager = new SessionManager();

  const app = new Hono();
  app.route('/mcp', createMCPRoutes({
    toolRegistry: tools,
    toolGroups: groups,
    sessionManager,
    promptRegistry: prompts,
    resourceRegistry: resources,
  }));

  return {
    storage,
    app,
    async close() { await storage.close(); },
  };
}

/** Send a JSON-RPC request to the gateway and return the parsed response. */
export async function rpc(app: Hono, method: string, params?: unknown, id: string | number = 1) {
  const r = await app.request('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return r.json() as Promise<{ jsonrpc: '2.0'; id: string | number; result?: unknown; error?: { code: number; message: string } }>;
}
