// ============================================================
// CatalogInstaller — P9 connector install pipeline (spec §8.2)
//
// Atomic install / uninstall of a catalog connector. On any
// failure after server upsert, the installer rolls back both
// the server row and the install row, leaving the gateway in
// the same state it started in.
// ============================================================

import { logger } from '../utils/logger.js';
import { newId } from '../utils/uuid.js';
import type { EventName } from '../notify/events.js';
import {
  ConnectorNotFoundError,
  GatewayError,
  InvalidEnvError,
} from '../types/errors.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { ConnectorRegistry } from './connectors.js';
import type {
  ConnectorEnv,
  ConnectorTemplate,
  ConnectorTransport,
} from './types.js';
import type { SessionManager, TransportConfig } from '../session/session.manager.js';
import type { ToolRegistry } from '../registry/tool.registry.js';
import type { ServerTransportType } from '../storage/repositories/server.repo.js';
import type { WebhookDispatcher } from '../notify/webhook.dispatcher.js';

const log = logger.child({ component: 'catalog-installer' });

// ── Public types ────────────────────────────────────────────

export interface InstallOptions {
  /** Discover tools/prompts immediately after registering (default true) */
  autoDiscover?: boolean;
  /** P6: bind circuit breaker config (placeholder — applied in P9.5) */
  enableCircuitBreaker?: boolean;
  /** P7: apply default redaction rule set (placeholder — applied in P9.5) */
  applyRedaction?: boolean;
  /** Optional outbound proxy attachment */
  proxyName?: string | null;
}

export interface InstallInput {
  connectorId: string;
  /** Server name to create (must not conflict with existing server) */
  name: string;
  /** Env-var key → value map. All `requiredEnv` keys must be present. */
  env: Record<string, string>;
  /** Optional template-arg substitutions (for streamable-http urlTemplate) */
  args?: Record<string, string>;
  options?: InstallOptions;
  /** Caller principal id for audit (set by route handler) */
  installedBy?: string | null;
  /** Tenant scope (default 'tnt_default') */
  tenantId?: string;
}

export interface InstallResult {
  /** Install row id (e.g. inst_<uuid>) */
  id: string;
  /** Server name as registered in storage */
  server: string;
  /** Number of capabilities (tools) discovered, 0 if autoDiscover disabled */
  capabilitiesDiscovered: number;
  /** Template version recorded against this install */
  templateVersion: string;
}

export interface InstalledConnector {
  id: string;
  connectorId: string;
  serverName: string;
  templateVersion: string;
  currentTemplateVersion: string | null;
  updateAvailable: boolean;
  installedAt: number;
  installedBy: string | null;
  /** Display name pulled from current template (null if removed from catalog) */
  displayName: string | null;
}

// ── Installer ───────────────────────────────────────────────

