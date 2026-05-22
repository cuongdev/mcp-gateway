# Full MCP Spec Coverage (P8)

v0.8 extends the gateway from a tools-only proxy to broad MCP spec coverage. The gateway now handles MCP resources, prompts, completion, logging, and roots in addition to tools.

## Methods supported

| JSON-RPC method | Direction | Status |
|---|---|---|
| `initialize` | client → gateway | ✅ |
| `ping` | client → gateway | ✅ |
| `tools/list` | client → gateway | ✅ (existing + virtual tools merged) |
| `tools/call` | client → gateway → upstream | ✅ (with redaction + circuit) |
| `prompts/list` | client → gateway | ✅ |
| `prompts/get` | client → gateway → upstream | ✅ |
| `resources/list` | client → gateway | ✅ (P8) |
| `resources/read` | client → gateway → upstream | ✅ (P8) — routes to owning server by URI |
| `resources/templates/list` | client → gateway | ✅ (P8) |
| `resources/subscribe` | client → gateway → upstream | ✅ (P8) — v1: records, no client fan-out |
| `resources/unsubscribe` | client → gateway → upstream | ✅ (P8) |
| `completion/complete` | client → gateway → upstream | ✅ (P8) — routes by `ref.type` |
| `logging/setLevel` | client → gateway → upstream (broadcast) | ✅ (P8) |
| `roots/list` | client → gateway | ✅ (P8) — gateway-managed empty view in v1 |
| `sampling/createMessage` | upstream → gateway → client (reverse) | ⛔ Deferred to v0.9 (reverse channel) |

## Resource discovery

When you register a server (or call `POST /api/servers/:name/sync`), the gateway issues `resources/list` and `resources/templates/list` against the upstream and persists results into `resources` + `resource_templates` tables via `ResourceRegistry`.

## Admin browser

`/resources` page groups discovered resources by server. Click a resource to read its content — the viewer picks a renderer by MIME type:
- `text/*`, `application/json` → preformatted code block
- `image/*` → inline `<img>` from base64 blob
- other binary → download button

Each resource has an `enabled` toggle and a `sensitive` flag (excludes from redaction).

## Routes

```
# Admin surface
GET    /api/resources                      # all discovered
GET    /api/resources/templates            # URI templates
GET    /api/resources/:canonical           # metadata
POST   /api/resources/:canonical/read      # admin proxied read
PUT    /api/resources/:canonical/enable
PUT    /api/resources/:canonical/disable
PATCH  /api/resources/:canonical           # { sensitive: bool }

# MCP JSON-RPC (on /mcp endpoint, not /api)
resources/list, resources/read, resources/templates/list
resources/subscribe, resources/unsubscribe
completion/complete, logging/setLevel, roots/list
```

## What's NOT in v0.8

- **Reverse channel**: an upstream initiating `sampling/createMessage` cannot yet be forwarded back to the MCP client that owns the conversation. The gateway logs sampling requests but returns `method_not_found` to upstreams. Reverse channel mux + SSE writers + session binding are the v0.9 unblocker.
- **Subscription notification re-publish**: `resources/subscribe` forwards to upstream, but the gateway doesn't yet relay change notifications back to the subscribing client.
