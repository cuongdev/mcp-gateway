# Contributing to MCP Gateway

Thanks for your interest in contributing! 🎉

## Getting Started

```bash
git clone https://github.com/cuongdev/mcp-gateway.git
cd mcp-gateway
npm install
npm ci --prefix web        # web dashboard deps
cp .env.example .env
npm run dev                # backend (port 3000)
npm run dev:web            # dashboard (port 5173)
```

Requires **Node.js >= 20**.

## Development Workflow

1. **Fork** the repo and create a feature branch off `main`.
2. Make your change with tests.
3. Run the checks below — they must pass (CI runs the same).
4. Open a Pull Request describing **what** changed and **why**.

### Checks

```bash
npm run typecheck          # tsc --noEmit
npm run test:unit          # unit tests (no Docker needed)
npm run test:integration   # integration tests (needs Docker for Postgres)
npm run build              # full build incl. web dashboard
```

## Commit Convention

This project uses **[Conventional Commits](https://www.conventionalcommits.org/)**:

```
<type>(<scope>): <subject>
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Subject: imperative mood, lowercase, no trailing period, ≤ 72 chars.
- Breaking changes: add `!` after the type/scope or a `BREAKING CHANGE:` footer.

Example: `feat(catalog): add Cloudflare R2 connector template`

## Project Layout

| Path | What |
|------|------|
| `src/` | Gateway backend (Hono, Casbin, session manager, registries) |
| `web/` | React + Vite admin dashboard |
| `config/` | Example dev / enterprise configs + Casbin policy |
| `docs/guides/` | Feature guides |
| `tests/` | `unit/` + `integration/` (Vitest) |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

## Guidelines

- Match the style and conventions of the surrounding code.
- Add or update tests for behavioral changes (unit tests should not require Docker).
- Update the relevant guide in `docs/guides/` when you change a documented feature.
- Keep PRs focused; smaller is easier to review.
- Never commit secrets — use environment variables (see [SECURITY.md](SECURITY.md)).

## Reporting Bugs & Requesting Features

Use the GitHub issue templates. For **security vulnerabilities**, do **not** open a public issue — follow [SECURITY.md](SECURITY.md).

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
