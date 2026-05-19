// ============================================================
// ProxyRegistry — in-memory dispatcher cache for outbound proxies
//
// HTTP/HTTPS proxies use undici.ProxyAgent directly. SOCKS5/SOCKS4
// proxies are wrapped via socks-proxy-agent inside an undici.Agent
// using a custom `connect` factory. SOCKS routing is best-effort in
// v1: if the socks-proxy-agent.connect API changes in a future
// version, the connect factory surfaces an error to the caller (who
// fails closed per P5 outbound wiring).
// ============================================================

import { Agent, type Dispatcher, ProxyAgent } from 'undici';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { StorageAdapter } from '../storage/adapter.js';
import type { ProxyRow } from '../storage/repositories/proxy.repo.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'proxy-registry' });

interface CacheEntry {
  row: ProxyRow;
  dispatcher: Dispatcher;
}

export class ProxyRegistry {
  private byName = new Map<string, CacheEntry>();

  constructor(private readonly storage: StorageAdapter) {}

  async load(): Promise<void> {
    await this.shutdown();
    const rows = await this.storage.proxies.list();
    for (const row of rows) {
      if (!row.enabled) continue;
      try {
        const dispatcher = buildDispatcher(row.url);
        this.byName.set(row.name, { row, dispatcher });
      } catch (err) {
        log.warn(
          { proxy: row.name, err: (err as Error).message },
          'Failed to build proxy dispatcher; skipping',
        );
      }
    }
    log.info({ count: this.byName.size }, 'Proxy registry loaded');
  }

  get(name: string): Dispatcher | null {
    return this.byName.get(name)?.dispatcher ?? null;
  }

  getUrl(name: string): string | null {
    return this.byName.get(name)?.row.url ?? null;
  }

  async upsert(row: ProxyRow): Promise<void> {
    const existing = this.byName.get(row.name);
    if (existing) {
      try {
        await existing.dispatcher.close();
      } catch {
        /* ignore */
      }
      this.byName.delete(row.name);
    }
    if (!row.enabled) return;
    try {
      const dispatcher = buildDispatcher(row.url);
      this.byName.set(row.name, { row, dispatcher });
    } catch (err) {
      log.warn(
        { proxy: row.name, err: (err as Error).message },
        'Failed to build proxy dispatcher on upsert',
      );
    }
  }

  async remove(name: string): Promise<void> {
    const existing = this.byName.get(name);
    if (existing) {
      try {
        await existing.dispatcher.close();
      } catch {
        /* ignore */
      }
      this.byName.delete(name);
    }
  }

  async shutdown(): Promise<void> {
    for (const entry of this.byName.values()) {
      try {
        await entry.dispatcher.close();
      } catch {
        /* ignore */
      }
    }
    this.byName.clear();
  }
}

function buildDispatcher(url: string): Dispatcher {
  const u = new URL(url);
  if (u.protocol === 'http:' || u.protocol === 'https:') {
    return new ProxyAgent(url);
  }
  if (
    u.protocol === 'socks5:' ||
    u.protocol === 'socks5h:' ||
    u.protocol === 'socks4:' ||
    u.protocol === 'socks4a:' ||
    u.protocol === 'socks:'
  ) {
    return buildSocksDispatcher(url);
  }
  throw new Error(`Unsupported proxy scheme: ${u.protocol}`);
}

function buildSocksDispatcher(socksUrl: string): Dispatcher {
  const socksAgent = new SocksProxyAgent(socksUrl);

  // Wrap the SocksProxyAgent as an undici Agent via a custom connect factory.
  // The `connect` callback shape across undici versions: it accepts an options
  // object and a node-style callback `(err, socket)`. We invoke
  // SocksProxyAgent.connect(req, opts) which returns Promise<net.Socket>.
  //
  // If SocksProxyAgent.connect is unavailable (API change), the catch path
  // surfaces the error to the caller. The caller fails closed per P5 design.
  return new Agent({
    // undici's connect-factory type is intentionally narrow here; the actual
    // runtime contract is `(opts, callback)` where opts has hostname/host/port
    // and callback is `(err, socket)`. We cast via `never` to bypass strict
    // typing without losing safety inside the body.
    connect: ((
      opts: {
        hostname?: string;
        host?: string;
        port?: number | string;
        servername?: string;
        protocol?: string;
      },
      callback: (err: Error | null, socket: unknown) => void,
    ): void => {
      const host = (opts.hostname ?? opts.host ?? '') as string;
      const portRaw = opts.port ?? 80;
      const port =
        typeof portRaw === 'string' ? parseInt(portRaw, 10) : portRaw;
      const secureEndpoint = opts.protocol === 'https:';

      const connectFn = (
        socksAgent as unknown as {
          connect?: (
            req: unknown,
            opts: { host: string; port: number; secureEndpoint: boolean },
          ) => Promise<unknown>;
        }
      ).connect;

      if (typeof connectFn !== 'function') {
        callback(
          new Error('socks_proxy_agent_connect_unavailable'),
          null,
        );
        return;
      }

      // Minimal request stub: SocksProxyAgent only calls req.destroy() on
      // timeout cleanup, so a noop destroy is sufficient for the connect path.
      const reqStub = { destroy: (): void => {} };

      try {
        const result = connectFn.call(socksAgent, reqStub, {
          host,
          port,
          secureEndpoint,
        });
        Promise.resolve(result).then(
          (socket) => callback(null, socket),
          (err: unknown) =>
            callback(err instanceof Error ? err : new Error(String(err)), null),
        );
      } catch (err) {
        callback(
          err instanceof Error ? err : new Error(String(err)),
          null,
        );
      }
    }) as never,
  });
}