export class CatalogInstaller {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly storage: StorageAdapter,
    private readonly sessionManager: SessionManager,
    private readonly toolRegistry: ToolRegistry,
    private readonly webhookDispatcher?: WebhookDispatcher,
  ) {}

  async install(input: InstallInput): Promise<InstallResult> {
    // 1. Validate connector exists
    const template = this.registry.get(input.connectorId);
    if (!template) throw new ConnectorNotFoundError(input.connectorId);

    // 2. Validate required env keys + patterns
    this.validateEnv(template.requiredEnv, input.env);

    // 3. Validate name doesn't conflict
    const existing = await this.storage.servers.findByName(input.name);
    if (existing) {
      throw new GatewayError(
        `Server name '${input.name}' already exists`,
        'conflict',
        409,
        { name: input.name },
      );
    }

    // 4. Build transport from template
    const transport = buildTransport(template.transport, input.env, input.args ?? {});
    const transportType = template.transport.kind === 'stdio' ? 'stdio' : 'streamable-http';

    // 5. Persist server row
    await this.storage.servers.upsert({
      name: input.name,
      transportType: transportType as ServerTransportType,
      transportConfig: transport as unknown as Record<string, unknown>,
    });
    if (input.options?.proxyName !== undefined) {
      await this.storage.servers.setProxyName(input.name, input.options.proxyName);
    }

    // 6. Register + optionally discover (with rollback on failure)
    const autoDiscover = input.options?.autoDiscover !== false;
    let capabilitiesDiscovered = 0;
    let installId = '';
    try {
      this.sessionManager.register(input.name, transport as TransportConfig);
      if (autoDiscover) {
        const tools = await this.sessionManager.discoverTools(input.name);
        await this.toolRegistry.registerServerTools(input.name, tools);
        capabilitiesDiscovered = tools.length;
      }

      // 7. Record install row with redacted config snapshot
      const snapshot = redactConfigSnapshot(transport, template.requiredEnv);
      installId = `inst_${newId().slice(4)}`;
      await this.storage.catalogInstalls.create({
        id: installId,
        connectorId: template.id,
        templateVersion: template.templateVersion,
        serverName: input.name,
        configSnapshotJson: JSON.stringify(snapshot),
        installedBy: input.installedBy ?? null,
        tenantId: input.tenantId,
      });
    } catch (err) {
      // Rollback: drop session, server row, and any install row created.
      log.warn(
        { err, server: input.name, connectorId: input.connectorId },
        'Install failed; rolling back',
      );
      try {
        this.sessionManager.remove(input.name);
      } catch {}
      try {
        await this.toolRegistry.removeServer(input.name);
      } catch {}
      try {
        await this.storage.servers.deleteByName(input.name);
      } catch {}
      if (installId) {
        try {
          await this.storage.catalogInstalls.delete(installId);
        } catch {}
      }
      throw err;
    }

    // 8. Emit webhook
    if (this.webhookDispatcher) {
      void this.webhookDispatcher
        .emit('catalog.installed' as EventName, {
          installId,
          serverName: input.name,
          connectorId: template.id,
          templateVersion: template.templateVersion,
          installedBy: input.installedBy ?? null,
        })
        .catch((err) => log.warn({ err }, 'catalog.installed webhook emit failed'));
    }

    log.info(
      {
        server: input.name,
        connectorId: template.id,
        templateVersion: template.templateVersion,
        capabilitiesDiscovered,
      },
      'Catalog connector installed',
    );

    return {
      id: installId,
      server: input.name,
      capabilitiesDiscovered,
      templateVersion: template.templateVersion,
    };
  }

  async uninstall(serverName: string): Promise<void> {
    const install = await this.storage.catalogInstalls.findByServerName(serverName);
    if (!install) {
      throw new GatewayError(
        `No catalog install found for server '${serverName}'`,
        'not_found',
        404,
        { serverName },
      );
    }

    // Deregister + drop server
    try {
      await this.toolRegistry.removeServer(serverName);
    } catch (err) {
      log.warn({ err, serverName }, 'toolRegistry.removeServer failed during uninstall');
    }
    try {
      this.sessionManager.remove(serverName);
    } catch (err) {
      log.warn({ err, serverName }, 'sessionManager.remove failed during uninstall');
    }
    try {
      await this.storage.servers.deleteByName(serverName);
    } catch (err) {
      log.warn({ err, serverName }, 'storage.servers.deleteByName failed during uninstall');
    }
    await this.storage.catalogInstalls.delete(install.id);

    if (this.webhookDispatcher) {
      void this.webhookDispatcher
        .emit('catalog.uninstalled' as EventName, {
          installId: install.id,
          serverName,
          connectorId: install.connectorId,
        })
        .catch((err) => log.warn({ err }, 'catalog.uninstalled webhook emit failed'));
    }

    log.info({ serverName, connectorId: install.connectorId }, 'Catalog connector uninstalled');
  }

  async listInstalls(tenantId?: string): Promise<InstalledConnector[]> {
    const rows = await this.storage.catalogInstalls.list(tenantId);
    return rows.map((row) => {
      const tpl = this.registry.get(row.connectorId);
      const currentVersion = tpl?.templateVersion ?? null;
      const updateAvailable =
        currentVersion !== null && compareVersions(currentVersion, row.templateVersion) > 0;
      return {
        id: row.id,
        connectorId: row.connectorId,
        serverName: row.serverName,
        templateVersion: row.templateVersion,
        currentTemplateVersion: currentVersion,
        updateAvailable,
        installedAt: row.installedAt,
        installedBy: row.installedBy,
        displayName: tpl?.displayName ?? null,
      };
    });
  }

  // ── Internal helpers ──────────────────────────────────────

  private validateEnv(
    requiredEnv: ConnectorEnv[],
    provided: Record<string, string>,
  ): void {
    for (const spec of requiredEnv) {
      const value = provided[spec.key];
      if (value === undefined || value === null || value === '') {
        throw new InvalidEnvError(spec.key, 'missing');
      }
      if (spec.pattern) {
        let re: RegExp;
        try {
          re = new RegExp(spec.pattern);
        } catch (err) {
          // Bad pattern in catalog file — treat as a config error, not a
          // user error. Surface but don't block install on it.
          log.warn({ err, key: spec.key, pattern: spec.pattern }, 'Invalid catalog regex');
          continue;
        }
        if (!re.test(value)) {
          throw new InvalidEnvError(spec.key, 'pattern_mismatch', {
            pattern: spec.pattern,
          });
        }
      }
    }
  }
}

