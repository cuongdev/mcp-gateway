// ============================================================
// MCP Gateway — Entry Point
//
// Usage:
//   npm run dev                          — development mode
//   npm start                            — production
//   node dist/index.js ./my-config.json  — custom config
//
// Environment:
//   GATEWAY_MODE=development|enterprise
//   GATEWAY_PORT=3000
//   OIDC_DISCOVERY_URL=https://...
//   See .env.example for all options
// ============================================================

import { loadConfig } from "./config/index.js";
import { Gateway } from "./gateway.js";
import { createStorage } from "./storage/index.js";
import { logger } from "./utils/logger.js";

const log = logger.child({ component: "main" });

async function main() {
  log.info("MCP Gateway starting...");

  // Load configuration
  const configPath = process.argv[2] || process.env.GATEWAY_CONFIG;
  const config = loadConfig(configPath);

  // Initialize storage adapter before constructing the gateway so that
  // tool registry / group manager / policy engine / audit logger / bearer
  // auth all have a backing repo available at construction time.
  const storage = await createStorage({
    driver: config.storage.driver,
    path: config.storage.path,
    url: config.storage.url ?? undefined,
    authToken: config.storage.authToken ?? undefined,
  });

  // Create and start gateway
  const gateway = new Gateway(config, storage);
  await gateway.start();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    log.info({ signal }, "Received shutdown signal");
    await gateway.stop();
    await storage.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    log.error({ reason }, "Unhandled rejection");
  });
}

main().catch((err) => {
  log.fatal({ err }, "Failed to start gateway");
  process.exit(1);
});

// Public API exports
export { Gateway } from "./gateway.js";
export { loadConfig } from "./config/index.js";
export { createStorage } from "./storage/index.js";
export { ToolRegistry } from "./registry/tool.registry.js";
export { ToolGroupManager } from "./registry/tool.groups.js";
export { SessionManager } from "./session/session.manager.js";
export type { GatewayConfig } from "./config/schema.js";
