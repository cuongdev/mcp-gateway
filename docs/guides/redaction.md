# PII / Secret Redaction (P7)

The gateway scrubs sensitive data from MCP traffic before it reaches upstream servers (request scan) and before responses reach clients (response scan). 22+ built-in regex rules cover common secrets and PII; admins can add per-tenant custom rules.

## Modes

Each rule has a `mode`:
| Mode | Behaviour |
|---|---|
| `redact` | Replace each match with `[REDACTED:{rule}]`; record finding |
| `block` | Reject the entire call with `400 redaction_block`; record finding |
| `warn` | Pass through unchanged; record finding only (audit-only signal) |

## Built-in rules

API keys: AWS access/secret, GitHub PAT, GitLab PAT, Anthropic, OpenAI, Google API, Stripe (live blocks, test warns), Slack bot, npm token. Credentials: JWT bearer, PEM private keys, SSH OpenSSH keys, db URLs with creds, dotenv values. PII: email, US phone, international E.164, US SSN, credit card (Luhn-validated), private IPv4 ranges.

Admins can change the **mode** of a built-in rule per-tenant (or disable it) but cannot edit its pattern. Custom rules are full CRUD.

## Safety guard

Every regex (built-in + custom) is validated through `safe-regex` on compile. Patterns prone to catastrophic backtracking (ReDoS) are rejected and logged. Per-string scanning is bounded — strings ≥ 1 MB are skipped.

## Findings

Findings are recorded in `redaction_findings` with rule_id, request_id, scope (request|response), mode, count, and timestamp — **never the matched text**. Audit logs and findings reviewers cannot reconstruct the leaked content.

## Admin surface

```bash
GET    /api/redaction/rules                # list (built-in + custom)
POST   /api/redaction/rules                # create custom
PATCH  /api/redaction/rules/:id            # update (mode-only on built-in)
DELETE /api/redaction/rules/:id            # delete (custom only)
POST   /api/redaction/test                 # { text, ruleIds?, scope }
GET    /api/redaction/findings             # filterable
GET    /api/redaction/stats                # aggregates

mcp-gateway redaction rule list [--built-in] [--custom]
mcp-gateway redaction rule add -c <config.json>
mcp-gateway redaction rule update <id> --mode redact|block|warn --enabled true|false
mcp-gateway redaction rule delete <id>
mcp-gateway redaction test --text "..." [--rule-id X]
mcp-gateway redaction findings [--since 1h]
```

## Dashboard

`/redaction` page with three tabs:
- **Rules** — built-in + custom sections, toggle mode/enabled per row
- **Findings** — filterable table with 24h stat cards (top rule, top server)
- **Test playground** — paste arbitrary text, choose scope, see findings + redacted output

## Integration with MCP flow

In `mcp.routes.ts`:
1. `tools/call` arrives → `RedactionEngine.scan(arguments, 'request')`.
2. On `redact` matches: args mutated → upstream sees redacted version.
3. On `block` match: call rejected with JSON-RPC error code `-32000`.
4. On `warn` match: pass-through.
5. Response comes back → scan `result.content` blocks the same way.
6. Findings persisted (no leaked text).

## Reverse-channel redaction (v0.10)

Reverse-channel calls — an upstream-initiated `sampling/createMessage` fanned
back to the originating client over SSE — carry prompts/messages one way and
the client's model output the other. Both legs are scrubbed with the same rule
set when enabled:

```yaml
gateway:
  reverseChannelRedaction: false   # default: true (secure-by-default)
```

- **Request leg** (`scope: 'request'`): the upstream's reverse request is scanned before it reaches the client.
- **Response leg** (`scope: 'response'`): the client's response is scanned before it reaches the upstream.
- A `block`-mode match on either leg refuses the reverse call with JSON-RPC error `-32000`; findings are persisted with `capabilityKind: 'sampling'`.
- On by default (secure-by-default); harmless when no rules are configured — the scan is a no-op. Set `false` to disable.

