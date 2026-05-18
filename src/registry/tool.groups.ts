// ============================================================
// Tool Groups
// Curated subsets of tools exposed as dedicated MCP endpoints.
//
// Follows MCPJungle's Tool Group pattern:
//   Each group gets its own /mcp/groups/:groupName endpoint
//   and only exposes the tools included in that group.
//
// This solves context window pollution — an AI agent only
// sees the tools it actually needs.
// ============================================================

import type { MCPTool } from "../types/mcp.js";
import type { ToolRegistry } from "./tool.registry.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "tool-groups" });

/** Tool group definition */
export interface ToolGroup {
  /** Group name (used in URL path) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** List of canonical tool names included in this group */
  tools: string[];
  /** Whether this group is active */
  enabled: boolean;
  /** Optional: restrict access to certain roles */
  allowedRoles?: string[];
  /** When the group was created */
  createdAt: Date;
}

/**
 * ToolGroupManager — manages curated tool subsets.
 *
 * Each group provides a dedicated MCP endpoint that only
 * lists and allows execution of its included tools.
 *
 * Example:
 *   Group "data-analyst" includes: ["db__query_data", "db__get_report"]
 *   → available at POST /mcp/groups/data-analyst
 *   → tools/list only returns those 2 tools
 *   → tools/call only allows those 2 tools
 */
export class ToolGroupManager {
  private groups = new Map<string, ToolGroup>();
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Create a new tool group.
   */
  create(
    name: string,
    tools: string[],
    options?: { description?: string; allowedRoles?: string[] }
  ): ToolGroup {
    if (this.groups.has(name)) {
      throw new Error(`Tool group "${name}" already exists`);
    }

    // Validate tools exist
    const validTools: string[] = [];
    for (const t of tools) {
      if (this.registry.get(t)) {
        validTools.push(t);
      } else {
        log.warn({ group: name, tool: t }, "Tool not found in registry, skipping");
      }
    }

    const group: ToolGroup = {
      name,
      description: options?.description,
      tools: validTools,
      enabled: true,
      allowedRoles: options?.allowedRoles,
      createdAt: new Date(),
    };

    this.groups.set(name, group);
    log.info({ group: name, toolCount: validTools.length }, "Tool group created");
    return group;
  }

  /**
   * Update an existing group's tool list.
   */
  update(
    name: string,
    updates: Partial<Pick<ToolGroup, "tools" | "description" | "enabled" | "allowedRoles">>
  ): ToolGroup | undefined {
    const group = this.groups.get(name);
    if (!group) return undefined;

    if (updates.tools !== undefined) group.tools = updates.tools;
    if (updates.description !== undefined) group.description = updates.description;
    if (updates.enabled !== undefined) group.enabled = updates.enabled;
    if (updates.allowedRoles !== undefined) group.allowedRoles = updates.allowedRoles;

    log.info({ group: name }, "Tool group updated");
    return group;
  }

  /**
   * Delete a tool group.
   */
  delete(name: string): boolean {
    const deleted = this.groups.delete(name);
    if (deleted) log.info({ group: name }, "Tool group deleted");
    return deleted;
  }

  /**
   * Get a tool group by name.
   */
  get(name: string): ToolGroup | undefined {
    return this.groups.get(name);
  }

  /**
   * List all groups.
   */
  list(): ToolGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Get the MCP tool definitions for a group.
   * Only returns enabled tools that are in both the group AND the registry.
   */
  listGroupTools(groupName: string): MCPTool[] {
    const group = this.groups.get(groupName);
    if (!group || !group.enabled) return [];

    const result: MCPTool[] = [];
    for (const canonicalName of group.tools) {
      const tool = this.registry.get(canonicalName);
      if (tool && tool.enabled) {
        result.push({
          name: tool.canonicalName,
          description: tool.description
            ? `[${tool.serverName}] ${tool.description}`
            : `[${tool.serverName}]`,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return result;
  }

  /**
   * Check if a tool is allowed in a specific group.
   */
  isToolInGroup(groupName: string, canonicalToolName: string): boolean {
    const group = this.groups.get(groupName);
    if (!group || !group.enabled) return false;
    return group.tools.includes(canonicalToolName);
  }

  /**
   * Add a tool to an existing group.
   */
  addTool(groupName: string, canonicalToolName: string): boolean {
    const group = this.groups.get(groupName);
    if (!group) return false;
    if (group.tools.includes(canonicalToolName)) return true;
    group.tools.push(canonicalToolName);
    log.info({ group: groupName, tool: canonicalToolName }, "Tool added to group");
    return true;
  }

  /**
   * Remove a tool from a group.
   */
  removeTool(groupName: string, canonicalToolName: string): boolean {
    const group = this.groups.get(groupName);
    if (!group) return false;
    const idx = group.tools.indexOf(canonicalToolName);
    if (idx === -1) return false;
    group.tools.splice(idx, 1);
    log.info({ group: groupName, tool: canonicalToolName }, "Tool removed from group");
    return true;
  }
}
