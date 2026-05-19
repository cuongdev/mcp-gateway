// ============================================================
// Auth Routes — OIDC Authorization Code Flow (P2 unified)
//
// Endpoints:
//   GET  /auth/providers           — list configured providers
//   GET  /auth/login/:id           — start OAuth2 + PKCE flow
//   GET  /auth/callback/:id        — handle OAuth2 callback
//   POST /auth/logout              — clear session cookie
//   GET  /auth/me                  — current user info (from `c.var.principal`)
//
// Flow (P2):
//   Browser → GET /auth/login/google
//           → redirect to Google with state + code_challenge
//           → Google → GET /auth/callback/google?code=…&state=…
//           → exchange code for tokens
//           → verify ID token
//           → upsert principal (storage.principals.upsertOidcUser)
//           → sign `{ pid: principalId }` cookie via signSessionCookie
//           → redirect to /dashboard
//
// The session cookie is consumed by sessionCookieMiddleware
// (src/middleware/auth/session-cookie.middleware.ts), which populates
// `c.var.principal` for downstream handlers.
//
// /auth/token has been REMOVED in P2 — users mint API tokens via
// /api/users/me/tokens (the standard PAT endpoint from P1).
// ============================================================

import { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import type { GatewayConfig, OIDCProvider } from "../config/schema.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { GatewayVariables } from "../middleware/types.js";
import { signSessionCookie } from "../middleware/auth/session-cookie.middleware.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "auth" });

// ── OIDC Discovery cache ──────────────────────────────

interface OIDCDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
}

const discoveryCache = new Map<string, { doc: OIDCDiscovery; fetchedAt: number }>();
const DISCOVERY_TTL = 5 * 60 * 1000; // 5 minutes

async function getDiscovery(provider: OIDCProvider): Promise<OIDCDiscovery> {
  const cached = discoveryCache.get(provider.id);
  if (cached && Date.now() - cached.fetchedAt < DISCOVERY_TTL) {
    return cached.doc;
  }

  log.info({ provider: provider.id, url: provider.discoveryUrl }, "Fetching OIDC discovery");
  const res = await fetch(provider.discoveryUrl);
  if (!res.ok) {
    throw new Error(`OIDC discovery failed for ${provider.id}: ${res.status}`);
  }
  const doc = (await res.json()) as OIDCDiscovery;
  discoveryCache.set(provider.id, { doc, fetchedAt: Date.now() });
  return doc;
}

// ── JWKS cache ────────────────────────────────────────

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function getJWKS(provider: OIDCProvider): Promise<ReturnType<typeof createRemoteJWKSet>> {
  if (jwksCache.has(provider.id)) return jwksCache.get(provider.id)!;
  const discovery = await getDiscovery(provider);
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  jwksCache.set(provider.id, jwks);
  return jwks;
}

// ── OAuth2 state store (in-memory, per server instance) ──

interface PendingState {
  providerId: string;
  codeVerifier: string;
  redirectAfter: string;
  createdAt: number;
}

const pendingStates = new Map<string, PendingState>();
const STATE_TTL = 10 * 60 * 1000; // 10 minutes

function cleanupStates() {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (now - val.createdAt > STATE_TTL) pendingStates.delete(key);
  }
}

// ── PKCE helpers ──────────────────────────────────────

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ── Route factory ─────────────────────────────────────

export interface AuthRoutesDeps {
  storage: StorageAdapter;
}

