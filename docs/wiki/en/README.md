# MCP Gateway Guide (English)

> 🇻🇳 Cần tiếng Việt? [Đọc bản tiếng Việt](../vi/README.md)

Welcome to the MCP Gateway wiki. MCP Gateway is a proxy and control-plane for
**Model Context Protocol (MCP)** servers: it fronts your upstream MCP servers
and adds identity, authorization, reliability, security, and observability,
all driven from the admin dashboard served at `/dashboard`.

![MCP Gateway dashboard](../images/overview.png)

## Start here

1. **[Getting Started](./getting-started.md)** — install, configure, build, and run the gateway; open the dashboard.
2. **[Architecture & Concepts](./architecture.md)** — how the proxy works, the request flow, and the core building blocks.

## Feature guides

The dashboard groups features into the sections below. Each guide walks through
every screen with screenshots and step-by-step instructions.

| Section | Screens covered |
|---|---|
| **[Servers & Tools](./servers-and-tools.md)** | Catalog · Servers · Tools · Tool Groups · Resources · Virtual Tools · Prompts · Proxies |
| **[Identity](./identity.md)** | Users · MCP Clients · My Tokens · OIDC Providers · Policies |
| **[Reliability](./reliability.md)** | Circuits · Rate Limit · Quota · Cache · Approvals |
| **[Security](./security.md)** | Redaction |
| **[Observability](./observability.md)** | Usage · Audit · Sampling Log · Metrics · Health |
| **[System](./system.md)** | Tenants · Webhooks · Settings |

## Quick reference

- **Run it:** `npm install && npm run build && npm start`, then open `http://localhost:3100/dashboard`.
- **Modes:** `development` (open, dev-login button) vs `enterprise` (OIDC + strict auth) — see [Getting Started](./getting-started.md).
- **Configuration:** `config/gateway.config.json` plus environment overrides — see [Getting Started](./getting-started.md).

---

_Screenshots are captured from the live dashboard via `web/playwright.shots.config.ts`._
