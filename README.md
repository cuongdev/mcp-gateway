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

## What's New in v0.8.0 — Pipeline Platform

Five user-visible features built on a unified foundation, shipped as one release:

### Foundation (internal)
- **Capability layer** — unified `CapabilityRegistry` façade over Tool / Prompt / Resource / Root registries.
- **Server state machine** — per-server health tracking with `healthy → degraded → circuit_open → half_open → healthy` transitions, persisted to `server_state` table.
- **Probe loop** — background heartbeat that probes degraded servers via `tools/list` and recovers them automatically.
- **Connector template registry** — 42 seeded MCP-server templates shipped in `data/catalog/connectors.json`.

### P6 — Circuit Breaker
- `SessionManager.send()` consults the state machine before every upstream call, rejecting with `circuit_open` when tripped.
- New `mcp_circuit_state`, `mcp_circuit_trips_total`, `mcp_circuit_rejections_total` Prometheus metrics; `server.state.changed` webhook event.
- `/api/circuits` admin routes (GET list, trip/close/reset, PATCH config); `mcp-gateway circuit` CLI; `/circuits` dashboard with sparkline + manual controls.

### P7 — PII / Secret Redaction
- 22+ built-in regex rules (AWS, GitHub, GitLab, Anthropic, OpenAI, Stripe, JWT, PEM keys, SSH keys, email, phone, SSN, credit-card Luhn-checked, db URLs with creds, etc.).
- `RedactionEngine` runs on `tools/call` request `arguments` and response `content`; modes: `redact | block | warn`.
- Custom per-tenant rules; built-in rules can have their mode changed but not their pattern.
- `safe-regex` validator on every rule; ReDoS-prone patterns are rejected with a warning.
- Findings recorded WITHOUT the matched text (only rule_id + count + offset).
- `/api/redaction` admin routes; `mcp-gateway redaction` CLI; `/redaction` dashboard with Rules + Findings + Test playground tabs.

### P8 — Full MCP Spec Coverage
- `resources/list`, `resources/read`, `resources/templates/list`, `resources/subscribe`, `resources/unsubscribe`.
- `completion/complete`, `logging/setLevel` (broadcasts to all upstreams).
- `roots/list` returns gateway-managed admin view (reverse-channel deferred to v0.9).
- `/api/resources` admin routes; `/resources` browser with mime-aware viewer (text via pre, image via `<img>`, binary download).

### P9 — Connector Catalog
- 42 seed templates across developer-tools / databases / productivity / cloud / ai-ml / communications / local.
- `CatalogInstaller` atomically installs a server with env validation, auto-discovery, and rollback on failure.
- `catalog_installs` table tracks template version → compares to current `connectors.json` for `update_available` flag.
- `/api/catalog/{connectors,install,installs}` admin routes; `mcp-gateway catalog list/show/install/uninstall` CLI; `/catalog` dashboard with Browse + Installed tabs + 3-step install wizard (configure → preview → result).

### P10 — Tool Composition / Virtual Tools
- Declarative DAG plan format with strict AJV validation: ≤50 steps, ≤16 KB JSON, whitelist template grammar (`{{input.X}}`, `{{steps.id.path}}`, `{{env.KEY}}`).
- `VirtualToolExecutor` runs steps sequentially or in parallel groups; `fail_fast` or `best_effort` error policy.
- Each step routes through the full pipeline so circuit breaker + redaction apply uniformly.
- Virtual tools appear in `tools/list` with `_virtual: true` marker.
- `/api/virtual-tools` admin routes (CRUD + validate + test); `mcp-gateway virtual-tool` CLI; `/virtual-tools` dashboard with list + JSON plan editor + dry-run test panel.

### Storage
- Two new migrations: `0008_p6_foundation` (server_state, resources, resource_templates, roots) + `0009_p6_features` (redaction_rules, redaction_findings, sampling_log, catalog_installs, virtual_tools).
- Backwards-compatible — no existing column changes, no API breakage.

