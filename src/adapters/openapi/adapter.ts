// ============================================================
// OpenAPI Transport Adapter
//
// Translates a `tools/call` invocation against a discovered
// OpenAPI operation into an HTTP request. SSRF-guards the
// final URL before dispatch and enforces a response size cap.
// ============================================================

import { checkUrl } from "./ssrf-guard.js";
import type { DiscoveredOpenApiTool } from "./operation-to-tool.js";
import type { OpenApiConfig } from "../../config/schema.js";

export interface OpenApiTransportConfig {
  type: "openapi";
  specUrl?: string;
  specPath?: string;
  baseUrl?: string;
  auth?: { type?: "bearer" | "apiKey"; token?: string; headerName?: string };
  filter?: { tags?: string[]; operationIds?: string[]; exclude?: string[] };
}

export interface OpenApiToolRunner {
  call(
    meta: DiscoveredOpenApiTool["meta"],
    args: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown }>;
}

export class OpenApiAdapter implements OpenApiToolRunner {
  constructor(
    private readonly transport: OpenApiTransportConfig,
    private readonly cfg: OpenApiConfig,
    private readonly baseUrlFromSpec: string | null,
  ) {}

  resolveBaseUrl(): string {
    return this.transport.baseUrl ?? this.baseUrlFromSpec ?? "";
  }

  async call(
    meta: DiscoveredOpenApiTool["meta"],
    args: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown }> {
    const base = this.resolveBaseUrl();
    if (!base) throw new Error("openapi_baseurl_missing");

    let path = meta.path;
    const query = new URLSearchParams();
    const headers: Record<string, string> = { "Accept": "application/json" };

    for (const [name, where] of Object.entries(meta.paramLocations)) {
      const v = args[name];
      if (v === undefined) continue;
      if (where === "path") {
        path = path.replace(`{${name}}`, encodeURIComponent(String(v)));
      } else if (where === "query") {
        query.set(name, String(v));
      } else if (where === "header") {
        headers[name] = String(v);
      }
    }

    const fullUrl = `${base.replace(/\/+$/, "")}${path}${
      query.toString() ? "?" + query.toString() : ""
    }`;
    const guard = await checkUrl(fullUrl, {
      allowedDomains: this.cfg.allowedDomains,
      blockPrivateIps: this.cfg.blockPrivateIps,
    });
    if (!guard.ok) throw new Error(`ssrf_blocked: ${guard.reason}`);

    if (this.transport.auth?.type === "bearer" && this.transport.auth.token) {
      headers["Authorization"] = `Bearer ${this.transport.auth.token}`;
    } else if (
      this.transport.auth?.type === "apiKey" && this.transport.auth.token
    ) {
      headers[this.transport.auth.headerName ?? "X-API-Key"] =
        this.transport.auth.token;
    }

    let body: string | undefined;
    if (meta.hasJsonBody && args.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(args.body);
    }

    const res = await fetch(fullUrl, { method: meta.method, headers, body });
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (text.length > this.cfg.maxResponseBytes) {
      throw new Error(
        `response_too_large: ${text.length} > ${this.cfg.maxResponseBytes}`,
      );
    }
    const parsed = ct.includes("json") && text ? JSON.parse(text) : text;
    return { status: res.status, body: parsed };
  }
}
