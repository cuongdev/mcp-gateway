# Virtual Tools (P10)

Virtual tools are meta-tools composed of multiple real upstream tool calls, executed as a declarative DAG with strict template substitution. A virtual tool appears in `tools/list` like any other tool; calling it triggers the executor, which runs each step through the full pipeline (auth, RBAC, circuit breaker, redaction, rate-limit, cache).

## Plan format

```json
{
  "name": "github__pr_full_context",
  "description": "Fetch PR + comments + diff in one call",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" },
      "pr": { "type": "integer" }
    },
    "required": ["owner", "repo", "pr"]
  },
  "steps": [
    {
      "id": "pr",
      "tool": "github__get_pr",
      "args": { "owner": "{{input.owner}}", "repo": "{{input.repo}}", "pr_number": "{{input.pr}}" }
    },
    {
      "id": "comments",
      "tool": "github__list_pr_comments",
      "args": { "owner": "{{input.owner}}", "repo": "{{input.repo}}", "pr_number": "{{input.pr}}" },
      "parallel": true
    },
    {
      "id": "diff",
      "tool": "github__pr_diff",
      "args": { "owner": "{{input.owner}}", "repo": "{{input.repo}}", "pr_number": "{{input.pr}}" },
      "parallel": true
    }
  ],
  "output": {
    "format": "merged",
    "shape": {
      "pr": "{{steps.pr}}",
      "comments": "{{steps.comments}}",
      "diff": "{{steps.diff}}"
    }
  },
  "errorPolicy": "fail_fast"
}
```

## Limits (AJV-enforced)

| Limit | Value |
|---|---|
| `steps` count | ≤ 50 |
| Plan JSON size | ≤ 16 KB |
| Template expression length | ≤ 256 chars |
| Step ID grammar | `^[a-z][a-z0-9_]*$` |
| Template grammar | `^\{\{[a-z0-9_.]+(?:\[[0-9]+\])?\}\}$` |

## Template grammar (whitelist only)

- `{{input.<path>}}` — references the virtual tool's input args
- `{{steps.<stepId>.<path>}}` — previous step's result
- `{{steps.<stepId>.result.<path>}}` — alias
- `{{env.<KEY>}}` — whitelisted env vars

`<path>` is restricted to dot-and-bracket notation: `a`, `a.b`, `a[0]`, `a[0].b`. No wildcards, slices, expressions, or function calls. The renderer is a ~80-line hand-written parser — JSONPath/jq are NOT used (security boundary).

Validator rejects any string template that:
- Contains operators (`;`, `'`, `"`, `(`, `)`)
- References `__proto__`, `constructor`, `prototype`
- Contains anything not matching the strict grammar

## Execution

1. Steps are grouped by adjacent `parallel: true` runs.
2. Each group runs sequentially; within group, `Promise.allSettled`.
3. `when: "steps.X.result.foo"` skips the step if the path resolves to falsy.
4. Each step renders its `args` via the template engine, then routes through `SessionManager.send()` (so circuit breaker + redaction apply).
5. `errorPolicy: "fail_fast"` (default) aborts on first error; `best_effort` continues and records errors per step.
6. `output.format`:
   - `merged` → return `{ key: rendered_template, ... }` object
   - `select` → return the single rendered value

## Tools list integration

`tools/list` includes virtual tools alongside real ones, each marked with `_virtual: true` (MCP-spec extension field). `tools/call` checks for a matching virtual tool first; if found, delegates to the executor. Virtual tools shadow native canonicals — admin-defined composites always win.

## Admin surface

```
GET    /api/virtual-tools                     # list
POST   /api/virtual-tools                     # create (body = full plan)
GET    /api/virtual-tools/:name               # get
PATCH  /api/virtual-tools/:name               # update plan
DELETE /api/virtual-tools/:name               # delete
POST   /api/virtual-tools/validate            # { plan } → { ok, errors? }
POST   /api/virtual-tools/:name/test          # { args } → { steps, output }

mcp-gateway virtual-tool list
mcp-gateway virtual-tool create -c <plan.json>
mcp-gateway virtual-tool show <name>
mcp-gateway virtual-tool update <name> -c <plan.json>
mcp-gateway virtual-tool delete <name>
mcp-gateway virtual-tool test <name> --args '{...}'
mcp-gateway virtual-tool validate -c <plan.json>
```

## Dashboard

`/virtual-tools` lists existing virtual tools with step count + error policy. The editor (`/virtual-tools/:name`) shows a JSON plan editor with a [Validate] button (server-side AJV) and a test drawer that runs the plan dry-run against sample input and shows per-step args/result/latency. The visual react-flow graph editor is queued for v0.9.

## Why not scripted plans?

We deliberately forbid arbitrary code in plans. Plans are pure data, AJV-validated, with a tight template grammar. This means:
- No eval-style RCE
- Plans are diff-able and stable
- Validation is fast (no execution required)
- The same plan can be sandbox-tested before deployment

v0.9 may introduce conditional branches and simple expressions if real-world needs justify it.
