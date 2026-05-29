// ============================================================
// Session Manager
// Manages persistent connections to upstream MCP servers.
//
// Follows MCPJungle's stateful session pattern:
//   - Streamable HTTP: connection reuse via fetch
//   - STDIO: persistent child processes with idle timeout
//   - SSE: persistent EventSource connections
//
// Abstracts transport differences so the proxy layer
// can call any server the same way.
// ============================================================

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import type { Dispatcher } from "undici";
import type { JsonRpcRequest, JsonRpcResponse } from "../types/mcp.js";
import {
  UpstreamConnectionError,
  UpstreamTimeoutError,
  UpstreamCircuitOpenError,
} from "../types/errors.js";
import type { StateMachine } from "../health/state-machine.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { DiscoveredPrompt } from "../storage/repositories/prompt.repo.js";
import type { OpenApiAdapter } from "../adapters/openapi/adapter.js";
import type { DiscoveredOpenApiTool } from "../adapters/openapi/operation-to-tool.js";
import type { ProxyRegistry } from "../proxy/registry.js";
import { resolveProxyName } from "../proxy/resolver.js";
import type { ReverseChannelMux } from "../pipeline/reverse-channel.js";
import { withSpan, currentTraceparent } from "../observability/spans.js";
import {
  upstreamLatency,
  proxyRequestsTotal,
  circuitRejectionsTotal,
} from "../middleware/monitoring/metrics.middleware.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "session-manager" });

/** Session idle timeout in ms (default 5 minutes) */
const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;

// ── Transport Configs ──────────────────────────────────

export interface HttpTransportConfig {
  type: "streamable-http" | "sse";
  url: string;
  /** Optional bearer token for upstream auth */
  bearerToken?: string;
  timeout?: number;
  /**
   * Upstream MCP session mode (Streamable HTTP only).
   *   "stateful"  — persist `Mcp-Session-Id` across requests (default)
   *   "stateless" — never read or send the upstream session header
   */
  session_mode?: "stateful" | "stateless";
  /** Extra HTTP headers forwarded to the upstream on every request */
  headers?: Record<string, string>;
}

export interface StdioTransportConfig {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Keep process alive between calls (stateful mode) */
  stateful?: boolean;
  /** Idle timeout before killing stateful process (ms) */
  idleTimeoutMs?: number;
}

export type TransportConfig = HttpTransportConfig | StdioTransportConfig;

// ── Session Types ──────────────────────────────────────

interface HttpSession {
  type: "http";
  config: HttpTransportConfig;
  /** MCP session ID for Streamable HTTP */
  mcpSessionId?: string;
  /** Timestamp of the last successful send (ms since epoch) */
  lastSeen?: number;
}

