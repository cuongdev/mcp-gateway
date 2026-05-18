// ============================================================
// Tool Registry
// Central registry of all tools from all upstream MCP servers.
// Implements canonical naming: server-name__tool-name
// ============================================================

import type { MCPTool } from "../types/mcp.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "tool-registry" });

/** Separator used in canonical tool names */
export const CANONICAL_SEPARATOR = "__";

/** A registered tool with server association */
export interface RegisteredTool {
  /** Canonical name: server-name__tool-name */
  canonicalName: string;
  /** Original tool name from the upstream server */
  originalName: string;
  /** Server that provides this tool */
  serverName: string;
  /** Tool description */
  description?: string;
  /** Tool input schema */
  inputSchema: MCPTool["inputSchema"];
  /** Whether this tool is enabled */
  enabled: boolean;
  /** When this tool was discovered */
  registeredAt: Date;
}

/**
 * ToolRegistry — single source of truth for all tools
 * across all registered upstream MCP servers.
 *
 * Follows MCPJungle's canonical naming pattern:
 *   server-name__tool-name
 *
 * This ensures globally unique tool identifiers even when
 * multiple servers expose tools with the same name.
 */
export class ToolRegistry {
  /** canonical-name → RegisteredTool */
  private tools = new Map<string, RegisteredTool>();

  /** server-name → set of canonical tool names */
  private serverTools = new Map<string, Set<string>>();

  // ── Public API ───────────────────────────────────────

  /**
   * Register all tools discovered from an upstream server.
   * Replaces any previously registered tools for that server.
   */
  registerServerTools(serverName: string, tools: MCPTool[]): void {
    // Remove old entries for this server
    this.removeServerTools(serverName);

    const names = new Set<string>();

    for (const tool of tools) {
      const canonicalName = this.toCanonical(serverName, tool.name);

      const entry: RegisteredTool = {
        canonicalName,
        originalName: tool.name,
        serverName,
        description: tool.description,
        inputSchema: tool.inputSchema,
        enabled: true,
        registeredAt: new Date(),
      };

      this.tools.set(canonicalName, entry);
      names.add(canonicalName);
    }

    this.serverTools.set(serverName, names);
    log.info(
      { server: serverName, toolCount: tools.length },
      "Registered tools from server"
    );
  }

  /**
   * Remove all tools belonging to a server.
   */
  removeServerTools(serverName: string): void {
    const names = this.serverTools.get(serverName);
    if (names) {
      for (const n of names) this.tools.delete(n);
      this.serverTools.delete(serverName);
      log.info({ server: serverName }, "Removed server tools");
    }
  }

  /**
   * Resolve a canonical tool name to (serverName, originalToolName).
   */
  resolve(canonicalName: string): { serverName: string; toolName: string } | undefined {
    const tool = this.tools.get(canonicalName);
    if (!tool || !tool.enabled) return undefined;
    return { serverName: tool.serverName, toolName: tool.originalName };
  }

  /**
   * Get a single registered tool by canonical name.
   */
  get(canonicalName: string): RegisteredTool | undefined {
    return this.tools.get(canonicalName);
  }

  /**
   * Get all enabled tools (as MCP Tool definitions).
   * Returns tools with canonical names so clients see
   * globally unique identifiers.
   */
  listTools(): MCPTool[] {
    const result: MCPTool[] = [];
    for (const tool of this.tools.values()) {
      if (!tool.enabled) continue;
      result.push({
        name: tool.canonicalName,
        description: tool.description
          ? `[${tool.serverName}] ${tool.description}`
          : `[${tool.serverName}]`,
        inputSchema: tool.inputSchema,
      });
    }
    return result;
  }

  /**
   * List tools for a specific server only.
   */
  listServerTools(serverName: string): MCPTool[] {
    const names = this.serverTools.get(serverName);
    if (!names) return [];

    const result: MCPTool[] = [];
    for (const canonicalName of names) {
      const tool = this.tools.get(canonicalName);
      if (tool && tool.enabled) {
        result.push({
          name: tool.canonicalName,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return result;
  }

  /**
   * Enable or disable a specific tool.
   */
  setEnabled(canonicalName: string, enabled: boolean): boolean {
    const tool = this.tools.get(canonicalName);
    if (!tool) return false;
    tool.enabled = enabled;
    log.info({ tool: canonicalName, enabled }, "Tool enable state changed");
    return true;
  }

  /**
   * Get all registered tools (including disabled) as raw entries.
   */
  listAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all server names that have registered tools.
   */
  listServers(): string[] {
    return Array.from(this.serverTools.keys());
  }

  /**
   * Total number of registered (enabled) tools.
   */
  get size(): number {
    let count = 0;
    for (const t of this.tools.values()) {
      if (t.enabled) count++;
    }
    return count;
  }

  // ── Helpers ──────────────────────────────────────────

  /** Build canonical name: server-name__tool-name */
  toCanonical(serverName: string, toolName: string): string {
    return `${serverName}${CANONICAL_SEPARATOR}${toolName}`;
  }

  /** Parse canonical name back to parts */
  parseCanonical(canonicalName: string): { serverName: string; toolName: string } | undefined {
    const idx = canonicalName.indexOf(CANONICAL_SEPARATOR);
    if (idx === -1) return undefined;
    return {
      serverName: canonicalName.slice(0, idx),
      toolName: canonicalName.slice(idx + CANONICAL_SEPARATOR.length),
    };
  }
}
