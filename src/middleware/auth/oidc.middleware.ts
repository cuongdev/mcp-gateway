// ============================================================
// OIDC middleware — REPLACED in P2 task-2.
//
// The unified authentication pipeline now lives in `src/middleware/index.ts`:
//
//   sessionCookieMiddleware  → reads { pid } cookie issued by /auth/callback
//   bearerTokenMiddleware    → validates mcp_xxx_live_* tokens (PAT, SAT, MCT)
//   dev-anonymous (dev mode) → optional fallback
//
// All three populate `c.var.principal` to the same `Principal` shape.
// ============================================================

export {};
