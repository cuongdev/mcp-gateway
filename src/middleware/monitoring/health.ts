// ============================================================
// Health Check Endpoint
// Returns gateway and upstream server health status
// ============================================================

export interface ServerHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  transport: string;
  lastChecked?: string;
}

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  timestamp: string;
  servers: ServerHealth[];
}

const startTime = Date.now();

/**
 * Perform a health check on the gateway.
 * Accepts an optional list of server health statuses from SessionManager.
 */
export function performHealthCheck(
  servers: ServerHealth[] = []
): HealthCheckResult {
  const unhealthyCount = servers.filter(
    (s: ServerHealth) => s.status === "unhealthy"
  ).length;
  const totalServers = servers.length;

  let status: "healthy" | "degraded" | "unhealthy";
  if (unhealthyCount === 0) {
    status = "healthy";
  } else if (unhealthyCount < totalServers) {
    status = "degraded";
  } else {
    status = "unhealthy";
  }

  return {
    status,
    version: process.env["npm_package_version"] ?? "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    servers,
  };
}