interface StdioSession {
  type: "stdio";
  config: StdioTransportConfig;
  process: ChildProcess | null;
  /** Pending JSON-RPC requests waiting for response */
  pending: Map<string | number, {
    resolve: (res: JsonRpcResponse) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>;
  /** Incoming data buffer */
  buffer: string;
  /** Idle timer for stateful mode */
  idleTimer: NodeJS.Timeout | null;
  initialized: boolean;
  /** Timestamp of the last successful send (ms since epoch) */
  lastSeen?: number;
}

type Session = HttpSession | StdioSession;

/** Shape of an upstream-initiated JSON-RPC REQUEST we'd forward via the mux. */
interface ReverseRequestShape {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Method names the reverse channel fans out to the originating client.
 *
 * `roots/list` is deliberately NOT here: in v1 the gateway answers
 * `roots/list` with its own admin-managed view (see
 * `handleUpstreamReverseRequest` and the `roots/list` handler in
 * mcp.routes), rather than fanning a single client's filesystem roots
 * back to an upstream. Keeping both behaviours consistent avoids the
 * gateway returning an admin view in one direction and a client view
 * in the other.
 */
const REVERSE_FORWARDABLE_METHODS = new Set<string>([
  'sampling/createMessage',
]);

/** Short SHA-256 hash (first 16 hex chars) — duplicated from mcp.routes for sampling-log hashes. */
function hashShort(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// ── Prompt helpers ────────────────────────────────────

/**
 * Convert MCP `arguments` array to a JSON-schema-ish object.
 * Arguments are an array of `{ name, description?, required? }`.
 */
function argsToJsonSchema(args: unknown): Record<string, unknown> {
  if (!Array.isArray(args)) return { type: "object", properties: {} };
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  for (const a of args as Array<{ name: string; description?: string; required?: boolean }>) {
    properties[a.name] = { type: "string", description: a.description };
    if (a.required) required.push(a.name);
  }
  return { type: "object", properties, required };
}

// ── Session Manager ────────────────────────────────────

export interface SessionManagerOptions {
  /** Seconds before an idle session is dropped (0 = disabled, default 600) */
  idleTimeoutSec?: number;
}

export class SessionManager {
  /** server-name → session */
  private sessions = new Map<string, Session>();

  /** canonical tool name → openapi adapter + operation meta */
  private openapiTools = new Map<
    string,
    { adapter: OpenApiAdapter; meta: DiscoveredOpenApiTool["meta"] }
  >();

  /** server-name → openapi marker (so send() can route correctly) */
  private openapiServers = new Set<string>();

  /** Periodic cleanup interval for idle sessions */
  private cleanupInterval?: ReturnType<typeof setInterval>;

  /** ProxyRegistry for outbound HTTP dispatcher routing (P5). */
  private proxyRegistry?: ProxyRegistry;

  /** Global default proxy name (used when neither server nor group set one). */
  private defaultProxyName: string | null = null;

  /**
   * Storage adapter for looking up the per-server `proxyName` field on each
   * outbound send. Optional — when not set, server-level proxy overrides
   * collapse to `null` and resolution falls back to group/default.
   */
  private storage?: StorageAdapter;

  /**
   * Optional state machine (P6 circuit breaker). When set, `send()` consults
   * it before dispatching and records the call result afterward. When unset,
   * `send()` behaves exactly as before (backwards compatible).
   *
   * `rawSend()` always bypasses the state machine — it is the path the
   * background probe loop uses.
   */
  private stateMachine?: StateMachine;

  /**
   * Optional reverse-channel mux (v0.9 P8). When set, STDIO upstream
   * stdout chunks that look like JSON-RPC REQUESTS (i.e. they carry a
   * `method` field rather than `result`/`error`) are forwarded through
   * the mux to the client identified by `_meta.session_id`.
   */
  private reverseChannel?: ReverseChannelMux;

  /**
   * Optional reverse-channel redactor (v0.10, gated by
   * `gateway.reverseChannelRedaction`). When set, BOTH legs of a reverse
   * call are scrubbed: the upstream's reverse request (`scope: 'request'`)
   * before it reaches the client, and the client's response
   * (`scope: 'response'`) before it reaches the upstream. Returns the
   * redacted value, or `blocked` when a block-mode rule matched (the call
   * is then refused with a JSON-RPC error). A thin function shape keeps
   * SessionManager decoupled from the redaction engine + findings store.
   */
  private reverseRedactor?: (
    value: unknown,
    scope: 'request' | 'response',
    meta: { method: string; serverName: string; requestId: string; clientSessionId: string },
  ) => Promise<{ value: unknown; blocked?: { ruleName: string } }>;

  /**
   * Optional sampling-log recorder (v0.9). When set, every successful
   * mux round-trip is recorded with `outcome: 'success'`. We accept a
   * thin function shape rather than the full repo so tests can stub it.
   */
  private samplingRecord?: (input: {
    requestId: string;
    upstreamServer: string;
    clientSessionId: string;
    method: string;
    requestPayloadHash: string;
    responsePayloadHash?: string | null;
    latencyMs?: number | null;
    outcome: 'success' | 'client_refused' | 'timeout' | 'error' | 'method_not_supported';
  }) => Promise<void>;

  constructor(opts: SessionManagerOptions = {}) {
    const timeoutMs = (opts.idleTimeoutSec ?? 600) * 1000;
    if (timeoutMs > 0) {
      this.cleanupInterval = setInterval(
        () => this.runCleanup(timeoutMs),
        Math.min(timeoutMs, 60_000),
      );
      this.cleanupInterval.unref?.();
    }
  }

  private runCleanup(timeoutMs: number): void {
    const cutoff = Date.now() - timeoutMs;
    for (const [name, session] of this.sessions) {
      if (session.lastSeen !== undefined && session.lastSeen < cutoff) {
        log.info({ server: name }, "Dropping idle session");
        if (session.type === "stdio") {
          this.killStdioSession(session);
        }
        this.sessions.delete(name);
      }
    }
  }

  /**
   * Wire the outbound proxy context. Called once by Gateway.start() after
   * the ProxyRegistry has loaded. Without this, outbound HTTP fetches use
   * Node's default (direct) dispatcher.
   */
  setProxyContext(
    registry: ProxyRegistry,
    defaultProxyName: string | null,
  ): void {
    this.proxyRegistry = registry;
    this.defaultProxyName = defaultProxyName;
  }

  /**
   * Attach a storage adapter so HTTP outbound calls can look up the
   * per-server `proxyName` override. Optional — when omitted, server-level
   * proxy overrides are ignored.
   */
  setStorage(storage: StorageAdapter): void {
    this.storage = storage;
  }

  /**
   * Wire a state machine (P6 circuit breaker). When set, `send()` will
   * pre-check + post-record. Idempotent.
   */
  setStateMachine(sm: StateMachine | undefined): void {
    this.stateMachine = sm;
  }

  /**
   * Wire the reverse-channel mux (v0.9 P8). STDIO upstream-initiated
   * JSON-RPC REQUESTS are routed through this mux back to the client
   * that owns `_meta.session_id`. HTTP upstreams require an explicit
   * server→gateway push channel which is out of scope for v0.9.
   */
  setReverseChannel(mux: ReverseChannelMux | undefined): void {
    this.reverseChannel = mux;
  }

  /**
   * Wire a sampling-log recorder (v0.9). Optional — when unset, mux
   * round-trips are not persisted (but still routed correctly).
   */
  setSamplingRecorder(
    fn: SessionManager['samplingRecord'] | undefined,
  ): void {
    this.samplingRecord = fn;
  }

  /**
   * Wire a reverse-channel redactor (v0.10, gated by
   * `gateway.reverseChannelRedaction`). Optional — when unset, reverse-call
   * payloads are forwarded without redaction (the pre-v0.10 behaviour).
   */
  setReverseRedactor(
    fn: SessionManager['reverseRedactor'] | undefined,
  ): void {
    this.reverseRedactor = fn;
  }

  /**
   * v0.9 reverse-channel inbound from an STDIO upstream. Forwards the
   * JSON-RPC request to the originating client (identified via
   * `params._meta.session_id` injected by `send()`) and writes the
   * client's response back to the upstream's stdin so the upstream's
   * own request promise can resolve.
   *
   * Failures are reported back to the upstream as a JSON-RPC error
   * response so the upstream isn't left waiting forever.
   *
   * When a `reverseRedactor` is wired (gateway.reverseChannelRedaction),
   * both legs are scrubbed: the upstream's reverse request before it
   * reaches the client, and the client's response before it reaches the
   * upstream. A block-mode match on either leg refuses the call.
   */
  private async handleUpstreamReverseRequest(
    serverName: string,
    session: StdioSession,
    msg: ReverseRequestShape,
  ): Promise<void> {
    const mux = this.reverseChannel;
    const requestId = String(msg.id);

    // Pull the originating client session id from _meta up front so every
    // outcome (including early rejections) can be recorded against it.
    const params = msg.params ?? {};
    const meta = (params._meta as { session_id?: unknown } | undefined);
    const sessionId = typeof meta?.session_id === 'string' ? meta.session_id : null;
    const reqHash = hashShort(JSON.stringify(msg));

    // I5: a single recorder so NO branch silently skips the sampling_log.
    const record = (
      outcome: 'success' | 'client_refused' | 'timeout' | 'error' | 'method_not_supported',
      extra?: { responsePayloadHash?: string | null; latencyMs?: number | null },
    ): Promise<void> =>
      this.samplingRecord?.({
        requestId,
        upstreamServer: serverName,
        clientSessionId: sessionId ?? 'unknown',
        method: msg.method,
        requestPayloadHash: reqHash,
        ...extra,
        outcome,
      }).catch(() => undefined) ?? Promise.resolve();

    // I1: roots/list is answered by the gateway's own admin-managed view in
    // v1 — never fanned out to a client (matches the POST /mcp roots/list
    // handler). An empty list is spec-valid.
    if (msg.method === 'roots/list') {
      this.writeStdioResponse(session, { jsonrpc: '2.0', id: msg.id, result: { roots: [] } });
      await record('success');
      return;
    }

    // Only forward known reverse methods.
    if (!REVERSE_FORWARDABLE_METHODS.has(msg.method)) {
      log.warn({ server: serverName, method: msg.method }, 'unknown upstream reverse method');
      this.writeStdioResponse(session, {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      });
      await record('method_not_supported');
      return;
    }

    if (!mux) {
      log.warn({ server: serverName, method: msg.method }, 'reverse channel not wired; rejecting');
      this.writeStdioResponse(session, {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32603, message: 'reverse channel not available' },
      });
      await record('error');
      return;
    }

    if (!sessionId) {
      log.warn({ server: serverName, method: msg.method }, 'reverse rpc missing _meta.session_id; rejecting');
      this.writeStdioResponse(session, {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32602, message: 'missing _meta.session_id' },
      });
      await record('error');
      return;
    }

    const started = Date.now();
    try {
      // RedactRequest leg — scrub secrets in the upstream's reverse request
      // (e.g. a sampling prompt/messages) before it is fanned to the client.
      let forwardFrame: ReverseRequestShape = msg;
      if (this.reverseRedactor) {
        const r = await this.reverseRedactor(params, 'request', {
          method: msg.method, serverName, requestId, clientSessionId: sessionId,
        });
        if (r.blocked) {
          this.writeStdioResponse(session, {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: `Reverse request blocked by redaction rule '${r.blocked.ruleName}'` },
          });
          await record('error', { latencyMs: Date.now() - started });
          return;
        }
        forwardFrame = { ...msg, params: r.value as Record<string, unknown> };
      }
      const response = await mux.forwardFromUpstream(serverName, sessionId, forwardFrame);
      // I3: the client's response must resolve the UPSTREAM's own request id.
      // Take only its result/error and force `id` to msg.id — never relay a
      // client-supplied id, which could mismatch and leave the upstream
      // waiting forever. A response carrying neither result nor error is
      // malformed and reported back as an internal error.
      const cr = response as { result?: unknown; error?: unknown } | null;
      if (!cr || typeof cr !== 'object' || !('result' in cr || 'error' in cr)) {
        this.writeStdioResponse(session, {
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32603, message: 'malformed client response' },
        });
        await record('error', { latencyMs: Date.now() - started });
        return;
      }
      const relayed: JsonRpcResponse =
        'error' in cr
          ? { jsonrpc: '2.0', id: msg.id, error: cr.error as JsonRpcResponse['error'] }
          : { jsonrpc: '2.0', id: msg.id, result: cr.result };
      // RedactResponse leg — scrub secrets in the client's model output
      // before it reaches the upstream.
      if (this.reverseRedactor && 'result' in relayed) {
        const r = await this.reverseRedactor(relayed.result, 'response', {
          method: msg.method, serverName, requestId, clientSessionId: sessionId,
        });
        if (r.blocked) {
          this.writeStdioResponse(session, {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: `Reverse response blocked by redaction rule '${r.blocked.ruleName}'` },
          });
          await record('error', { latencyMs: Date.now() - started });
          return;
        }
        relayed.result = r.value;
      }
      this.writeStdioResponse(session, relayed);
      await record('success', {
        responsePayloadHash: hashShort(JSON.stringify(relayed)),
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error';
      const outcome: 'timeout' | 'client_refused' | 'error' =
        name === 'ReverseChannelTimeoutError' ? 'timeout'
          : name === 'ClientNotConnectedError' ? 'client_refused'
          : 'error';
      this.writeStdioResponse(session, {
        jsonrpc: '2.0',
        id: msg.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      });
      await record(outcome, { latencyMs: Date.now() - started });
    }
  }

