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
