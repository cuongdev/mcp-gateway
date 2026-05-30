# Security Policy

## Supported Versions

MCP Gateway is pre-1.0 and ships fixes on the latest `main` / most recent release.

| Version | Supported |
|---------|-----------|
| 0.8.x   | ✅        |
| < 0.8   | ❌        |

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

Report privately via GitHub's **[Security Advisories](https://github.com/cuongdev/mcp-gateway/security/advisories/new)** ("Report a vulnerability" on the repository **Security** tab). This keeps the report confidential until a fix is available.

Please include, where possible:

- A description of the vulnerability and its impact.
- Steps to reproduce (PoC, affected endpoint/config, version/commit).
- Any suggested remediation.

### What to expect

- **Acknowledgement** within 5 business days.
- A coordinated fix and disclosure timeline once the issue is confirmed.
- Credit in the release notes/advisory if you'd like it.

## Scope & Hardening Notes

MCP Gateway is security infrastructure, so a few deployment reminders:

- **Set `GATEWAY_SESSION_SECRET`** (≥ 32 chars) in production / enterprise mode — do not rely on the development fallback. Generate one with `openssl rand -hex 32`.
- **Run in `enterprise` mode** for any shared/production deployment: it enables OIDC authentication and Casbin authorization (deny-by-default). `development` mode disables auth entirely and is for local use only.
- **Never commit real secrets** to `config/*.json` or `.env`. Use environment variables; `.env` and local `.docker-*` directories are git-ignored.
- The built-in **redaction engine** scrubs known secret/PII patterns from tool traffic, but it is defense-in-depth, not a guarantee — keep upstream servers and credentials locked down.
- The OpenAPI adapter blocks **private/internal IPs (SSRF guard)** by default; only allow-list internal hosts you trust.
