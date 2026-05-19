// ============================================================
// Bootstrap config-declared servers + groups into storage.
//
// Called by Gateway.start() after storage migrations and registry
// load() so a static deployment with a `gateway.enterprise.json`
// declaring `servers` and `groups` automatically brings up the
// declared topology — no CLI register calls required.
//
// Contract:
//   - Idempotent: re-running converges to the same state.
//   - Additive: never deletes runtime-registered entries that are
//     absent from config (operator's API/CLI work is preserved).
//   - Last-write-wins for config-declared entries: transport,
//     autoDiscover, group tools/includedServers/excludedTools are
//     overwritten from config.
//   - Skips OpenAPI transport entries: they require async spec
//     loading + adapter wiring. Use the admin API/CLI to register
//     OpenAPI servers at runtime for now.
// ============================================================

import type { StorageAdapter } from './adapter.js';
import type { GatewayConfig } from '../config/schema.js';

export interface BootstrapLogger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
}

export interface BootstrapResult {
  serversApplied: number;
  serversSkipped: number;
  groupsApplied: number;
}

export async function bootstrapFromConfig(
  storage: StorageAdapter,
  config: Pick<GatewayConfig, 'servers' | 'groups'>,
  log: BootstrapLogger,
): Promise<BootstrapResult> {
  let serversApplied = 0;
  let serversSkipped = 0;
  let groupsApplied = 0;

  for (const sv of config.servers ?? []) {
    if (sv.transport.type === 'openapi') {
      log.warn(
        'Skipping config-declared openapi server (use admin API/CLI to register openapi servers at runtime)',
        { server: sv.name },
      );
      serversSkipped++;
      continue;
    }
    // Strip the discriminator before persisting; `transportType` is a separate column.
    const { type, ...transportConfig } = sv.transport;
    await storage.servers.upsert({
      name: sv.name,
      transportType: type,
      transportConfig: transportConfig as Record<string, unknown>,
      autoDiscover: sv.autoDiscover ?? true,
    });
    serversApplied++;
  }

  // Pre-fetch existing tool / server names so we can filter group members.
  // Declared tools may not yet exist (discovery happens AFTER upstream
  // connect); FK constraints on group_tools / group_included_servers would
  // otherwise fail the boot. We skip unknowns and log a warning so the
  // operator can see why a declared name didn't take effect.
  const knownTools = new Set((await storage.tools.list()).map((t) => t.canonicalName));
  const knownServers = new Set((await storage.servers.list()).map((s) => s.name));

  for (const gr of config.groups ?? []) {
    const declaredTools = gr.tools ?? [];
    const tools = declaredTools.filter((t) => knownTools.has(t));
    const missingTools = declaredTools.filter((t) => !knownTools.has(t));
    if (missingTools.length > 0) {
      log.warn(
        'Skipping unknown tools in config group (tool not yet discovered; will retry on next bootstrap after discovery)',
        { group: gr.name, missing: missingTools },
      );
    }

    const declaredIncluded = gr.includedServers ?? [];
    const includedServers = declaredIncluded.filter((s) => knownServers.has(s));
    const missingServers = declaredIncluded.filter((s) => !knownServers.has(s));
    if (missingServers.length > 0) {
      log.warn(
        'Skipping unknown servers in config group includedServers',
        { group: gr.name, missing: missingServers },
      );
    }

    // excludedTools is a denylist; `group_excluded_tools.canonical_name`
    // intentionally has no FK (per P0 T21 — denylist entries may reference
    // tools that don't exist yet, and that's fine — the filter at MCP serve
    // time is name-based).
    const excludedTools = gr.excludedTools ?? [];

    const existing = await storage.groups.findByName(gr.name);
    if (!existing) {
      await storage.groups.create({
        name: gr.name,
        description: gr.description ?? '',
        allowedRoles: gr.allowedRoles ?? [],
        tools,
      });
    } else {
      // Existing group: replace tools (last-write-wins for declared entries).
      await storage.groups.setTools(gr.name, tools);
    }
    // Always (re)apply included-servers and excluded-tools sets so config is
    // the source of truth for these fields when the group appears in config.
    await storage.groups.setIncludedServers(gr.name, includedServers);
    await storage.groups.setExcludedTools(gr.name, excludedTools);
    groupsApplied++;
  }

  log.info('Bootstrap from config complete', {
    serversApplied,
    serversSkipped,
    groupsApplied,
  });
  return { serversApplied, serversSkipped, groupsApplied };
}
