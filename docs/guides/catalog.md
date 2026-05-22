# Connector Catalog (P9)

The catalog ships 42 ready-to-install MCP server templates so operators can wire a new upstream in three clicks instead of crafting a transport JSON by hand.

## Template format

`data/catalog/connectors.json` ships with the gateway (read once at boot). Each entry:

```json
{
  "id": "github",
  "displayName": "GitHub",
  "category": "developer-tools",
  "iconSlug": "github",
  "docsUrl": "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
  "templateVersion": "1.0.0",
  "transport": {
    "kind": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"]
  },
  "requiredEnv": [
    { "key": "GITHUB_PERSONAL_ACCESS_TOKEN", "description": "PAT with repo scope", "secret": true }
  ],
  "supports": { "tools": true, "resources": false, "prompts": false, "sampling": false, "roots": false }
}
```

Categories: `developer-tools` (8), `databases` (7), `productivity` (7), `cloud` (6), `ai-ml` (6), `communications` (4), `local` (4).

## Install pipeline

`CatalogInstaller.install({ connectorId, name, env, args?, options? })`:
1. Validate connector exists.
2. Validate every `requiredEnv` key present; if `pattern` set, regex-match the value.
3. Validate `name` not in use.
4. Build `transport` from template, merging env.
5. Upsert into `servers` table.
6. If `autoDiscover` (default), call `/servers/:name/sync` to populate tools.
7. Record `catalog_installs` row with `templateVersion` and redacted config snapshot.
8. Emit `catalog.installed` webhook.
9. Return `{ server, capabilitiesDiscovered, templateVersion }`.

Any failure after step 5 rolls back (deregister + delete install row).

## Update detection

On boot, the gateway compares each `catalog_installs.template_version` to the current `connectors.json` entry. Newer template → `update_available: true` surfaces in the UI. `POST /api/catalog/installs/:id/update` is reserved (returns 501 in v0.8 — manual uninstall + reinstall works).

## Admin surface

```
GET    /api/catalog/connectors             # list templates
GET    /api/catalog/connectors/:id         # single
POST   /api/catalog/install                # { connectorId, name, env, args, options }
GET    /api/catalog/installs               # installed (with updateAvailable)
DELETE /api/catalog/installs/:id           # uninstall

mcp-gateway catalog list [--category X]
mcp-gateway catalog show <connector-id>
mcp-gateway catalog install <id> --name X --env KEY=VAL...
mcp-gateway catalog installed
mcp-gateway catalog uninstall <server>
```

## Dashboard

`/catalog` page has two tabs:
- **Browse**: card grid with search + category filter; click [Install] on any card.
- **Installed**: table of cataloged servers with version + update-available badge + uninstall.

Install wizard is a 3-step side-sheet: configure (server name + secrets + options) → preview (resolved transport, env redacted) → result (capabilities discovered).

## Custom connectors

Operators can add private templates by mounting a JSON file at `data/catalog/custom.json` (override the default loader path). The schema is the same.
