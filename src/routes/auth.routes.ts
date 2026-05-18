// ============================================================
// Auth Routes — OIDC Authorization Code Flow
//
// Endpoints:
//   GET  /auth/providers           — list configured providers
//   GET  /auth/login/:id           — start OAuth2 + PKCE flow
//   GET  /auth/callback/:id        — handle OAuth2 callback
//   POST /auth/logout              — clear session cookie
//   GET  /auth/me                  — current user info
//   GET  /auth/token               — exchange session for Bearer token
//
// Flow:
//   Browser → GET /auth/login/google
//           → redirect to Google with state + code_challenge
//           → Google → GET /auth/callback/google?code=…&state=…
//           → exchange code for tokens
//           → verify ID token
//           → issue signed session JWT as HttpOnly cookie
//           → redirect to /dashboard
// ============================================================

import { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  jwtDecrypt,
  type JWTPayload,
} from "jose";
import type { GatewayConfig, OIDCProvider } from "../config/schema.js";
import type { UserContext } from "../types/gateway.js";
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

// ── Session JWT helpers ───────────────────────────────

async function signSessionJWT(
  user: UserContext,
  secret: string,
  ttlSeconds: number
): Promise<string> {
  const secretKey = Buffer.from(secret, "utf-8");
  return new SignJWT({
    sub: user.sub,
    email: user.email,
    name: user.name,
    roles: user.roles,
    orgId: user.orgId,
    iss: user.issuer,
    providerId: (user as any).providerId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey);
}

async function verifySessionJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, Buffer.from(secret, "utf-8"));
    return payload;
  } catch {
    return null;
  }
}

// ── Route factory ─────────────────────────────────────

export function createAuthRoutes(config: GatewayConfig) {
  const app = new Hono();
  const providers = config.oidcProviders;
  const sessionCfg = config.session;
  const sessionSecret = sessionCfg.secret!;
  const cookieName = sessionCfg.cookieName;
  const cookieTTL = sessionCfg.ttl;

  const publicUrl =
    config.gateway.publicUrl ??
    `http://${config.gateway.host === "0.0.0.0" ? "localhost" : config.gateway.host}:${config.gateway.port}`;

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
  // Handle OAuth2 callback — exchange code for tokens, set session cookie
  app.get("/callback/:id", async (c) => {
    const providerId = c.req.param("id");
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      return c.json({ error: `Unknown provider: ${providerId}` }, 404);
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
    let payload: JWTPayload;
    try {
      const jwks = await getJWKS(provider);
      const audiences = provider.audiences ?? [provider.clientId];
      const { payload: p } = await jwtVerify(tokens.id_token, jwks, {
        issuer: discovery.issuer,
        audience: audiences,
      });
      payload = p;
    } catch (err) {
      log.error({ provider: providerId, err }, "ID token verification failed");
      return c.redirect(`/dashboard?auth_error=invalid_id_token`);
    }

    // ── Extract user context ──────────────────────────
    const user = extractUser(payload, provider, discovery.issuer);

    log.info({ provider: providerId, sub: user.sub, email: user.email }, "User authenticated via OIDC");

    // ── Issue session JWT as HttpOnly cookie ──────────
    const sessionToken = await signSessionJWT(user, sessionSecret, cookieTTL);

    const cookieFlags = [
      `${cookieName}=${sessionToken}`,
      "HttpOnly",
      "Path=/",
      `Max-Age=${cookieTTL}`,
      "SameSite=Lax",
      ...(sessionCfg.secure ? ["Secure"] : []),
    ].join("; ");

    c.header("Set-Cookie", cookieFlags);
    return c.redirect(pending.redirectAfter);
  });

  // ── POST /auth/logout ──────────────────────────────
  app.post("/logout", (c) => {
    // Clear session cookie
    c.header(
      "Set-Cookie",
      `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    );
    return c.json({ ok: true });
  });

  app.get("/logout", (c) => {
    c.header(
      "Set-Cookie",
      `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    );
    return c.redirect("/dashboard");
  });

  // ── GET /auth/me ───────────────────────────────────
  // Returns current user from session cookie (or Bearer token)
  app.get("/me", async (c) => {
    const user = await resolveUser(c.req.raw, sessionSecret, cookieName, providers);
    if (!user) return c.json({ authenticated: false }, 401);
    return c.json({
      authenticated: true,
      user: {
        sub: user.sub,
        email: user.email,
        name: user.name,
        roles: user.roles,
        orgId: user.orgId,
        issuer: user.issuer,
      },
    });
  });

  // ── GET /auth/token ────────────────────────────────
  // Exchange session cookie for a Bearer token (for programmatic API use)
  app.get("/token", async (c) => {
    const user = await resolveUser(c.req.raw, sessionSecret, cookieName, providers);
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    // Issue a short-lived API token (1 hour)
    const apiToken = await signSessionJWT(user, sessionSecret, 3600);
    return c.json({ token: apiToken, expiresIn: 3600 });
  });

  return app;
}

