const DEFAULT_URL = 'http://localhost:3000';

export interface ClientOptions {
  url?: string;
  token?: string;
}

export class GatewayClient {
  private readonly url: string;
  private readonly token?: string;

  constructor(opts: ClientOptions = {}) {
    this.url = opts.url ?? process.env.MCP_GATEWAY_URL ?? DEFAULT_URL;
    this.token = opts.token ?? process.env.MCP_TOKEN;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const r = await fetch(this.url + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${path}: ${text}`);
    }
    return text ? JSON.parse(text) as T : ({} as T);
  }
}
