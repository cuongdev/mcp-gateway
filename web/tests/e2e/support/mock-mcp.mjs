// Minimal mock MCP upstream for E2E tests. Listens on :8900 and serves three
// distinct tool sets under /fs, /db, /gh so the gateway can discover real
// servers/tools/prompts/resources without a live upstream.
//
// Started automatically by playwright.config.ts as a webServer entry.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_MCP_PORT ?? 8900);

const TOOLS = {
  '/fs': [
    { name: 'read_file', description: 'Read the contents of a file from disk.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'write_file', description: 'Write content to a file on disk.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
    { name: 'list_directory', description: 'List entries in a directory.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'search_files', description: 'Search files by glob pattern.', inputSchema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } },
  ],
  '/db': [
    { name: 'query_data', description: 'Run a read-only SQL query and return rows.', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
    { name: 'get_report', description: 'Fetch a named analytics report.', inputSchema: { type: 'object', properties: { report: { type: 'string' } }, required: ['report'] } },
    { name: 'list_tables', description: 'List all tables in the database.', inputSchema: { type: 'object', properties: {} } },
    { name: 'describe_table', description: 'Describe the schema of a table.', inputSchema: { type: 'object', properties: { table: { type: 'string' } }, required: ['table'] } },
  ],
  '/gh': [
    { name: 'create_pr', description: 'Open a pull request.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, branch: { type: 'string' } }, required: ['title'] } },
    { name: 'list_issues', description: 'List issues in a repository.', inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] } },
    { name: 'get_repo', description: 'Get repository metadata.', inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] } },
    { name: 'search_code', description: 'Search code across repositories.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  ],
};

createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let msg = {};
    try { msg = JSON.parse(body || '{}'); } catch { /* ignore */ }
    const pathKey = Object.keys(TOOLS).find((k) => req.url.startsWith(k)) ?? '/fs';
    const reply = (result) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'mock-' + pathKey.slice(1) });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
    };
    if (msg.method === 'initialize') {
      return reply({ protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'mock' + pathKey, version: '1.0.0' } });
    }
    if (msg.method === 'tools/list') return reply({ tools: TOOLS[pathKey] });
    if (msg.method === 'tools/call') return reply({ content: [{ type: 'text', text: 'ok' }] });
    if (!msg.id) { res.writeHead(202); return res.end(); }
    return reply({});
  });
}).listen(PORT, () => console.log(`mock MCP on :${PORT}`));
