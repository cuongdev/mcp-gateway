// ============================================================
// Background probe loop (spec §4.3 / §5.1)
//
// Single timer that walks the state machine on each tick:
//   - degraded / circuit_open / half_open are probed every tick
//     (lazy half-open promotion happens inside StateMachine.getState)
//   - healthy servers are probed at a slower heartbeat cadence
//
// Probes go through a ProbeTarget (typically SessionManager.rawSend)
// and BYPASS the interceptor chain entirely.
// ============================================================

import { logger, type Logger } from '../utils/logger.js';
import type { StateMachine, ServerHealthState } from './state-machine.js';

export interface ProbeLoopOptions {
  degradedIntervalMs?: number; // tick cadence for hot states, default 5000
  healthyIntervalMs?: number;  // heartbeat for healthy servers, default 60000
  probeTimeoutMs?: number;     // per-probe deadline, default 5000
}

export interface ProbeTarget {
  rawSend(serverName: string, jsonrpc: unknown): Promise<unknown>;
}

const HOT_STATES: ReadonlySet<ServerHealthState> = new Set([
  'degraded',
  'circuit_open',
  'half_open',
]);

export class ProbeLoop {
  private timer?: NodeJS.Timeout;
  private running = false;
  private inflight = false;
  private readonly degradedIntervalMs: number;
  private readonly healthyIntervalMs: number;
  private readonly probeTimeoutMs: number;
  private readonly lastHealthyProbe = new Map<string, number>();
  private readonly log: Logger;

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly target: ProbeTarget,
    opts: ProbeLoopOptions = {},
  ) {
    this.degradedIntervalMs = opts.degradedIntervalMs ?? 5000;
    this.healthyIntervalMs = opts.healthyIntervalMs ?? 60000;
    this.probeTimeoutMs = opts.probeTimeoutMs ?? 5000;
    this.log = logger.child({ component: 'probe-loop' });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.degradedIntervalMs);
    // Don't keep the process alive solely for this timer.
    this.timer.unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Visible for tests. */
  async tick(): Promise<void> {
    if (this.inflight) return;
    this.inflight = true;
    try {
      const now = Date.now();
      const servers = this.stateMachine.listAll();
      const probes: Promise<void>[] = [];
      for (const h of servers) {
        // getState() performs lazy half-open promotion if cooldown elapsed
        const fresh = this.stateMachine.getState(h.serverName);
        if (fresh.state === 'manual_disabled' || fresh.state === 'quarantined') {
          continue;
        }
        if (HOT_STATES.has(fresh.state)) {
          probes.push(this.probeOne(fresh.serverName, fresh.config.probeMethod));
          continue;
        }
        // healthy heartbeat
        const last = this.lastHealthyProbe.get(fresh.serverName) ?? 0;
        if (now - last >= this.healthyIntervalMs) {
          this.lastHealthyProbe.set(fresh.serverName, now);
          probes.push(this.probeOne(fresh.serverName, fresh.config.probeMethod));
        }
      }
      await Promise.allSettled(probes);
    } catch (err) {
      this.log.warn({ err }, 'probe loop tick failed');
    } finally {
      this.inflight = false;
    }
  }

  private async probeOne(serverName: string, method?: string): Promise<void> {
    const probeMethod = method ?? 'tools/list';
    const started = Date.now();
    const jsonrpc = {
      jsonrpc: '2.0',
      id: `probe-${started}`,
      method: probeMethod,
      params: {},
    };
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('probe_timeout'));
      }, this.probeTimeoutMs);
      timeoutHandle.unref?.();
    });
    try {
      await Promise.race([
        this.target.rawSend(serverName, jsonrpc),
        timeoutPromise,
      ]);
      const latencyMs = Date.now() - started;
      this.stateMachine.recordCall(serverName, {
        ts: Date.now(),
        success: true,
        latencyMs,
      });
    } catch (err) {
      const latencyMs = Date.now() - started;
      const errorCode = err instanceof Error && err.message === 'probe_timeout'
        ? 'probe_timeout'
        : 'probe_failed';
      this.stateMachine.recordCall(serverName, {
        ts: Date.now(),
        success: false,
        errorCode,
        latencyMs,
      });
      this.log.debug({ serverName, errorCode, err }, 'probe failed');
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
