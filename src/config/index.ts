// ============================================================
// Configuration Loader
// Loads from JSON file + environment variable overrides.
// Supports Dev / Enterprise mode presets.
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { GatewayConfigSchema, type GatewayConfig } from "./schema.js";
import { ConfigurationError } from "../types/errors.js";
import { substituteEnv } from "./env-substitution.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "config" });

/**
 * Load configuration from file and environment variables.
 * Priority: ENV vars > config file > mode defaults
 */
export function loadConfig(configPath?: string): GatewayConfig {
  let fileConfig: Record<string, unknown> = {};

  const resolvedPath = configPath
    ? resolve(configPath)
    : resolve("./config/gateway.config.json");

  if (existsSync(resolvedPath)) {
    try {
      const raw = readFileSync(resolvedPath, "utf-8");
      fileConfig = substituteEnv(JSON.parse(raw)) as Record<string, unknown>;
      log.info({ path: resolvedPath }, "Loaded configuration file");
    } catch (err) {
      throw new ConfigurationError(
        `Failed to parse config file: ${resolvedPath}`,
        { cause: String(err) }
      );
    }
  } else {
    log.warn({ path: resolvedPath }, "Config file not found, using defaults + env vars");
  }

  // Merge environment variables
  const merged = mergeEnvVars(fileConfig);

  // Validate with Zod
  const result = GatewayConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new ConfigurationError("Invalid configuration", {
      errors: result.error.flatten().fieldErrors,
    });
  }

  const config = result.data;

  // Apply mode-based defaults
  applyModeDefaults(config);

  log.info(
    {
      mode: config.mode,
      servers: config.servers.length,
      groups: config.groups.length,
      oidcProviders: config.oidcProviders.length,
      authz: config.authorization.enabled,
    },
    "Configuration loaded"
  );

  return config;
}

/**
 * Apply mode-based defaults and migrate legacy config.
 * - development: relaxed security, auto-allow
 * - enterprise: strict security, OIDC required (but no longer crashes without it)
 */
function applyModeDefaults(config: GatewayConfig): void {
  // ── Migrate legacy single `oidc` → oidcProviders[0] ──────
  if (config.oidc && config.oidcProviders.length === 0) {
    const legacyOidc = config.oidc;
    config.oidcProviders = [{
      id: "default",
      name: "Default",
      discoveryUrl: legacyOidc.discoveryUrl,
      clientId: legacyOidc.clientId,
      clientSecret: legacyOidc.clientSecret ?? "",
      scopes: legacyOidc.scopes,
      audiences: legacyOidc.audiences,
      rolesClaim: legacyOidc.rolesClaim,
      orgClaim: legacyOidc.orgClaim,
      roleMappings: {},
    }];
    log.info("Migrated legacy oidc config to oidcProviders[0]");
  }

  // ── Session secret ─────────────────────────────────────────
  if (!config.session.secret) {
    const envSecret = process.env["GATEWAY_SESSION_SECRET"];
    if (envSecret && envSecret.length >= 32) {
      config.session.secret = envSecret;
    } else if (config.mode === "enterprise") {
      // Ephemeral secret — warn loudly
      config.session.secret = randomBytes(32).toString("hex");
      log.warn(
        "GATEWAY_SESSION_SECRET not set — generated ephemeral session secret. " +
        "Sessions will be invalidated on restart. Set GATEWAY_SESSION_SECRET in production!"
      );
    } else {
      // Dev fixed secret
      config.session.secret = "mcp-gateway-dev-secret-32-chars!!";
    }
  }

  if (config.mode === "development") {
    const hasOIDC = config.oidcProviders.length > 0;
    if (!hasOIDC) {
      log.info("Development mode: OIDC authentication disabled");
      config.authorization.enabled = false;
      log.info("Development mode: Authorization disabled (no OIDC providers)");
    }
  }

  if (config.mode === "enterprise") {
    if (config.oidcProviders.length === 0) {
      // Warn but don't crash — gateway starts, OIDC can be added later via config reload
      log.warn(
        "Enterprise mode: No OIDC providers configured. " +
        "Add providers to oidcProviders[] in config. " +
        "All authenticated endpoints will return 401 until configured."
      );
    } else {
      log.info(
        { providers: config.oidcProviders.map((p) => p.id) },
        "Enterprise mode: OIDC providers loaded"
      );
    }
    // Force secure cookie in enterprise
    config.session.secure = true;
    // Force audit on
    config.audit.enabled = true;
    // Force metrics on
    config.monitoring.metricsEnabled = true;
    log.info("Enterprise mode: Secure session, audit, and metrics enforced");
  }
}

