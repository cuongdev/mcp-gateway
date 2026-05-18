# MCP Gateway — Architecture

## Overview

Inspired by [MCPJungle](https://github.com/mcpjungle/MCPJungle), MCP Gateway is a TypeScript middleware proxy that provides centralized management, OIDC authentication, flexible access control, and observability for multiple upstream MCP servers.

## High-Level Architecture

```
                          ┌─────────────────────────────────────┐
                          │         MCP GATEWAY              │
                          │                                       │
Developers ──HTTP──▸      │  ┌─────────────────────────────┐    │
                          │  │  HTTP API  (/api/*)          │    │
                          │  │  - Server registration        │    │
                          │  │  - Tool mgmt & groups         │    │
                          │  │  - Policy / role mgmt         │    │
                          │  │  - Health & Prometheus metrics │    │
                          │  └─────────────────────────────┘    │
                          │                                       │
                          │  ┌─────────────────────────────┐    │   ┌─────────┐
AI Agents  ──MCP───▸      │  │  Gateway MCP Server          │────┼──▸│ MCP     │
(Claude, Cursor,          │  │  POST /mcp       (all tools) │    │   │ Server  │
 VS Code)                 │  │  POST /mcp/groups/:name      │    │   │   A     │
                          │  │                               │    │   └─────────┘
                          │  │  ┌───────────────────────┐   │    │
                          │  │  │ Auth (OIDC)           │   │    │   ┌─────────┐
                          │  │  │ Authz (Casbin)        │   │────┼──▸│ MCP     │
                          │  │  │ Audit Logging         │   │    │   │ Server  │
                          │  │  └───────────────────────┘   │    │   │   B     │
                          │  └─────────────────────────────┘    │   └─────────┘
                          │                                       │
                          │  ┌─────────────────────────────┐    │   ┌─────────┐
                          │  │  Core Services               │────┼──▸│ STDIO   │
                          │  │  - Tool Registry              │    │   │ Server  │
                          │  │  - Tool Group Manager         │    │   │   C     │
                          │  │  - Session Manager            │    │   └─────────┘
                          │  └─────────────────────────────┘    │
                          └─────────────────────────────────────┘
```

## Key Concepts

### Canonical Tool Naming
Every tool is exposed as `server-name__tool-name`:
```
filesystem__read_file
filesystem__write_file
database__query_data
```
This ensures globally unique identifiers even when multiple servers have tools with the same name.

### Tool Groups
Curated subsets of tools with dedicated MCP endpoints:
```
POST /mcp                    → all tools from all servers
POST /mcp/groups/data-analyst → only: database__query_data, database__get_report
POST /mcp/groups/devops       → only: filesystem__*, k8s__*
```
Solves context window pollution — agents only see relevant tools.

### Dual Mode
- **Development**: No auth, full access, console logging. For local dev.
- **Enterprise**: OIDC required, Casbin policies enforced, file-based audit logs, Prometheus metrics always on.

### Session Manager
Abstracts transport differences:
- **Streamable HTTP**: `fetch()` with bearer token + MCP session ID tracking
- **STDIO**: Persistent child process with JSON-RPC over stdin/stdout, idle timeout for stateful mode
- **SSE**: EventSource connection (planned)

## Directory Structure

```
src/
├── index.ts                         # Entry point
├── gateway.ts                       # Main application (wires everything)
├── config/
│   ├── schema.ts                    # Zod validation schemas
│   └── index.ts                     # Config loader (file + env vars)
├── routes/
│   ├── mcp.routes.ts                # MCP JSON-RPC endpoints (for AI agents)
│   └── admin.routes.ts              # REST API endpoints (for developers)
├── registry/
│   ├── tool.registry.ts             # Central tool registry + canonical naming
│   └── tool.groups.ts               # Tool group management
├── session/
│   └── session.manager.ts           # Transport abstraction (HTTP, STDIO)
├── middleware/
│   ├── index.ts                     # Pipeline builder
│   ├── types.ts                     # Middleware types
│   ├── auth/
│   │   ├── oidc.middleware.ts       # OIDC token validation (jose)
│   │   └── user-context.ts          # User context helpers
│   ├── authz/
│   │   ├── policy.engine.ts         # Casbin policy engine
│   │   ├── tool.authorizer.ts       # Fine-grained tool access control
│   │   └── response.filter.ts       # Filter responses by permissions
│   ├── audit/
│   │   ├── audit.middleware.ts      # Request/response audit logging
│   │   └── audit.logger.ts          # JSONL file writer with rotation
│   └── monitoring/
│       ├── metrics.middleware.ts     # Prometheus metrics
│       └── health.ts                # Health check
├── types/
│   ├── errors.ts                    # Custom error hierarchy
│   ├── gateway.ts                   # Core types (UserContext, AuditEntry, etc.)
│   └── mcp.ts                       # MCP protocol types + helpers
└── utils/
    └── logger.ts                    # Pino structured logging

config/
├── gateway.config.json              # Dev mode config
├── gateway.enterprise.json          # Enterprise mode config
├── policy.model.conf                # Casbin RBAC model
└── policy.csv                       # Casbin policy rules
```

## Request Flow

### MCP Client → Gateway → Upstream Server

```
1. AI Agent sends POST /mcp
   { "jsonrpc": "2.0", "id": 1, "method": "tools/call",
     "params": { "name": "database__query_data", "arguments": {...} } }

2. Middleware Pipeline:
   a. CORS check
   b. Generate request ID
   c. OIDC token validation → extract user context
   d. Casbin policy check → is user.role allowed to execute database__query_data?
   e. Audit log start

3. MCP Route Handler:
   a. Parse canonical name: "database__query_data"
      → server: "database", tool: "query_data"
   b. Rewrite request with original tool name
   c. Forward via SessionManager.send("database", {...})

4. Session Manager:
   a. Look up session for "database" (HTTP transport)
   b. POST to http://localhost:8002/mcp with bearer token
   c. Return JSON-RPC response

5. Response flows back through audit middleware (log result)

6. Client receives response
```

### Tool Group Flow

```
1. AI Agent sends POST /mcp/groups/data-analyst
   { "method": "tools/list" }

2. Route handler:
   a. Look up group "data-analyst"
   b. Check user has allowed role (analyst or admin)
   c. Return only tools in the group:
      [ "database__query_data", "database__get_report" ]

3. When agent calls a tool:
   a. Verify tool is in the group
   b. Resolve canonical name → upstream server
   c. Forward as normal
```

## Modes Comparison

| Feature             | Development          | Enterprise             |
|---------------------|----------------------|------------------------|
| Authentication      | Disabled             | OIDC (required)        |
| Authorization       | Allow all            | Casbin (deny default)  |
| Audit               | Console only         | File (JSONL) + console |
| Metrics             | Optional             | Always on              |
| Admin API auth      | None                 | OIDC protected         |
| Config              | gateway.config.json  | gateway.enterprise.json|
