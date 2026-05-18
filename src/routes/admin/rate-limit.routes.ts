import { Hono } from 'hono';
import type { GatewayConfig } from '../../config/schema.js';

export interface RateLimitRoutesDeps {
  config: GatewayConfig;
}

export function createRateLimitRoutes(deps: RateLimitRoutesDeps) {
  const app = new Hono();
  app.get('/status', (c) => {
    return c.json({
      enabled: deps.config.rateLimit.enabled,
      backend: deps.config.rateLimit.backend,
      default: deps.config.rateLimit.default,
      rules: deps.config.rateLimit.rules,
    });
  });
  return app;
}
