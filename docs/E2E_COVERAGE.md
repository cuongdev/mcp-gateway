# E2E Test Coverage (Dashboard)

Playwright end-to-end coverage for the admin dashboard (`web/`). The suite
runs the real gateway (`npm start` against a fresh sqlite) plus a mock MCP
upstream, and drives the built dashboard in a headless browser.

**Status:** 56 spec files · 171 tests · **169 passed / 0 failed** (2 skipped-by-design noted below).

## Running

```bash
cd web
npm run test:e2e          # full suite; emits HTML + JUnit reports
npx playwright show-report  # open the browsable HTML report
```

Reports (also uploaded as CI artifacts by `.github/workflows/ci.yml`):
- `web/playwright-report/` — browsable HTML report
- `web/test-results/junit.xml` — JUnit XML for CI ingestion
- traces + screenshots retained on failure

## Coverage model

Every screen has a **render smoke** test (`*.smoke.spec.ts`, 28 files). On top of
that, feature areas have **deep** specs:

- `*.crud.spec.ts` (10) — create / edit / delete via UI sheets + seed-then-render
- `*.data.spec.ts` (16) — populated-state behaviour seeded via the admin API
- `auth.spec.ts`, `nav.spec.ts` — auth shell + every sidebar link routes

The shared harness lives in `web/tests/e2e/support/`:
- `auth.ts` — `loginAsAdmin` (dev-mode entry)
- `api.ts` — admin API seed client with LIFO auto-cleanup for every entity
- `fixtures.ts` — `test` fixture exposing the `api` seeder
- `mock-mcp.mjs` — mock MCP upstream (`/fs` `/db` `/gh` tool sets)

## Per-screen coverage

| Area | Screen | Smoke | Deep coverage |
|---|---|:---:|---|
| Servers & Tools | Catalog | ✅ | browse list, search/category filter, install wizard (configure step) |
| | Servers | ✅ | register via mock upstream, row renders |
| | Tools | ✅ | discovered tools render from upstream |
| | Tool Groups | ✅ | seed + UI create, detail tabs, tool badges |
| | Resources | ✅ | structure + empty state (see limitations) |
| | Virtual Tools | ✅ | seed + list, editor validate/save, navigate to editor |
| | Prompts | ✅ | structure + empty state (see limitations) |
| | Proxies | ✅ | seed + UI create, detail sheet, delete |
| Identity | Users | ✅ | seed + UI create, row → detail |
| | MCP Clients | ✅ | seed, UI create (token reveal), detail, rotate token |
| | My Tokens | ✅ | structure only (see limitations) |
| | OIDC Providers | ✅ | structure only (see limitations) |
| | Policies | ✅ | seed + UI add rule, remove, role bindings |
| Reliability | Circuits | ✅ | trip/close/reset, detail sheet, filters, inline actions |
| | Rate Limit | ✅ | status values + rules card |
| | Quota | ✅ | daily/monthly cards with real numbers |
| | Cache | ✅ | invalidate action + toast |
| | Approvals | ✅ | structure + empty state (see limitations) |
| Security | Redaction | ✅ | seed + UI create rule, 3 tabs, playground scan |
| Observability | Usage | ✅ | stat cards, range/groupBy controls |
| | Audit | ✅ | structure, filters (see limitations) |
| | Sampling Log | ✅ | structure + filters (see limitations) |
| | Metrics | ✅ | tracked cards + raw Prometheus exposition |
| | Health | ✅ | gateway card (version/uptime), upstream card |
| System | Tenants | ✅ | seed + UI create, detail, suspend/resume |
| | Webhooks | ✅ | seed + UI create, delete, HMAC indicator |
| | Settings | ✅ | runtime + config sections from `/api/system/info` |
| (Home) | Overview | ✅ | stat cards, command palette navigation |

## Production bugs found & fixed

The coverage work surfaced three real dashboard bugs (now fixed):

1. **Circuits page crash** — `CircuitCard` read `circuit.rolling.length`, but the
   list endpoint omits `rolling`; any existing circuit crashed the whole page.
2. **Virtual Tools list always empty** — the hook typed the response as `{ tools }`
   while the API returns `{ virtualTools }`, so the list never rendered.
3. **Redaction "create rule" sheet never closed** — the success handler read
   `data.rule.name` but the API returns the row directly; the throw aborted the
   close.

## Known limitations (dev-mode constraints)

These can't be exercised end-to-end in the test environment; specs assert
structure / empty state and are documented in-file:

- **OIDC Providers** — configured from files at startup; no runtime create API.
- **Approvals / Sampling Log** — produced only by live MCP client traffic; can't
  be seeded via the admin API.
- **My Tokens (PAT CRUD)** — the dev principal is a `service_account`; the API
  rejects PAT management for non-user principals.
- **Prompts / Resources** — the mock upstream serves tools only; extend
  `mock-mcp.mjs` with `prompts/list` / `resources/list` to cover populated state.
- **Audit / Health populated data** — API-seeded server registration isn't
  surfaced as retrievable audit events, and the health `servers` array is
  populated by a periodic health-check cycle.
- **Tenants** — there is no DELETE route, so tenant test data persists; specs use
  unique names so they remain deterministic across runs.