  /** Write a JSON-RPC response line back to a stdio upstream. */
  private writeStdioResponse(session: StdioSession, response: JsonRpcResponse): void {
    if (!session.process?.stdin || session.process.killed) return;
    try {
      session.process.stdin.write(JSON.stringify(response) + '\n');
    } catch (err) {
      log.warn({ err }, 'failed to write reverse-channel response to stdio');
    }
  }

  /**
   * Resolve the proxy dispatcher (if any) to use for an outbound call to
   * `serverName`. Returns `null` dispatcher when no proxy applies (direct
   * connect via Node's default fetch).
   *
   * Precedence (per resolveProxyName):
   *   server.proxyName  >  group.proxyName  >  defaultProxyName
   */
  private async resolveDispatcher(
    serverName: string,
    opts?: { groupProxyName?: string | null },
  ): Promise<{
    dispatcher: Dispatcher | null;
    proxyName: string | null;
    proxyScheme: string | null;
  }> {
    if (!this.proxyRegistry) {
      return { dispatcher: null, proxyName: null, proxyScheme: null };
    }
    let serverProxyName: string | null = null;
    if (this.storage) {
      try {
        const row = await this.storage.servers.findByName(serverName);
        serverProxyName = row?.proxyName ?? null;
      } catch {
        // Storage lookup failures collapse to "no server override" so we
        // still fall through to group / global defaults.
        serverProxyName = null;
      }
    }
    const name = resolveProxyName({
      serverProxyName,
      groupProxyName: opts?.groupProxyName ?? null,
      globalDefaultName: this.defaultProxyName,
    });
    if (!name) {
      return { dispatcher: null, proxyName: null, proxyScheme: null };
    }
    const dispatcher = this.proxyRegistry.get(name);
    const url = this.proxyRegistry.getUrl(name);
    let proxyScheme: string | null = null;
    if (url) {
      try {
        proxyScheme = new URL(url).protocol.replace(":", "");
      } catch {
        proxyScheme = null;
      }
    }
    return { dispatcher, proxyName: name, proxyScheme };
  }

