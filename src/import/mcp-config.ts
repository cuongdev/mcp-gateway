// ============================================================
// MCP client-config importer
//
// Parses the server configs used by MCP clients (Claude Desktop, Cursor,
// VS Code, Antigravity, Windsurf, …) and maps each entry to a gateway
// transport. The shapes are nearly identical — a name→entry map under
// `mcpServers` (Claude/Cursor/Antigravity/Windsurf) or `servers` (VS Code) —
// so one tolerant parser covers them all.
//
// Pure + side-effect free so it is unit-testable; the admin route registers
// the result.
// ============================================================

export type ImportTransport =
  | { type: 'stdio'; command: string; args: string[]; env?: Record<string, string> }
  | { type: 'streamable-http' | 'sse'; url: string; headers?: Record<string, string> };

export interface ImportedServer {
  name: string;
  transport: ImportTransport;
  /** Per-server warnings (e.g. unresolved editor variables). */
  warnings: string[];
}

export interface ImportResult {
  /** Which top-level key the server map was found under, for display. */
  source: 'mcpServers' | 'servers' | 'root' | null;
  servers: ImportedServer[];
  /** Top-level warnings (entries skipped, parse issues). */
  warnings: string[];
}

/** Editor placeholders the gateway does NOT resolve (it only substitutes ${UPPER_SNAKE} env vars in config files, and not at all for API-registered servers). */
const EDITOR_VAR = /\$\{([^}]+)\}/g;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asStringRecord(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string') out[k] = val;
    else if (typeof val === 'number' || typeof val === 'boolean') out[k] = String(val);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Collect ${...} placeholders that the gateway won't resolve. */
function unresolvedVars(values: string[]): string[] {
  const found = new Set<string>();
  for (const s of values) {
    for (const m of s.matchAll(EDITOR_VAR)) {
      const name = m[1];
      // Gateway only substitutes ${UPPER_SNAKE} in config files; flag the rest.
      if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) found.add(m[0]);
    }
  }
  return [...found];
}

/** Locate the name→entry server map within a client config object. */
function findServerMap(root: Record<string, unknown>): { map: Record<string, unknown>; source: ImportResult['source'] } | null {
  if (isRecord(root.mcpServers)) return { map: root.mcpServers, source: 'mcpServers' };
  if (isRecord(root.servers)) return { map: root.servers, source: 'servers' };
  // VS Code settings.json nests under "mcp": { "servers": {...} }
  if (isRecord(root.mcp) && isRecord((root.mcp as Record<string, unknown>).servers)) {
    return { map: (root.mcp as Record<string, unknown>).servers as Record<string, unknown>, source: 'servers' };
  }
  // Bare map of name → entry (e.g. a snippet pasted without the wrapper).
  const looksLikeEntries = Object.values(root).some(
    (v) => isRecord(v) && ('command' in v || 'url' in v || 'serverUrl' in v || 'httpUrl' in v || 'endpoint' in v),
  );
  if (looksLikeEntries) return { map: root, source: 'root' };
  return null;
}

function mapEntry(name: string, entry: Record<string, unknown>): ImportedServer | { skipped: string } {
  const warnings: string[] = [];
  const command = typeof entry.command === 'string' ? entry.command : undefined;
  const url =
    (typeof entry.url === 'string' && entry.url) ||
    (typeof entry.serverUrl === 'string' && entry.serverUrl) ||
    (typeof entry.httpUrl === 'string' && entry.httpUrl) ||
    (typeof entry.endpoint === 'string' && entry.endpoint) ||
    undefined;

  if (command) {
    const args = asStringArray(entry.args);
    const env = asStringRecord(entry.env);
    const vars = unresolvedVars([command, ...args, ...Object.values(env ?? {})]);
    if (vars.length) {
      warnings.push(
        `Uses editor variable(s) ${vars.join(', ')} the gateway can't resolve — replace with an absolute path or a \${UPPER_SNAKE} env var.`,
      );
    }
    return { name, transport: { type: 'stdio', command, args, ...(env ? { env } : {}) }, warnings };
  }

  if (url) {
    const hint = typeof entry.type === 'string' ? entry.type.toLowerCase() : '';
    const type: 'sse' | 'streamable-http' =
      hint === 'sse' || (!hint && /\/sse(\b|\/|$)/.test(url)) ? 'sse' : 'streamable-http';
    const headers = asStringRecord(entry.headers);
    const vars = unresolvedVars([url, ...Object.values(headers ?? {})]);
    if (vars.length) {
      warnings.push(`Uses editor variable(s) ${vars.join(', ')} the gateway can't resolve.`);
    }
    return { name, transport: { type, url, ...(headers ? { headers } : {}) }, warnings };
  }

  return { skipped: `"${name}" has no "command" or "url"/"serverUrl" — skipped.` };
}

/**
 * Parse an MCP client config (object or JSON string) into gateway-ready
 * servers. Never throws on a well-formed object; returns warnings instead.
 */
export function parseMcpImport(input: unknown): ImportResult {
  let root: unknown = input;
  if (typeof input === 'string') {
    try {
      root = JSON.parse(input);
    } catch (err) {
      return { source: null, servers: [], warnings: [`Invalid JSON: ${(err as Error).message}`] };
    }
  }
  if (!isRecord(root)) {
    return { source: null, servers: [], warnings: ['Config must be a JSON object.'] };
  }

  const located = findServerMap(root);
  if (!located) {
    return { source: null, servers: [], warnings: ['No "mcpServers" or "servers" map found in the config.'] };
  }

  const servers: ImportedServer[] = [];
  const warnings: string[] = [];
  for (const [name, raw] of Object.entries(located.map)) {
    if (!isRecord(raw)) {
      warnings.push(`"${name}" is not an object — skipped.`);
      continue;
    }
    if (raw.disabled === true) {
      warnings.push(`"${name}" is disabled in the source config — skipped.`);
      continue;
    }
    const mapped = mapEntry(name, raw);
    if ('skipped' in mapped) warnings.push(mapped.skipped);
    else servers.push(mapped);
  }

  return { source: located.source, servers, warnings };
}
