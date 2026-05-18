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
import { logger } from "./utils/logger.js";

const log = logger.child({ component: "main" });

async function main() {
  log.info("MCP Gateway starting...");

  // Load configuration
  const configPath = process.argv[2] || process.env.GATEWAY_CONFIG;
  const config = loadConfig(configPath);

  // Create and start gateway
  const gateway = new Gateway(config);
  await gateway.start();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    log.info({ signal }, "Received shutdown signal");
    await gateway.stop();
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
export { ToolRegistry } from "./registry/tool.registry.js";
export { ToolGroupManager } from "./registry/tool.groups.js";
export { SessionManager } from "./session/session.manager.js";
export type { GatewayConfig } from "./config/schema.js";
