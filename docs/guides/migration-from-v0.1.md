# Migrating from v0.1.0 to v0.2.0 (P0 Foundation)

## What changed

- All runtime state (servers, tools, groups, policies, audit) now lives in **SQLite** (default `./data/mcp.sqlite`) instead of in-memory.
- A `Principal` identity model unifies User, ServiceAccount, and MCPClient.
- Outside `development` mode, all `/api/*` and `/mcp` requests require `Authorization: Bearer <token>`.
- A new `mcp-gateway` CLI ships with the package; from the repo root, run via `npm run cli -- <command>` or build and `npm install -g .`.

## Upgrade steps

```bash
# 1. Backup existing state (if you mounted volumes)
cp -r ./data ./data.backup 2>/dev/null || true
cp -r ./logs ./logs.backup 2>/dev/null || true

# 2. Pull v0.2.0, install
git pull
npm install

# 3. Initialize the database and bootstrap the admin
npm run cli -- migrate up
npm run cli -- init-server
#   → prints the admin token ONCE. Save it.

# 4. Seed from your existing config + policy.csv
npm run cli -- migrate seed \
  --from ./config/gateway.config.json \
  --policy ./config/policy.csv

# 5. Restart the gateway
npm start

# 6. Verify
TOKEN="mcp_sat_live_..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/servers
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/groups
```

## Config schema additions

New top-level keys in `gateway.config.json`:

```jsonc
{
  "storage": {
    "driver": "sqlite",                       // P0 supports sqlite only
    "path": "./data/mcp.sqlite",              // SQLite file path
    "url": null,                              // Reserved for P1 Postgres
    "authToken": null                         // Reserved for Turso remote
  },
  "auth": {
    "bearerTokenHeader": "Authorization",
    "requireAuthForApi": true,                // auto-set false in development mode
    "requireAuthForMcp": true                 // auto-set false in development mode
  },
  "audit": {
    "enabled": true,
    "fileExport": false,                      // NEW: write JSONL alongside DB
    "fileExportPath": "./logs/audit.jsonl"
  }
}
```

Existing keys (`mode`, `gateway`, `oidcProviders`, `session`, `authorization`, `servers`, `groups`, `monitoring`) are unchanged.

## CLI reference (P0 subset)

| Command | Purpose |
|---|---|
| `mcp-gateway migrate up [--db <path>]` | Apply pending migrations |
| `mcp-gateway migrate status [--db <path>]` | Show applied / pending versions |
| `mcp-gateway migrate down [--steps N]` | Not supported in P0 (exits 2) |
| `mcp-gateway migrate seed --from <config.json> [--policy <csv>] [--force]` | One-time seed from files |
| `mcp-gateway init-server [--db <path>] [--env live\|test\|dev]` | Bootstrap admin and print token once |

Default `--db`: `$MCP_DB_PATH` or `./data/mcp.sqlite`.

## What if I don't want auth (dev workflow)?

Set `mode: development` in config or `GATEWAY_MODE=development`. Auth is skipped; an anonymous `dev` principal is injected. `requireAuthForApi/Mcp` auto-default to `false` when `mode === "development"`.

## Rollback

1. Stop the gateway.
2. Restore `./data.backup` over `./data`.
3. Check out the v0.1.0 commit (`e73e055`) and rebuild.

## Known regressions (deferred to P1)

These admin endpoints now return **501 Not Implemented**:
- `PUT /api/groups/:name`
- `POST /api/groups/:name/tools`
- `DELETE /api/groups/:name/tools/:tool`

Workaround: delete the group and recreate it with the new tool list (`DELETE /api/groups/:name` then `POST /api/groups`).

Also: `GET /api/servers` currently lists only servers whose tools have been discovered. Registered-but-unreachable servers are persisted but invisible to this endpoint until their tools are discovered. They still appear via `npm run cli -- migrate seed` round-trips and can be re-discovered via `POST /api/servers/:name/sync`. Full fix lands in P1.

## FAQ

- **Q: Can I re-import config.json after first seed?**
  A: `mcp-gateway migrate seed --force --from ...` overwrites existing servers/groups/policies.
- **Q: Where are audit logs?**
  A: In the `audit_logs` table. Set `audit.fileExport: true` to also write JSONL to `./logs/audit.jsonl` (no rotation — use external `logrotate` for long-term retention).