### Frontend
- 6 new pages: `/circuits`, `/redaction`, `/catalog`, `/resources`, `/virtual-tools`, `/virtual-tools/:name`.
- Sidebar reorganised: "Servers & Tools" group (Catalog, Servers, Tools, Virtual Tools, Resources, Prompts, Proxies) + new "Security" group (Redaction).
- 6 Playwright smokes added.

### Limitations
- Reverse channel (`sampling/createMessage`, `roots/list` fanout to client) deferred. Gateway logs sampling requests but does not yet route them back to MCP clients.
- Virtual tool editor is JSON-based; visual react-flow editor deferred to v0.9.
- Catalog `enableCircuitBreaker` / `applyRedaction` options accepted but currently no-ops (defaults are global).
- Update detection on catalog installs is read-only; `POST /api/catalog/installs/:id/update` returns 501.

## What's New in v0.7.0-p5

- **Outbound proxy management** — register named HTTP/HTTPS (and best-effort SOCKS5) proxies via `/api/proxies` or `mcp-gateway proxy add`. Routes upstream MCP and OpenAPI calls through them via `undici.ProxyAgent` dispatchers cached in a `ProxyRegistry`.
- **Three-level precedence** — server-level `proxyName` overrides group-level (when call comes via `/mcp/groups/:name`), which overrides `proxy.defaultName` global default. Direct connection when none set.
- **Password redaction** — proxy URLs with inline credentials (`http://user:pass@host`) are redacted to `http://user:***@host` in all GET responses; internal usage retains plaintext for actual proxy auth.
- **Block-by-default deletion** — `DELETE /api/proxies/:id` returns 409 with a `references` list when the proxy is in use; `?force=true` cascades nullify and returns a `detached` list.
- **Fail-closed** — proxy unreachable → caller fails with the underlying error (no silent fallback to direct connection).
- **New CLI:** `mcp-gateway proxy add/list/show/update/delete/attach/detach`.
- **Tracing:** `proxy.name` + `proxy.scheme` attributes on existing `gateway.session.send` spans.
- **Metrics:** `mcp_proxy_requests_total{proxy, result}` counter.
- **Limitations:** OpenAPI servers receive their dispatcher at registration time; PATCHing `proxyName` later does NOT refresh the cached adapter (re-register the server to pick up new proxies). SOCKS5 routing is best-effort via a `socks-proxy-agent` shim; HTTP/HTTPS proxies are the primary supported path.

## What's New in v0.6.0-p4

- **Multi-tenant foundation** — `tenants` table with `tnt_default` row auto-created at migration. Existing single-tenant data backfills automatically.
- **Tenant resolution middleware** — pass `X-Tenant: <slug>` header to scope requests. Unknown slug → 404, suspended → 402.
- **System admin API** — `POST/GET /api/system/tenants`, `PATCH /:id`, `POST /:id/suspend`, `POST /:id/resume`.
- **CLI** — `mcp-gateway tenant create <slug> [--plan pro]`, `tenant list`, `tenant suspend <id>`, `tenant resume <id>`.
- **`tenant_id` columns** added to `principals`, `servers`, `tools`, `audit_logs`, `usage_counters` (backfilled to `tnt_default`).
- **No subdomain routing** in v1 — use a reverse proxy that maps `acme.gateway.example.com` to header `X-Tenant: acme`.
- **Deferred (backlog):** Postgres row-level security, Casbin domain-RBAC migration, per-plan quota tiers, tenant-scoped OIDC providers, tenant memberships (cross-tenant principal), repo-layer tenant guard enforcement, data export tooling, billing hooks.
- **Build stability:** all existing repo methods continue to work without modification because every new `tenant_id` column has `DEFAULT 'tnt_default'`. Multi-tenant deployments should add repo-layer scoping in a follow-up before production use.

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