/**
 * Override config values with environment variables.
 */
function mergeEnvVars(config: Record<string, unknown>): Record<string, unknown> {
  const env = process.env;
  const merged = structuredClone(config);

  // Mode
  if (env["GATEWAY_MODE"]) set(merged, "mode", env["GATEWAY_MODE"]);

  // Gateway
  if (env["GATEWAY_PORT"]) set(merged, "gateway.port", parseInt(env["GATEWAY_PORT"]!));
  if (env["GATEWAY_HOST"]) set(merged, "gateway.host", env["GATEWAY_HOST"]);
  if (env["GATEWAY_PUBLIC_URL"]) set(merged, "gateway.publicUrl", env["GATEWAY_PUBLIC_URL"]);
  if (env["GATEWAY_MCP_PATH"]) set(merged, "gateway.mcpPath", env["GATEWAY_MCP_PATH"]);
  if (env["GATEWAY_API_PATH"]) set(merged, "gateway.apiPath", env["GATEWAY_API_PATH"]);

  // Session
  if (env["GATEWAY_SESSION_SECRET"]) set(merged, "session.secret", env["GATEWAY_SESSION_SECRET"]);

  // Legacy single OIDC via env vars → will be migrated to oidcProviders[0] by applyModeDefaults
  if (env["OIDC_DISCOVERY_URL"] || env["OIDC_CLIENT_ID"]) {
    if (!(merged as any).oidc) (merged as any).oidc = {};
    if (env["OIDC_DISCOVERY_URL"]) set(merged, "oidc.discoveryUrl", env["OIDC_DISCOVERY_URL"]);
    if (env["OIDC_CLIENT_ID"]) set(merged, "oidc.clientId", env["OIDC_CLIENT_ID"]);
    if (env["OIDC_CLIENT_SECRET"]) set(merged, "oidc.clientSecret", env["OIDC_CLIENT_SECRET"]);
    if (env["OIDC_AUDIENCES"]) set(merged, "oidc.audiences", env["OIDC_AUDIENCES"]!.split(","));
  }

  // Storage
  if (env["STORAGE_DRIVER"]) set(merged, "storage.driver", env["STORAGE_DRIVER"]);
  if (env["DATABASE_URL"]) set(merged, "storage.url", env["DATABASE_URL"]);
  if (env["STORAGE_PATH"]) set(merged, "storage.path", env["STORAGE_PATH"]);

  // Authorization
  if (env["AUTHZ_MODEL_FILE"]) set(merged, "authorization.modelFile", env["AUTHZ_MODEL_FILE"]);
  if (env["AUTHZ_POLICY_FILE"]) set(merged, "authorization.policyFile", env["AUTHZ_POLICY_FILE"]);

  // Audit
  if (env["AUDIT_ENABLED"]) set(merged, "audit.enabled", env["AUDIT_ENABLED"] === "true");
  if (env["AUDIT_LOG_PATH"]) set(merged, "audit.logPath", env["AUDIT_LOG_PATH"]);

  // Monitoring
  if (env["METRICS_ENABLED"]) set(merged, "monitoring.metricsEnabled", env["METRICS_ENABLED"] === "true");
  if (env["METRICS_PORT"]) set(merged, "monitoring.metricsPort", parseInt(env["METRICS_PORT"]!));

  return merged;
}

/** Set a nested property using dot notation */
function set(obj: Record<string, any>, path: string, value: unknown) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}
