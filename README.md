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
