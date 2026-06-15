# MCP Gateway — Wiki

A complete, illustrated guide to installing, configuring, and operating the
MCP Gateway and its admin dashboard.

**Choose your language / Chọn ngôn ngữ:**

| 🇬🇧 English | 🇻🇳 Tiếng Việt |
|---|---|
| [**Open the English guide →**](./en/README.md) | [**Mở hướng dẫn tiếng Việt →**](./vi/README.md) |

---

![MCP Gateway dashboard](./images/overview.png)

MCP Gateway is a proxy and control-plane for **Model Context Protocol (MCP)**
servers. It sits between MCP clients (AI agents) and your upstream MCP servers,
adding identity, authorization, reliability, security, and observability — all
managed from a single admin dashboard.

> Screenshots in this wiki are captured from the live dashboard. To regenerate
> them, run `npx playwright test -c web/playwright.shots.config.ts`.
