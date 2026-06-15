# Getting Started with MCP Gateway

MCP Gateway is an open-source proxy and control-plane for [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers. It sits between your MCP clients (AI agents, IDE extensions, custom apps) and one or more upstream MCP servers, adding authentication, authorization, rate limiting, redaction, and a full admin dashboard — without changing a line of code in your clients or servers.

---

## Prerequisites

- **Node.js >= 20.0.0** (check with `node --version`)
- **npm** (bundled with Node.js)
- Git (to clone the repository)

---

## 1. Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/cuongdev/mcp-gateway.git
cd mcp-gateway
npm install
```

---

## 2. Build

Compile the TypeScript source and bundle the React dashboard:

```bash
npm run build
```

This runs three steps in sequence:

| Step | What it does |
|---|---|
| `tsc` | Compiles `src/` to `dist/` |
| `build:assets` | Copies SQL migrations and catalog JSON into `dist/` |
| `build:web` | Builds the Vite dashboard and places it at `dist/dashboard/` |

---

## 3. Configure

MCP Gateway is configured through a JSON file. Copy the development template to get started:

```bash
cp config/gateway.config.json config/my-gateway.json
```

The default `config/gateway.config.json` shows a minimal development setup:

```json
{
  "mode": "development",
  "gateway": {
    "port": 3000,
    "host": "0.0.0.0",
    "mcpPath": "/mcp",
    "apiPath": "/api",
    "corsOrigins": ["*"],
    "requestTimeout": 30000
  },
  "servers": [
    {
      "name": "filesystem",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
      }
    }
  ],
  "authorization": {
    "enabled": false
  },
  "audit": {
    "enabled": true,
    "storage": "console"
  }
}
```

### Development vs Enterprise mode

The `"mode"` field controls the security posture of the gateway:

| | `development` | `enterprise` |
|---|---|---|
| OIDC authentication | Optional (disabled if no providers configured) | Required (warns on startup if missing) |
| Casbin authorization | Optional | Always enforced |
| Session cookies | Standard | Forced `Secure` flag |
| Audit logging | Configurable | Always enabled |
| Prometheus metrics | Configurable | Always enabled |
| Dashboard login | "Enter as Admin (Dev Mode)" button available | OIDC login only |

For enterprise, see `config/gateway.enterprise.json` for a full reference. At minimum you need:

```json
{
  "mode": "enterprise",
  "oidcProviders": [
    {
      "id": "my-provider",
      "discoveryUrl": "https://your-provider.com/.well-known/openid-configuration",
      "clientId": "mcp-gateway",
      "clientSecret": "..."
    }
  ],
  "authorization": {
    "enabled": true,
    "modelFile": "./config/policy.model.conf",
    "policyFile": "./config/policy.csv",
    "defaultDecision": "deny"
  }
}
```

### Useful environment variables

All environment variables override the corresponding config-file key at startup. The most common ones:

| Variable | Config key | Description |
|---|---|---|
| `GATEWAY_MODE` | `mode` | `development` or `enterprise` |
| `GATEWAY_PORT` | `gateway.port` | HTTP listen port (default `3000`) |
| `GATEWAY_HOST` | `gateway.host` | Bind address (default `0.0.0.0`) |
| `GATEWAY_CONFIG` | — | Path to the config file |
| `GATEWAY_SESSION_SECRET` | `session.secret` | Secret for signed session cookies |
| `STORAGE_DRIVER` | `storage.driver` | `sqlite` (default) or `postgres` |
| `STORAGE_PATH` | `storage.path` | Path to the SQLite file |
| `DATABASE_URL` | `storage.url` | PostgreSQL connection string |
| `OIDC_DISCOVERY_URL` | `oidcProviders[0].discoveryUrl` | OIDC well-known URL |
| `OIDC_CLIENT_ID` | `oidcProviders[0].clientId` | OIDC client ID |
| `OIDC_CLIENT_SECRET` | `oidcProviders[0].clientSecret` | OIDC client secret |
| `AUTHZ_MODEL_FILE` | `authorization.modelFile` | Path to Casbin model file |
| `AUTHZ_POLICY_FILE` | `authorization.policyFile` | Path to Casbin policy CSV |
| `AUDIT_ENABLED` | `audit.enabled` | `true` / `false` |

---

## 4. Run

```bash
npm start
```

This executes `node dist/index.js`. Pass a custom config path as a positional argument or via `GATEWAY_CONFIG`:

```bash
# Positional argument
node dist/index.js ./config/my-gateway.json

# Environment variable
GATEWAY_CONFIG=./config/my-gateway.json npm start

# Enterprise mode with OIDC via env vars
GATEWAY_MODE=enterprise \
  OIDC_DISCOVERY_URL=https://your-provider/.well-known/openid-configuration \
  OIDC_CLIENT_ID=mcp-gateway \
  GATEWAY_SESSION_SECRET="$(openssl rand -hex 32)" \
  npm start
```

For local development (with hot-reload), use:

```bash
npm run dev          # gateway with tsx watch
npm run dev:web      # Vite dev server for the dashboard (separate terminal)
```

---

## 5. Access the dashboard

Open your browser at `http://localhost:3000/dashboard`.

![MCP Gateway dashboard](../images/overview.png)

In **development mode**, the dashboard shows an "Enter as Admin (Dev Mode)" button — click it to log in without credentials. This is intentional for local development and is never available in `enterprise` mode.

In **enterprise mode**, the login page redirects you through your configured OIDC provider. After authentication, the dashboard presents the full admin UI: server management, tool browsing, group configuration, identity and policy management, audit logs, metrics, and more.

---

## Next steps

- [Architecture](./architecture.md) — understand how the gateway works internally
- [Servers & Tools](./servers-and-tools.md) — register upstream MCP servers and manage tools
- [Identity](./identity.md) — configure OIDC providers, PATs, and session options
- [Policies](./identity.md#policies) — write Casbin RBAC/ABAC rules for fine-grained access control

---

## See also

- [Architecture](./architecture.md)
- [Servers & Tools](./servers-and-tools.md)
- [Identity](./identity.md)
- [Policies](./identity.md#policies)