- **Q: Can I use Postgres?**
  A: Not in P0. The Postgres adapter ships in P1 alongside MCPJungle parity features.
- **Q: How do I rotate the admin token?**
  A: Not in P0. The `token rotate` command ships in P1. For now, manually update the `tokens` row via SQLite client (rotate `hash` + `prefix` after regenerating the token offline).
- **Q: My old `policy.csv` had role hierarchies — do those still work?**
  A: Yes. The `migrate seed --policy` command parses both `p` (permission) and `g` (group/role) rules.

## P1 (v0.3.0-p1) additions

- New admin endpoints: `/api/mcp-clients`, `/api/users`, `/api/users/me/tokens`, `/api/prompts`, `/api/usage`
- New CLI commands: `register`, `deregister`, `list`, `enable`, `disable`, `invoke`, `create-mcp-client`, `create-user`, `create-group`, `role assign`, `token list/create/revoke`, `config export/import`, `policy export/import`, `usage`
- Group enhancements: `included_servers` and `excluded_tools` fields
- HTTP transport: `session_mode: stateless | stateful`, custom `headers`, env substitution `${VAR}`
- Postgres adapter via `STORAGE_DRIVER=postgres DATABASE_URL=postgres://...`
- Docker variant: `Dockerfile.stdio` with Node + uv + npx; `docker-compose.prod.yml` with Postgres
- OIDC callback unification with session cookies is partially shipped (cookie middleware + signing helper); full OIDC-callback rewiring deferred — see TODO in `src/middleware/auth/oidc.middleware.ts`.

## P2 (v0.4.0-p2) additions

- **OIDC ↔ Principal unified** — OAuth2 callbacks now upsert a User principal and issue a `{ pid }` session cookie read by the P1 `sessionCookieMiddleware`. `createAuthMiddleware`/`resolveUser` retired.
- **Rate limiting** — per-Principal × per-tool sliding window. Memory (single-instance) or Redis (multi-instance) backend. `429 + Retry-After + X-RateLimit-*` on overflow.
- **Quota** — daily + monthly counters per Principal with overrides and midnight-UTC reset.
- **Tool-call caching** — opt-in per tool via `mcp-gateway tool flag <name> --cacheable --ttl 60`. Memory/SQL/Redis backends. `X-MCP-Cache: hit|miss` header. Auto-invalidates on tool disable.
- **OpenTelemetry** — OTLP exporter + `mcp.tools.call` and `gateway.session.send` spans + `traceparent` forwarding. Off by default; set `tracing.enabled=true`.
- **New metrics** — `mcp_rate_limit_hits_total`, `mcp_quota_exceeded_total`, `mcp_cache_hits_total/misses_total`, `mcp_tool_call_duration_seconds`, `mcp_upstream_latency_seconds`.
- **Breaking:** `auth.sessionCookieSecret` (≥32 chars) is now REQUIRED when any `oidcProviders` are configured.
- **New env vars:** `REDIS_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACES_SAMPLER_ARG`.

## P3 (v0.5.0-p3) additions

- **Approval workflow** — mark a tool `sensitive` → gate middleware returns `202 approval_required` with `approval_id`; admin approves via `/api/approvals/:id/approve` or `mcp-gateway approval approve <id>`; caller reissues with `X-MCP-Approval-Id` header for execution.
- **Webhook outbound dispatcher** — register webhooks via `/api/webhooks` or `mcp-gateway webhook add`; auto-emits `approval.requested/approved/rejected`; HMAC-SHA256 signature in `X-MCP-Signature` header; exponential-backoff retry up to 5 attempts.
- **OpenAPI 3.x → MCP adapter** — register an upstream via `mcp-gateway register --openapi <urlOrPath> --name X`; gateway auto-discovers operations as tools and routes `tools/call` through the adapter. SSRF guard blocks private IPs by default.
- **HMAC-signed approval link tokens** — `signApprovalToken/verifyApprovalToken` for embedding in chat-link approval flows (token signing exposed; UI/chat integration deferred).
- **New CLI:** `mcp-gateway approval list/approve/reject`, `mcp-gateway webhook add/list/delete`, `mcp-gateway register --openapi`.
- **New env:** `approval.tokenSecret` required when `approval.enabled` (≥32 chars).
- **Deferred (backlog):** dashboard approvals view, Slack-blocks formatter, email notifier, long-poll header, two-person approval.
