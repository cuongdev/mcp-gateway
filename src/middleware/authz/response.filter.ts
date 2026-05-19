// ============================================================
// Response Filter
// Filters MCP responses based on user permissions
// Removes tools/resources/prompts the user cannot access
// ============================================================

import type { UserContext } from "../../types/gateway.js";
import type { JsonRpcResponse } from "../../types/mcp.js";
import { MCP_METHODS } from "../../types/mcp.js";
import type { PolicyEngine } from "./policy.engine.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ component: "response-filter" });

/**
 * Filter an MCP response based on the user's permissions.
 * This ensures users only see tools/resources they're authorized to use.
 */
export async function filterResponse(
  engine: PolicyEngine,
  user: UserContext,
  method: string,
  response: JsonRpcResponse
): Promise<JsonRpcResponse> {
  if (response.error || !response.result) {
    return response;
  }

  switch (method) {
    case MCP_METHODS.TOOLS_LIST:
      return filterToolsList(engine, user, response);
    case MCP_METHODS.RESOURCES_LIST:
      return filterResourcesList(engine, user, response);
    case MCP_METHODS.PROMPTS_LIST:
      return filterPromptsList(engine, user, response);
    default:
      return response;
  }
}

/**
 * Filter tools/list response — remove tools the user cannot execute.
 */
async function filterToolsList(
  engine: PolicyEngine,
  user: UserContext,
  response: JsonRpcResponse
): Promise<JsonRpcResponse> {
  const enforcer = engine.getEnforcer();

  const result = response.result as { tools?: Array<{ name: string; [k: string]: unknown }> };
  if (!result?.tools) return response;

  const filteredTools: typeof result.tools = [];

  for (const tool of result.tools) {
    const resource = `tool:${tool.name}`;
    let allowed = false;

    // Check each role
    for (const role of user.roles) {
      if (await enforcer.enforce(role, resource, "execute")) {
        allowed = true;
        break;
      }
    }

    // Also check wildcard
    if (!allowed) {
      for (const role of user.roles) {
        if (await enforcer.enforce(role, "tool:*", "execute")) {
          allowed = true;
          break;
        }
      }
    }

    // Also check by user ID directly
    if (!allowed) {
      allowed = await enforcer.enforce(user.sub, resource, "execute");
    }

    if (allowed) {
      filteredTools.push(tool);
    }
  }

  const removed = result.tools.length - filteredTools.length;
  if (removed > 0) {
    log.debug(
      { user: user.sub, total: result.tools.length, removed },
      "Filtered tools list"
    );
  }

  return {
    ...response,
    result: { ...result, tools: filteredTools },
  };
}

/**
 * Filter resources/list response.
 */
async function filterResourcesList(
  engine: PolicyEngine,
  user: UserContext,
  response: JsonRpcResponse
): Promise<JsonRpcResponse> {
  const enforcer = engine.getEnforcer();

  const result = response.result as {
    resources?: Array<{ uri: string; [k: string]: unknown }>;
  };
  if (!result?.resources) return response;

  const filteredResources: typeof result.resources = [];

  for (const resource of result.resources) {
    const resourceId = `resource:${resource.uri}`;
    let allowed = false;

    for (const role of user.roles) {
      if (
        (await enforcer.enforce(role, resourceId, "read")) ||
        (await enforcer.enforce(role, "resource:*", "read"))
      ) {
        allowed = true;
        break;
      }
    }

    if (allowed) filteredResources.push(resource);
  }

  return {
    ...response,
    result: { ...result, resources: filteredResources },
  };
}

/**
 * Filter prompts/list response.
 */
async function filterPromptsList(
  engine: PolicyEngine,
  user: UserContext,
  response: JsonRpcResponse
): Promise<JsonRpcResponse> {
  const enforcer = engine.getEnforcer();

  const result = response.result as {
    prompts?: Array<{ name: string; [k: string]: unknown }>;
  };
  if (!result?.prompts) return response;

  const filteredPrompts: typeof result.prompts = [];

  for (const prompt of result.prompts) {
    const promptId = `prompt:${prompt.name}`;
    let allowed = false;

    for (const role of user.roles) {
      if (
        (await enforcer.enforce(role, promptId, "execute")) ||
        (await enforcer.enforce(role, "prompt:*", "execute"))
      ) {
        allowed = true;
        break;
      }
    }

    if (allowed) filteredPrompts.push(prompt);
  }

  return {
    ...response,
    result: { ...result, prompts: filteredPrompts },
  };
}
