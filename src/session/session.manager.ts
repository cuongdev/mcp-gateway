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
import { randomUUID } from "node:crypto";
import type { JsonRpcRequest, JsonRpcResponse } from "../types/mcp.js";
import { UpstreamConnectionError, UpstreamTimeoutError } from "../types/errors.js";
import type { StorageAdapter } from "../storage/adapter.js";
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

// ── Session Manager ────────────────────────────────────

export interface SessionManagerOptions {
  /** Seconds before an idle session is dropped (0 = disabled, default 600) */
  idleTimeoutSec?: number;
}

export class SessionManager {
  /** server-name → session */
  private sessions = new Map<string, Session>();

  /** Periodic cleanup interval for idle sessions */
  private cleanupInterval?: ReturnType<typeof setInterval>;

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

    return (toolsResponse.result as any)?.tools ?? [];
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
      // Fire and forget — ignore errors
      fetch(session.config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(notification),
      }).catch(() => {});
    } else if (session.type === "stdio" && session.process?.stdin) {
      const msg = JSON.stringify(notification) + "\n";
      session.process.stdin.write(msg, () => {});
    }
  }

  /**
   * Send a JSON-RPC request to an upstream server.
   * Handles transport differences transparently.
   */
  async send(
    serverName: string,
    request: JsonRpcRequest,
    timeoutMs?: number
  ): Promise<JsonRpcResponse> {
    const session = this.sessions.get(serverName);
    if (!session) {
      throw new UpstreamConnectionError(serverName, "No session registered");
    }

    let result: JsonRpcResponse;
    if (session.type === "http") {
      result = await this.sendHttp(serverName, session, request, timeoutMs);
    } else {
      result = await this.sendStdio(serverName, session, request, timeoutMs);
    }
    // Update lastSeen on every successful send so the idle-cleanup loop
    // can determine when a session was last active.
    session.lastSeen = Date.now();
    return result;
  }

  /**
   * Remove a server session and clean up resources.
   */
  remove(serverName: string): void {
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
    return this.sessions.has(serverName);
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
    timeoutMs?: number
  ): Promise<JsonRpcResponse> {
    const timeout = timeoutMs ?? session.config.timeout ?? 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const sessionMode = session.config.session_mode ?? "stateful";

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

    try {
      const response = await fetch(session.config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

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
      if (err instanceof Error && err.name === "AbortError") {
        throw new UpstreamTimeoutError(serverName, timeout);
      }
      if (err instanceof UpstreamConnectionError) throw err;
      throw new UpstreamConnectionError(
        serverName,
        err instanceof Error ? err.message : "Unknown error"
      );
    }
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

    // Handle stdout — parse JSON-RPC responses
    proc.stdout!.on("data", (chunk: Buffer) => {
      session.buffer += chunk.toString();

      // Try to parse complete JSON lines
      const lines = session.buffer.split("\n");
      session.buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed) as JsonRpcResponse;

          if ("id" in msg && msg.id != null) {
            const pending = session.pending.get(msg.id);
            if (pending) {
              clearTimeout(pending.timer);
              session.pending.delete(msg.id);
              pending.resolve(msg);
            }
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