// ── Helpers ───────────────────────────────────────────

/**
 * Resolve user from session cookie or Bearer token.
 * Used by /auth/me and can be reused by auth middleware.
 */
export async function resolveUser(
  req: Request,
  sessionSecret: string,
  cookieName: string,
  providers: OIDCProvider[]
): Promise<UserContext | null> {
  // 1. Try session cookie
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k?.trim() ?? "", v.join("=")];
    })
  );
  const sessionToken = cookies[cookieName];
  if (sessionToken) {
    const payload = await verifySessionJWT(sessionToken, sessionSecret);
    if (payload) return payloadToUser(payload);
  }

  // 2. Try Bearer token — validate against all providers
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^[Bb]earer\s+(.+)$/);
  if (match) {
    const bearerToken = match[1]!;

    // Try session secret first (tokens issued by /auth/token)
    const selfPayload = await verifySessionJWT(bearerToken, sessionSecret);
    if (selfPayload) return payloadToUser(selfPayload);

    // Try each OIDC provider's JWKS
    for (const provider of providers) {
      try {
        const jwks = await getJWKS(provider);
        const discovery = await getDiscovery(provider);
        const audiences = provider.audiences ?? [provider.clientId];
        const { payload } = await jwtVerify(bearerToken, jwks, {
          issuer: discovery.issuer,
          audience: audiences,
        });
        return extractUser(payload, provider, discovery.issuer);
      } catch {
        // Try next provider
      }
    }
  }

  return null;
}

function payloadToUser(payload: JWTPayload): UserContext {
  return {
    sub: payload["sub"] ?? "unknown",
    email: payload["email"] as string | undefined,
    name: payload["name"] as string | undefined,
    roles: (payload["roles"] as string[] | undefined) ?? [],
    orgId: payload["orgId"] as string | undefined,
    claims: payload as Record<string, unknown>,
    issuer: payload["iss"] ?? "unknown",
    expiresAt: payload["exp"] ?? 0,
  };
}

function extractUser(
  payload: JWTPayload,
  provider: OIDCProvider,
  issuer: string
): UserContext {
  // Extract roles from configured claim
  let roles: string[] = [];
  const rolesClaim = payload[provider.rolesClaim];
  if (Array.isArray(rolesClaim)) {
    roles = rolesClaim.map(String);
  } else if (typeof rolesClaim === "string") {
    roles = rolesClaim.split(",").map((r) => r.trim()).filter(Boolean);
  }

  // Apply role mappings (e.g. provider group → gateway role)
  const mappedRoles = new Set(roles);
  for (const [providerRole, gatewayRoles] of Object.entries(provider.roleMappings)) {
    if (roles.includes(providerRole)) {
      gatewayRoles.forEach((r) => mappedRoles.add(r));
    }
  }

  const orgId = payload[provider.orgClaim] as string | undefined;

  return {
    sub: payload["sub"] ?? "unknown",
    email: payload["email"] as string | undefined,
    name: payload["name"] as string | undefined,
    orgId,
    roles: Array.from(mappedRoles),
    claims: payload as Record<string, unknown>,
    issuer,
    expiresAt: payload["exp"] ?? 0,
  };
}