export function createAuthRoutes(config: GatewayConfig, deps: AuthRoutesDeps) {
  const app = new Hono<{ Variables: GatewayVariables }>();
  const providers = config.oidcProviders;
  const cookieName = config.auth.sessionCookieName ?? "mcp_session";
  const cookieTTLSeconds = 8 * 60 * 60; // 8 hours

  // Eagerly encode secret; sessionCookieSecret is required when oidcProviders.length > 0
  // (enforced by GatewayConfigSchema.superRefine). For safety in dev/no-OIDC setups,
  // we still avoid throwing at factory time and only require it inside /callback/:id.
  const sessionSecretBytes = config.auth.sessionCookieSecret
    ? new TextEncoder().encode(config.auth.sessionCookieSecret)
    : null;

  const publicUrl =
    config.gateway.publicUrl ??
    `http://${config.gateway.host === "0.0.0.0" ? "localhost" : config.gateway.host}:${config.gateway.port}`;

  const isProd = config.mode !== "development";

  // ── GET /auth/providers ────────────────────────────
  // Returns list of configured providers for the login page
  app.get("/providers", (c) => {
    return c.json({
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon,
        loginUrl: `${publicUrl}/auth/login/${p.id}`,
      })),
    });
  });

  // ── GET /auth/login/:id ────────────────────────────
  // Start OIDC authorization code + PKCE flow
  app.get("/login/:id", async (c) => {
    const providerId = c.req.param("id");
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      return c.json({ error: `Unknown provider: ${providerId}` }, 404);
    }

    const redirectAfter = c.req.query("redirect") ?? "/dashboard";

    cleanupStates();

    // Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString("hex");

    pendingStates.set(state, {
      providerId,
      codeVerifier,
      redirectAfter,
      createdAt: Date.now(),
    });

    const discovery = await getDiscovery(provider);
    const redirectUri = `${publicUrl}/auth/callback/${providerId}`;

    const scopes = [...new Set(["openid", "profile", "email", ...provider.scopes])];

    const authUrl = new URL(discovery.authorization_endpoint);
    authUrl.searchParams.set("client_id", provider.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    log.info({ provider: providerId, state }, "Starting OIDC login flow");
    return c.redirect(authUrl.toString());
  });

  // ── GET /auth/callback/:id ─────────────────────────
  // Handle OAuth2 callback — exchange code for tokens, upsert principal,
  // issue unified `{pid}` session cookie.
  app.get("/callback/:id", async (c) => {
    const providerId = c.req.param("id");
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      return c.json({ error: `Unknown provider: ${providerId}` }, 404);
    }

    if (!sessionSecretBytes) {
      log.error("OIDC callback invoked but auth.sessionCookieSecret is unset");
      return c.redirect(`/dashboard?auth_error=session_misconfigured`);
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    const errorParam = c.req.query("error");

    if (errorParam) {
      const desc = c.req.query("error_description") ?? errorParam;
      log.warn({ provider: providerId, error: errorParam }, "OIDC callback error");
      return c.redirect(`/dashboard?auth_error=${encodeURIComponent(desc)}`);
    }

    if (!code || !state) {
      return c.json({ error: "Missing code or state" }, 400);
    }

    // Verify state
    const pending = pendingStates.get(state);
    if (!pending || pending.providerId !== providerId) {
      return c.json({ error: "Invalid or expired state" }, 400);
    }
    pendingStates.delete(state);

    const discovery = await getDiscovery(provider);
    const redirectUri = `${publicUrl}/auth/callback/${providerId}`;

    // ── Exchange authorization code for tokens ────────
    const tokenRes = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        redirect_uri: redirectUri,
        code,
        code_verifier: pending.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      log.error({ provider: providerId, status: tokenRes.status, body }, "Token exchange failed");
      return c.redirect(`/dashboard?auth_error=token_exchange_failed`);
    }

    const tokens = (await tokenRes.json()) as {
      id_token?: string;
      access_token?: string;
      refresh_token?: string;
    };

    if (!tokens.id_token) {
      log.error({ provider: providerId }, "No id_token in token response");
      return c.redirect(`/dashboard?auth_error=no_id_token`);
    }

    // ── Verify ID token ───────────────────────────────
    let claims: JWTPayload;
    try {
      const jwks = await getJWKS(provider);
      const audiences = provider.audiences ?? [provider.clientId];
      const { payload: p } = await jwtVerify(tokens.id_token, jwks, {
        issuer: discovery.issuer,
        audience: audiences,
      });
      claims = p;
    } catch (err) {
      log.error({ provider: providerId, err }, "ID token verification failed");
      return c.redirect(`/dashboard?auth_error=invalid_id_token`);
    }

    // ── Upsert principal + issue unified session cookie ────────────
    const subject = (claims.sub as string | undefined) ?? "unknown";
    const email =
      (claims.email as string | undefined) ?? `${subject}@${provider.id}.oidc`;
    const displayName =
      (claims.name as string | undefined) ??
      (claims.email as string | undefined) ??
      subject;

    const principal = await deps.storage.principals.upsertOidcUser({
      oidcSubject: subject,
      oidcProviderId: provider.id,
      email,
      displayName,
    });

    log.info(
      { provider: providerId, sub: subject, principalId: principal.id, email },
      "User authenticated via OIDC; session cookie issued",
    );

    const sessionCookie = await signSessionCookie(
      { principalId: principal.id },
      sessionSecretBytes,
      cookieTTLSeconds,
    );

    c.header(
      "Set-Cookie",
      `${cookieName}=${sessionCookie}` +
        `; HttpOnly; Path=/; SameSite=Lax; Max-Age=${cookieTTLSeconds}` +
        (isProd ? "; Secure" : ""),
    );
    return c.redirect(pending.redirectAfter);
  });

  // ── POST /auth/logout ──────────────────────────────
  // Clear the session cookie. No JWT verification needed.
  app.post("/logout", (c) => {
    c.header(
      "Set-Cookie",
      `${cookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0` +
        (isProd ? "; Secure" : ""),
    );
    return c.json({ ok: true });
  });

  app.get("/logout", (c) => {
    c.header(
      "Set-Cookie",
      `${cookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0` +
        (isProd ? "; Secure" : ""),
    );
    return c.redirect("/dashboard");
  });

  // ── POST /auth/dev-login ───────────────────────────
  // Issues a session cookie for the in-process "dev" principal.
  // Only available when running in development mode — returns 404
  // otherwise to avoid any chance of accidental enabling in prod.
  app.post("/dev-login", async (c) => {
    if (config.mode !== "development") {
      return c.notFound();
    }
    if (!sessionSecretBytes) {
      log.error("dev-login invoked but auth.sessionCookieSecret is unset");
      return c.json({ error: "session_misconfigured" }, 500);
    }

    // Upsert a stable dev principal so subsequent calls hit the same row.
    const principal = await deps.storage.principals.upsertOidcUser({
      oidcSubject: "dev",
      oidcProviderId: "dev",
      email: "dev@local",
      displayName: "Developer",
    });

    const sessionCookie = await signSessionCookie(
      { principalId: principal.id },
      sessionSecretBytes,
      cookieTTLSeconds,
    );

    c.header(
      "Set-Cookie",
      `${cookieName}=${sessionCookie}` +
        `; HttpOnly; Path=/; SameSite=Lax; Max-Age=${cookieTTLSeconds}` +
        (isProd ? "; Secure" : ""),
    );

    return c.json({
      principalId: principal.id,
      displayName: principal.displayName,
      email: principal.email ?? null,
      type: principal.type,
    });
  });

  // ── GET /auth/me ───────────────────────────────────
  // Returns the principal resolved by sessionCookieMiddleware (or
  // bearerTokenMiddleware). Reads `c.var.principal` directly — no
  // re-verification of cookies/tokens happens here.
  app.get("/me", async (c) => {
    const principal = c.get("principal");
    if (!principal) {
      return c.json({ error: { code: "unauthenticated" } }, 401);
    }
    // Look up the principal's Casbin role bindings.
    // Subject is the email (preferred) or principalId — matches what
    // `POST /api/roles` accepts as `user`.
    const subject = principal.email ?? principal.id;
    let roles: string[] = [];
    try {
      const { listRoleBindings } = await import("../middleware/authz/policy.engine.js");
      const bindings = await listRoleBindings();
      roles = bindings.filter((b) => b.user === subject).map((b) => b.role);
    } catch {
      // Enforcer not initialized (authorization disabled or boot order edge):
      // surface empty roles rather than crashing /auth/me.
      roles = [];
    }
    return c.json({
      principalId: principal.id,
      type: principal.type,
      email: principal.email ?? null,
      displayName: principal.displayName,
      roles,
    });
  });

  return app;
}
