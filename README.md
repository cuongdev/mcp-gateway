# MCP Gateway

A self-hosted MCP Gateway that provides **centralized management**, **access control (OIDC + RBAC/ABAC/ReBAC)**, and **observability** for multiple MCP servers.

Inspired by [MCPJungle](https://github.com/mcpjungle/MCPJungle), built with TypeScript.

## Architecture

```
Developers ──HTTP──▸ ┌──────────────────────────┐
                     │   HTTP API (/api/*)       │──▸ Management
                     │   - Server registration   │    REST API
                     │   - Tool management        │
                     │   - Policy / role mgmt     │
                     │   - Metrics & health       │
                     │──────────────────────────│
AI Agents  ──MCP───▸ │   Gateway MCP Server      │──▸ Upstream
(Claude,             │   - POST /mcp             │    MCP Servers
 Cursor,             │   - POST /mcp/groups/:g   │
 VS Code)            └──────────────────────────┘
```

### Key Concepts

**Canonical Tool Naming** — Tools are exposed as `server-name__tool-name` to ensure global uniqueness across multiple servers.

**Tool Groups** — Curated subsets of tools with dedicated MCP endpoints. An AI agent connecting to `/mcp/groups/data-analyst` only sees data-related tools, reducing context window pollution.

**Dual Mode** — Development mode (no auth, full access) for local use, Enterprise mode (OIDC, strict ACL, audit) for production.

**Session Manager** — Abstracts transport differences. HTTP servers use fetch; STDIO servers use persistent child processes with idle timeouts.

## Quick Start

```bash
# Install dependencies
npm install

# Development mode (no auth)
npm run dev

# Enterprise mode
GATEWAY_MODE=enterprise \
OIDC_DISCOVERY_URL=https://... \
OIDC_CLIENT_ID=mcp-gateway \
OIDC_AUDIENCES=mcp-gateway \
npm run dev
```

## API Reference

### MCP Endpoints (for AI agents)

| Method   | Path                  | Description                       |
|----------|-----------------------|-----------------------------------|
| `POST`   | `/mcp`                | MCP JSON-RPC (all tools)          |
| `GET`    | `/mcp`                | SSE stream (server notifications) |
| `DELETE` | `/mcp`                | Close MCP session                 |
| `POST`   | `/mcp/groups/:name`   | Group-scoped MCP JSON-RPC         |

### Admin REST API (for developers)

| Method   | Path                          | Description                     |
|----------|-------------------------------|---------------------------------|
| `GET`    | `/api/health`                 | Gateway health check            |
| `GET`    | `/api/metrics`                | Prometheus metrics              |
| `GET`    | `/api/servers`                | List registered servers         |
| `POST`   | `/api/servers`                | Register a new MCP server       |
| `DELETE` | `/api/servers/:name`          | Deregister a server             |
| `POST`   | `/api/servers/:name/sync`     | Re-discover tools from server   |
| `GET`    | `/api/tools`                  | List all tools (canonical names)|
| `PUT`    | `/api/tools/:name/enable`     | Enable a tool                   |
| `PUT`    | `/api/tools/:name/disable`    | Disable a tool                  |
| `GET`    | `/api/groups`                 | List tool groups                |
| `POST`   | `/api/groups`                 | Create a tool group             |
| `GET`    | `/api/groups/:name`           | Get group details               |
| `PUT`    | `/api/groups/:name`           | Update a group                  |
| `DELETE` | `/api/groups/:name`           | Delete a group                  |
| `GET`    | `/api/policies`               | List Casbin policies            |
| `POST`   | `/api/policies`               | Add a policy rule               |
| `POST`   | `/api/policies/reload`        | Reload policies from file       |
| `POST`   | `/api/roles`                  | Assign role to user             |

## Configuration

### Server Registration

Register MCP servers via config file or API:

```json
{
  "servers": [
    {
      "name": "my-db",
      "transport": {
        "type": "streamable-http",
        "url": "http://localhost:8002/mcp",
        "bearerToken": "optional-token"
      },
      "autoDiscover": true
    },
    {
      "name": "local-tools",
      "transport": {
        "type": "stdio",
        "command": "node",
        "args": ["./my-mcp-server.js"],
        "stateful": true
      }
    }
  ]
}
```

Or via API:
```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-db",
    "transport": {
      "type": "streamable-http",
      "url": "http://localhost:8002/mcp"
    }
  }'
```

### Tool Groups

```json
{
  "groups": [
    {
      "name": "data-analyst",
      "description": "Read-only data tools",
      "tools": ["my-db__query_data", "my-db__get_report"],
      "allowedRoles": ["analyst", "admin"]
    }
  ]
}
```

AI agents connect to the group endpoint:
```
POST /mcp/groups/data-analyst
```

### Access Control (Casbin)

Edit `config/policy.csv`:
```csv
p, admin, *, *
p, analyst, tool:database__*, execute
p, user, tool:filesystem__read_file, execute

g, admin, analyst
g, analyst, user
g, alice@example.com, admin
```

## What's New in v0.5.0-p3

- **Approval workflow** — mark a tool `sensitive` → gate middleware returns `202 approval_required` with `approval_id`; admin approves via `/api/approvals/:id/approve` or `mcp-gateway approval approve <id>`; caller reissues with `X-MCP-Approval-Id` header for execution.
- **Webhook outbound dispatcher** — register webhooks via `/api/webhooks` or `mcp-gateway webhook add`; auto-emits `approval.requested/approved/rejected`; HMAC-SHA256 signature in `X-MCP-Signature` header; exponential-backoff retry up to 5 attempts.
- **OpenAPI 3.x → MCP adapter** — register an upstream via `mcp-gateway register --openapi <urlOrPath> --name X`; gateway auto-discovers operations as tools and routes `tools/call` through the adapter. SSRF guard blocks private IPs by default.
- **HMAC-signed approval link tokens** — `signApprovalToken/verifyApprovalToken` for embedding in chat-link approval flows (token signing exposed; UI/chat integration deferred).
- **New CLI:** `mcp-gateway approval list/approve/reject`, `mcp-gateway webhook add/list/delete`, `mcp-gateway register --openapi`.
- **New env:** `approval.tokenSecret` required when `approval.enabled` (≥32 chars).
- **Deferred (backlog):** dashboard approvals view, Slack-blocks formatter, email notifier, long-poll header, two-person approval.

## What's New in v0.4.0-p2

- **OIDC ↔ Principal unified** — OAuth2 callbacks now upsert a User principal and issue a `{ pid }` session cookie read by the P1 `sessionCookieMiddleware`. `createAuthMiddleware`/`resolveUser` retired.
- **Rate limiting** — per-Principal × per-tool sliding window. Memory (single-instance) or Redis (multi-instance) backend. `429 + Retry-After + X-RateLimit-*` on overflow.
- **Quota** — daily + monthly counters per Principal with overrides and midnight-UTC reset.
- **Tool-call caching** — opt-in per tool via `mcp-gateway tool flag <name> --cacheable --ttl 60`. Memory/SQL/Redis backends. `X-MCP-Cache: hit|miss` header. Auto-invalidates on tool disable.
- **OpenTelemetry** — OTLP exporter + `mcp.tools.call` and `gateway.session.send` spans + `traceparent` forwarding. Off by default; set `tracing.enabled=true`.
- **New metrics** — `mcp_rate_limit_hits_total`, `mcp_quota_exceeded_total`, `mcp_cache_hits_total/misses_total`, `mcp_tool_call_duration_seconds`, `mcp_upstream_latency_seconds`.
- **Breaking:** `auth.sessionCookieSecret` (≥32 chars) is now REQUIRED when any `oidcProviders` are configured.
- **New env vars:** `REDIS_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACES_SAMPLER_ARG`.

## What's New in v0.3.0-p1

- **MCP client provisioning** — `/api/mcp-clients` with allowlists and token rotation
- **User accounts + PATs** — `/api/users`, `/api/users/me/tokens`; group RBAC for MCP clients
- **Prompt registry** — `/api/prompts` for versioned, templated system prompts
- **Usage stats** — `/api/usage` endpoint (per-server, per-tool, per-principal)
- **Full mcp-gateway CLI** — `register`, `deregister`, `invoke`, `role assign`, `token`, `config`, `policy`, `usage`, and more
- **Postgres adapter** — `STORAGE_DRIVER=postgres DATABASE_URL=postgres://...`
- **HTTP session modes** — `session_mode: stateless | stateful`, custom headers, env var substitution `${VAR}`
- **Docker** — `Dockerfile.stdio` (Node + uv + npx) and `docker-compose.prod.yml` with Postgres

## Tech Stack

- **Hono** — HTTP framework
- **jose** — JWT/OIDC validation
- **Casbin** — Policy engine (RBAC/ABAC/ReBAC)
- **Pino** — Structured logging
- **prom-client** — Prometheus metrics
- **Zod** — Config validation

## License

MIT