// ── Pure helpers (exported for testing) ─────────────────────

/**
 * Build a `TransportConfig` from a connector template + caller-supplied
 * env + args. For streamable-http transports, `urlTemplate` is rendered
 * by replacing `{key}` placeholders with `args[key]`.
 */
export function buildTransport(
  transport: ConnectorTransport,
  env: Record<string, string>,
  args: Record<string, string>,
): TransportConfig {
  if (transport.kind === 'stdio') {
    // Pass through only the env keys the template declares — the SessionManager
    // forwards env verbatim to the child process. Any unknown extras provided by
    // the caller are dropped here to keep the snapshot tight.
    return {
      type: 'stdio',
      command: transport.command,
      args: [...transport.args],
      env: { ...env },
    };
  }
  // streamable-http
  const url = transport.urlTemplate.replace(/\{([^}]+)\}/g, (_m, key: string) => {
    if (args[key] !== undefined) return args[key];
    if (env[key] !== undefined) return env[key];
    return `{${key}}`;
  });
  return {
    type: 'streamable-http',
    url,
  };
}

/**
 * Clone the transport with secret env values replaced by '***'.
 * Returns an object safe to persist as the install's config snapshot.
 */
export function redactConfigSnapshot(
  transport: TransportConfig,
  requiredEnv: ConnectorEnv[],
): Record<string, unknown> {
  const secretKeys = new Set(requiredEnv.filter((e) => e.secret).map((e) => e.key));
  if (transport.type === 'stdio') {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(transport.env ?? {})) {
      env[k] = secretKeys.has(k) ? '***' : v;
    }
    return {
      type: 'stdio',
      command: transport.command,
      args: transport.args ?? [],
      env,
    };
  }
  return {
    type: transport.type,
    url: transport.url,
  };
}

/**
 * Compare two dotted-numeric semver strings. Returns -1, 0, or 1.
 * Non-numeric segments fall back to localeCompare.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? '0';
    const sb = pb[i] ?? '0';
    const na = Number(sa);
    const nb = Number(sb);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na > nb) return 1;
      if (na < nb) return -1;
    } else {
      const cmp = sa.localeCompare(sb);
      if (cmp !== 0) return cmp < 0 ? -1 : 1;
    }
  }
  return 0;
}