  /**
   * Mark a server as an OpenAPI-backed virtual session. The actual call
   * dispatch is keyed by canonical tool name via `openapiTools`.
   */
  markOpenApiServer(serverName: string): void {
    this.openapiServers.add(serverName);
  }

  /**
   * Register an OpenAPI tool's adapter + operation meta for `tools/call`
   * dispatch. The canonical tool name is `<server>__<operationId>`.
   */
  registerOpenApiTool(
    canonical: string,
    adapter: OpenApiAdapter,
    meta: DiscoveredOpenApiTool["meta"],
  ): void {
    this.openapiTools.set(canonical, { adapter, meta });
  }

  /**
   * Remove every registered OpenAPI tool whose canonical name starts with
   * `<serverName>__`. Used before re-registering a server.
   */
  clearOpenApiToolsForServer(serverName: string): void {
    for (const canonical of [...this.openapiTools.keys()]) {
      if (canonical.startsWith(`${serverName}__`)) {
        this.openapiTools.delete(canonical);
      }
    }
    this.openapiServers.delete(serverName);
  }

  /** True iff `name` was marked as an OpenAPI-backed server. */
  isOpenApiServer(serverName: string): boolean {
    return this.openapiServers.has(serverName);
  }

  /**
   * Register a server session with its transport config.
   */
  register(serverName: string, config: TransportConfig): void {
    // Clean up existing session if any
    this.remove(serverName);

    if (config.type === "stdio") {
      this.sessions.set(serverName, {
        type: "stdio",
        config,
        process: null,
        pending: new Map(),
        buffer: "",
        idleTimer: null,
        initialized: false,
      });
    } else {
      this.sessions.set(serverName, {
        type: "http",
        config,
      });
    }

    log.info({ server: serverName, transport: config.type }, "Session registered");
  }

  /**
   * Load all enabled servers from storage and call register() for each.
   * Called once on gateway startup, replacing config.servers iteration.
   */
  async loadFromStorage(storage: StorageAdapter): Promise<void> {
    const servers = await storage.servers.list();
    for (const s of servers) {
      if (!s.enabled) continue;
      // OpenAPI servers do not have a transport session (no persistent
      // connection); they are dispatched per-call via `openapiTools`.
      if (s.transportType === "openapi") {
        this.markOpenApiServer(s.name);
        continue;
      }
      // Reshape DB row (transportType + transportConfig fields) into the
      // TransportConfig union shape that register() expects.
      const transport = {
        type: s.transportType,
        ...s.transportConfig,
      } as TransportConfig;
      this.register(s.name, transport);
    }
    log.info({ count: servers.filter((s) => s.enabled).length }, "Loaded servers from storage");
  }

  /**
   * Perform MCP initialization handshake then discover tools.
   * Call this instead of bare `tools/list` when first connecting to a server.
   *
   * Flow (per MCP spec):
   *   1. POST  initialize  → get server capabilities
   *   2. SEND  initialized (notification, fire-and-forget)
   *   3. POST  tools/list  → get tool list
   */
  async discoverTools(serverName: string): Promise<any[]> {
    return withSpan('mcp.tools.discover', { 'server.name': serverName }, async (span) => {
      // 1. Initialize handshake
      const initResponse = await this.send(serverName, {
        jsonrpc: "2.0",
        id: `init-${serverName}-${Date.now()}`,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          clientInfo: { name: "mcp-gateway", version: "0.1.0" },
        },
      });

      if (initResponse.error) {
        throw new UpstreamConnectionError(
          serverName,
          `Initialize failed: ${initResponse.error.message}`
        );
      }

      log.debug(
        { server: serverName, serverInfo: (initResponse.result as any)?.serverInfo },
        "MCP handshake complete"
      );

      // 2. Send initialized notification (no response expected)
      this.sendNotification(serverName, { jsonrpc: "2.0", method: "notifications/initialized" });

      // 3. List tools
      const toolsResponse = await this.send(serverName, {
        jsonrpc: "2.0",
        id: `tools-${serverName}-${Date.now()}`,
        method: "tools/list",
      });

      const tools = (toolsResponse.result as any)?.tools ?? [];
      span.setAttribute('tools.count', tools.length);
      return tools;
    });
  }

  /**
   * Send `prompts/list` to the upstream server and convert the MCP
   * `arguments[]` shape to a JSON-schema-ish `argumentsSchema`.
   *
   * Returns an empty array if the server doesn't support prompts/list
   * or if any error occurs.
   */
  async discoverPrompts(serverName: string): Promise<DiscoveredPrompt[]> {
    return withSpan('mcp.prompts.discover', { 'server.name': serverName }, async (span) => {
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: `prompts-${serverName}-${Date.now()}`,
        method: "prompts/list",
      };
      try {
        const result = await this.send(serverName, request) as {
          result?: { prompts?: Array<{ name: string; description?: string; arguments?: unknown }> };
        };
        const prompts = (result as any)?.result?.prompts ?? [];
        span.setAttribute('prompts.count', prompts.length);
        return prompts.map((p: { name: string; description?: string; arguments?: unknown }) => ({
          originalName: p.name,
          description: p.description ?? "",
          argumentsSchema: argsToJsonSchema(p.arguments),
        }));
      } catch {
        span.setAttribute('prompts.count', 0);
        return [];
      }
    });
  }

  /**
   * Fire-and-forget notification (no response expected).
   */
  private sendNotification(
    serverName: string,
    notification: { jsonrpc: "2.0"; method: string; params?: unknown }
  ): void {
    const session = this.sessions.get(serverName);
    if (!session) return;

    if (session.type === "http") {
      const sessionMode = session.config.session_mode ?? "stateful";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(session.config.headers ?? {}),
      };
      if (session.config.bearerToken) {
        headers["Authorization"] = `Bearer ${session.config.bearerToken}`;
      }
      if (sessionMode !== "stateless" && session.mcpSessionId) {
        headers["Mcp-Session-Id"] = session.mcpSessionId;
      }
      // Resolve dispatcher asynchronously and fire-and-forget. Errors and
      // the dispatcher lookup are intentionally swallowed — notifications
      // must not throw into the caller.
      void (async () => {
        try {
          const proxy = await this.resolveDispatcher(serverName);
          await fetch(session.config.url, {
            method: "POST",
            headers,
            body: JSON.stringify(notification),
            ...(proxy.dispatcher
              ? ({ dispatcher: proxy.dispatcher } as Record<string, unknown>)
              : {}),
          } as RequestInit);
        } catch {
          /* fire-and-forget */
        }
      })();
    } else if (session.type === "stdio" && session.process?.stdin) {
      const msg = JSON.stringify(notification) + "\n";
      session.process.stdin.write(msg, () => {});
    }
  }

  /**
   * Send a JSON-RPC request to an upstream server.
   * Handles transport differences transparently.
   *
   * @param opts.timeoutMs              — per-call timeout override (ms)
   * @param opts.groupProxyName         — group's proxyName (when call arrived via
   *                                      `/mcp/groups/:name`). Server-level proxy
   *                                      still wins per resolveProxyName().
   * @param opts.originatingSessionId   — v0.9 reverse-channel binding. When set,
   *                                      we inject `_meta.session_id` into the
   *                                      outbound `params` so that any
   *                                      upstream-initiated reverse RPC
   *                                      (sampling/createMessage, roots/list,
   *                                      resources/updated) carries the
   *                                      session-id and the gateway's mux can
   *                                      route the reverse request back to the
   *                                      right client. An already-present
   *                                      `_meta` field is left untouched.
   *
   * For backwards compatibility, the 3rd argument may still be a bare
   * `number` (treated as `timeoutMs`).
   */
  async send(
    serverName: string,
    request: JsonRpcRequest,
    opts?: number | { timeoutMs?: number; groupProxyName?: string | null; originatingSessionId?: string },
  ): Promise<JsonRpcResponse> {
    const normalized: { timeoutMs?: number; groupProxyName?: string | null; originatingSessionId?: string } =
      typeof opts === "number" ? { timeoutMs: opts } : (opts ?? {});

    // Inject `_meta.session_id` so upstream reverse RPCs carry it back.
    // Only injected when caller supplied an `originatingSessionId` and the
    // request doesn't already specify `_meta` (don't clobber explicit meta).
    if (normalized.originatingSessionId) {
      const params = request.params;
      if (params && typeof params === 'object' && !Array.isArray(params)) {
        const paramsObj = params as Record<string, unknown>;
        if (paramsObj._meta === undefined) {
          request = {
            ...request,
            params: { ...paramsObj, _meta: { session_id: normalized.originatingSessionId } },
          };
        }
      } else if (params === undefined) {
        request = {
          ...request,
          params: { _meta: { session_id: normalized.originatingSessionId } },
        };
      }
    }

    // ── P6 circuit-breaker guard ──────────────────────
    // If a state machine is wired, consult it BEFORE dispatching. If it
    // rejects, throw and do NOT record the rejection (the rejection itself
    // would otherwise double-count as a failure).
    if (this.stateMachine) {
      const health = this.stateMachine.getState(serverName);
      if (
        health.state === "circuit_open" ||
        health.state === "manual_disabled" ||
        health.state === "quarantined"
      ) {
        const retryAfter =
          health.state === "circuit_open" && health.openedAt !== undefined
            ? health.openedAt + health.config.cooldownMs
            : undefined;
        try { circuitRejectionsTotal.inc({ server: serverName }); } catch { /* never throw */ }
        throw new UpstreamCircuitOpenError(
          serverName,
          health.state,
          health.openedAt,
          retryAfter,
        );
      }
    }

    const started = Date.now();
    let result: JsonRpcResponse;
    let success = false;
    let errorCode: string | undefined;
    try {
      result = await this.dispatch(serverName, request, normalized);
      success = true;
      return result;
    } catch (err) {
      success = false;
      errorCode =
        err instanceof Error
          ? err.name === "UpstreamTimeoutError"
            ? "upstream_timeout"
            : err.name === "UpstreamConnectionError"
            ? "upstream_connection"
            : err.name
          : "unknown_error";
      throw err;
    } finally {
      // Always record the call (success or failure) when a state machine
      // is wired. Skip when there is no state machine (legacy behaviour).
      if (this.stateMachine) {
        this.stateMachine.recordCall(serverName, {
          ts: Date.now(),
          success,
          errorCode,
          latencyMs: Date.now() - started,
        });
      }
    }
  }

  /**
   * Send a JSON-RPC request bypassing the circuit-breaker guard.
   *
   * This is the path the background probe loop uses: it must reach the
   * upstream even when the circuit is open or half-open so the state
   * machine can recover. The result IS NOT recorded to the state machine
   * here — the caller (ProbeLoop) is responsible for that so it can apply
   * probe-specific semantics (e.g. error codes like `probe_timeout`).
   */
  async rawSend(
    serverName: string,
    request: unknown,
  ): Promise<JsonRpcResponse> {
    return this.dispatch(serverName, request as JsonRpcRequest, {});
  }

  /**
   * Internal dispatcher — performs the actual transport-specific call.
   * Routes to OpenAPI / HTTP / STDIO without consulting the state machine.
   */
  private async dispatch(
    serverName: string,
    request: JsonRpcRequest,
    normalized: { timeoutMs?: number; groupProxyName?: string | null },
  ): Promise<JsonRpcResponse> {
    // OpenAPI virtual sessions: dispatch via per-tool adapter map.
    if (this.openapiServers.has(serverName)) {
      return this.sendOpenApi(serverName, request);
    }

    const session = this.sessions.get(serverName);
    if (!session) {
      throw new UpstreamConnectionError(serverName, "No session registered");
    }

    let result: JsonRpcResponse;
    if (session.type === "http") {
      result = await this.sendHttp(serverName, session, request, normalized);
    } else {
      result = await this.sendStdio(serverName, session, request, normalized.timeoutMs);
    }
    // Update lastSeen on every successful send so the idle-cleanup loop
    // can determine when a session was last active.
    session.lastSeen = Date.now();
    return result;
  }

  /**
   * Dispatch a JSON-RPC request to an OpenAPI-backed server. Only
   * `tools/call` is meaningfully implemented; `tools/list` returns the
   * already-discovered tools from storage so it's routed elsewhere.
   */
  private async sendOpenApi(
    serverName: string,
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    if (request.method !== "tools/call") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { tools: [] },
      } as JsonRpcResponse;
    }
    const params = request.params as
      | { name?: string; arguments?: Record<string, unknown> }
      | undefined;
    const canonical = params?.name;
    const entry = this.openapiTools.get(canonical ?? "");
    if (!entry) {
      throw new UpstreamConnectionError(
        serverName,
        `openapi_tool_not_registered: ${canonical ?? ""}`,
      );
    }
    const args = params?.arguments ?? {};
    const out = await entry.adapter.call(entry.meta, args);
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: JSON.stringify(out.body) }],
        structuredContent: out.body,
      },
    } as JsonRpcResponse;
  }

  /**
   * Remove a server session and clean up resources.
   */
  remove(serverName: string): void {
    // OpenAPI virtual sessions: drop registered tools + marker.
    if (this.openapiServers.has(serverName)) {
      this.clearOpenApiToolsForServer(serverName);
    }

    const session = this.sessions.get(serverName);
    if (!session) return;

    if (session.type === "stdio") {
      this.killStdioSession(session);
    }

    this.sessions.delete(serverName);
    log.info({ server: serverName }, "Session removed");
  }

  /**
   * Check if a server has an active session.
   */
  has(serverName: string): boolean {
    return this.sessions.has(serverName) || this.openapiServers.has(serverName);
  }

  /**
   * Graceful shutdown — clean up all sessions and stop the cleanup interval.
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    for (const [name, session] of this.sessions) {
      if (session.type === "stdio") {
        this.killStdioSession(session);
      }
      log.debug({ server: name }, "Session cleaned up");
    }
    this.sessions.clear();
    log.info("All sessions shut down");
  }

  // ── HTTP Transport ───────────────────────────────────

  private async sendHttp(
    serverName: string,
    session: HttpSession,
    request: JsonRpcRequest,
    opts?: { timeoutMs?: number; groupProxyName?: string | null },
  ): Promise<JsonRpcResponse> {
    const timeout = opts?.timeoutMs ?? session.config.timeout ?? 30000;
    const sessionMode = session.config.session_mode ?? "stateful";

    return withSpan(
      "gateway.session.send",
      {
        "server.name": serverName,
        transport: "streamable-http",
        "mcp.method": request.method,
        "session.mode": sessionMode,
      },
      async (span) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        // Build headers. Ordering matters:
        //   1. Base content/accept (cannot be overridden by user)
        //   2. User-supplied upstream headers
        //   3. Computed auth + session id (cannot be overridden by user)
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(session.config.headers ?? {}),
        };

        // Add bearer token if configured
        if (session.config.bearerToken) {
          headers["Authorization"] = `Bearer ${session.config.bearerToken}`;
        }

        // Add MCP session ID only in stateful mode
        if (sessionMode !== "stateless" && session.mcpSessionId) {
          headers["Mcp-Session-Id"] = session.mcpSessionId;
        }

        // Forward W3C traceparent for distributed tracing across gateway→upstream
        const tp = currentTraceparent();
        if (tp) headers["traceparent"] = tp;

        // Resolve outbound proxy dispatcher (P5).
        const proxy = await this.resolveDispatcher(serverName, {
          groupProxyName: opts?.groupProxyName ?? null,
        });
        span.setAttribute("proxy.name", proxy.proxyName ?? "direct");
        if (proxy.proxyScheme) {
          span.setAttribute("proxy.scheme", proxy.proxyScheme);
        }

        try {
          const fetchStart = Date.now();
          const response = await fetch(session.config.url, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
            signal: controller.signal,
            ...(proxy.dispatcher
              ? ({ dispatcher: proxy.dispatcher } as Record<string, unknown>)
              : {}),
          } as RequestInit);
          if (proxy.proxyName) {
            proxyRequestsTotal.inc({ proxy: proxy.proxyName, result: "success" });
          }
          upstreamLatency.observe(
            { server: serverName, transport: "streamable-http" },
            (Date.now() - fetchStart) / 1000
          );

          clearTimeout(timer);

          if (!response.ok) {
            throw new UpstreamConnectionError(
              serverName,
              `HTTP ${response.status}: ${response.statusText}`
            );
          }

          // Capture MCP session ID from response (stateful only)
          if (sessionMode !== "stateless") {
            const newSessionId = response.headers.get("mcp-session-id");
            if (newSessionId) {
              session.mcpSessionId = newSessionId;
            }
          }

          // Check Content-Type — server may respond with JSON or SSE stream
          const contentType = response.headers.get("content-type") ?? "";

          if (contentType.includes("text/event-stream")) {
            // Streamable HTTP: response is an SSE stream
            // Parse events until we get the JSON-RPC response matching our request ID
            return await this.parseSseResponse(serverName, response, request.id);
          }

          return (await response.json()) as JsonRpcResponse;
        } catch (err) {
          clearTimeout(timer);
          if (proxy.proxyName) {
            proxyRequestsTotal.inc({ proxy: proxy.proxyName, result: "failed" });
          }
          if (err instanceof Error && err.name === "AbortError") {
            throw new UpstreamTimeoutError(serverName, timeout);
          }
          if (err instanceof UpstreamConnectionError) throw err;
          throw new UpstreamConnectionError(
            serverName,
            err instanceof Error ? err.message : "Unknown error"
          );
        }
      },
    );
  }

  /**
   * Parse an SSE stream response and return the first JSON-RPC response
   * that matches the given request ID (or any response if ID is undefined).
   *
   * SSE format:
   *   event: message\n
   *   data: {"jsonrpc":"2.0","id":1,"result":{...}}\n
   *   \n
   */
  private async parseSseResponse(
    serverName: string,
    response: Response,
    requestId: string | number | null | undefined
  ): Promise<JsonRpcResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new UpstreamConnectionError(serverName, "SSE response has no body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newline
        const events = buffer.split(/\n\n/);
        // Keep the last (potentially incomplete) chunk in buffer
        buffer = events.pop() ?? "";

        for (const event of events) {
          // Extract data lines from the SSE event block
          const dataLines = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());

          for (const dataLine of dataLines) {
            if (!dataLine || dataLine === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataLine) as JsonRpcResponse;
              // Match by request ID, or return first response if no ID (notifications etc.)
              if (requestId == null || parsed.id === requestId) {
                reader.cancel();
                return parsed;
              }
            } catch {
              log.debug({ server: serverName, data: dataLine }, "Non-JSON SSE data line");
            }
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    throw new UpstreamConnectionError(serverName, "SSE stream ended without matching response");
  }

  // ── STDIO Transport ──────────────────────────────────

  private async sendStdio(
    serverName: string,
    session: StdioSession,
    request: JsonRpcRequest,
    timeoutMs?: number
  ): Promise<JsonRpcResponse> {
    // Ensure process is running
    if (!session.process || session.process.killed) {
      await this.spawnStdioProcess(serverName, session);
    }

    // Reset idle timer for stateful mode
    if (session.config.stateful) {
      this.resetIdleTimer(serverName, session);
    }

    const timeout = timeoutMs ?? 30000;

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(request.id);
        reject(new UpstreamTimeoutError(serverName, timeout));
      }, timeout);

      session.pending.set(request.id, { resolve, reject, timer });

      // Write JSON-RPC message to stdin
      const msg = JSON.stringify(request) + "\n";
      session.process!.stdin!.write(msg, (err) => {
        if (err) {
          clearTimeout(timer);
          session.pending.delete(request.id);
          reject(new UpstreamConnectionError(serverName, err.message));
        }
      });
    });
  }

  /**
   * Spawn a child process for a STDIO server.
   */
  private async spawnStdioProcess(
    serverName: string,
    session: StdioSession
  ): Promise<void> {
    const { command, args = [], env } = session.config;

    log.info({ server: serverName, command, args }, "Spawning STDIO process");

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });

    session.process = proc;
    session.buffer = "";
    session.initialized = false;

    // Handle stdout — parse JSON-RPC responses, and (v0.9) detect
    // upstream-initiated JSON-RPC REQUESTS routed through the reverse
    // channel mux.
    proc.stdout!.on("data", (chunk: Buffer) => {
      session.buffer += chunk.toString();

      // Try to parse complete JSON lines
      const lines = session.buffer.split("\n");
      session.buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;

          // Classify strictly by JSON-RPC message *kind*, not by a heuristic.
          // The gateway's outbound request ids and an upstream's own request
          // ids are independent namespaces; we never disambiguate by id
          // value alone. A frame carrying `method` is a request/notification;
          // a frame carrying `result`/`error` (and no `method`) is a response.
          const hasMethod = typeof msg.method === 'string';
          const hasId = 'id' in msg && msg.id != null;
          const isResponseFrame = !hasMethod && hasId && ('result' in msg || 'error' in msg);

          // ── JSON-RPC RESPONSE — resolve the matching pending request ──
          if (isResponseFrame) {
            const pending = session.pending.get(msg.id as string | number);
            if (pending) {
              clearTimeout(pending.timer);
              session.pending.delete(msg.id as string | number);
              pending.resolve(msg as unknown as JsonRpcResponse);
            } else {
              // No outstanding gateway request for this id — duplicate or
              // late delivery. Drop it rather than mis-routing.
              log.debug({ server: serverName, id: msg.id }, 'orphan JSON-RPC response (no pending request)');
            }
            continue;
          }

          // ── JSON-RPC REQUEST initiated by the upstream (method + id) ──
          // v0.9 routes `sampling/createMessage` back to the originating
          // client through the reverse-channel mux (and answers `roots/list`
          // with the gateway's admin view). Because request/response are
          // distinguished by kind above, an upstream request id that happens
          // to equal a pending gateway id cannot be misread as a response —
          // but we surface the collision since it signals a misbehaving
          // upstream reusing the gateway's id space.
          if (hasMethod && hasId) {
            if (session.pending.has(msg.id as string | number)) {
              log.warn(
                { server: serverName, id: msg.id, method: msg.method },
                'upstream-initiated request id collides with a pending gateway request id',
              );
            }
            this.handleUpstreamReverseRequest(serverName, session, msg as unknown as ReverseRequestShape)
              .catch((err) => log.warn({ err, serverName }, 'reverse-channel handling failed'));
            continue;
          }

          // ── Notification (method but no id) ── just log.
          if (hasMethod) {
            log.debug({ server: serverName, method: msg.method }, 'upstream notification (ignored in v0.9)');
            continue;
          }
        } catch {
          log.debug({ server: serverName, line: trimmed }, "Non-JSON output from STDIO");
        }
      }
    });

    // Handle stderr — log as warnings
    proc.stderr!.on("data", (chunk: Buffer) => {
      log.warn({ server: serverName, stderr: chunk.toString().trim() }, "STDIO stderr");
    });

    // Handle process exit
    proc.on("exit", (code, signal) => {
      log.info({ server: serverName, code, signal }, "STDIO process exited");

      // Reject all pending requests
      for (const [id, pending] of session.pending) {
        clearTimeout(pending.timer);
        pending.reject(
          new UpstreamConnectionError(serverName, `Process exited with code ${code}`)
        );
      }
      session.pending.clear();
      session.process = null;
    });

    proc.on("error", (err) => {
      log.error({ server: serverName, err }, "STDIO process error");
    });

    // Wait a short moment for process to start
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Reset the idle timer for a stateful STDIO session.
   * If no requests come in within the timeout, the process is killed.
   */
  private resetIdleTimer(serverName: string, session: StdioSession): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }

    const timeout = session.config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT;
    session.idleTimer = setTimeout(() => {
      log.info({ server: serverName, timeoutMs: timeout }, "STDIO session idle, killing");
      this.killStdioSession(session);
    }, timeout);
  }

  /**
   * Kill a STDIO process and clean up.
   */
  private killStdioSession(session: StdioSession): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    if (session.process && !session.process.killed) {
      session.process.kill("SIGTERM");

      // Force kill after 5s
      setTimeout(() => {
        if (session.process && !session.process.killed) {
          session.process.kill("SIGKILL");
        }
      }, 5000);
    }

    // Reject pending
    for (const [, pending] of session.pending) {
      clearTimeout(pending.timer);
      pending.reject(new UpstreamConnectionError("stdio", "Session terminated"));
    }
    session.pending.clear();
    session.process = null;
  }
}
