// ============================================================
// Per-server health state machine (spec §4.3)
//
// States:
//   healthy -> degraded -> circuit_open -> half_open -> healthy
//                                         \-> circuit_open (-> quarantined after N reopens)
//   any -> manual_disabled (admin)
//
// The state machine is purely in-memory and decoupled from any I/O.
// Persistence and probing are wired in by callers.
// ============================================================

import { logger } from '../utils/logger.js';

export type ServerHealthState =
  | 'healthy'
  | 'degraded'
  | 'circuit_open'
  | 'half_open'
  | 'quarantined'
  | 'manual_disabled';

export interface CircuitConfig {
  errorRateThreshold: number;       // 0..1, default 0.5
  windowSize: number;               // calls, default 20
  consecutiveErrorsToTrip: number;  // default 5
  cooldownMs: number;               // default 30_000
  halfOpenProbes: number;           // default 1
  quarantineAfterReopens: number;   // default 3
  warmupCalls: number;              // default 5
  probeMethod?: string;             // defaults to 'tools/list'
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitConfig = {
  errorRateThreshold: 0.5,
  windowSize: 20,
  consecutiveErrorsToTrip: 5,
  cooldownMs: 30_000,
  halfOpenProbes: 1,
  quarantineAfterReopens: 3,
  warmupCalls: 5,
  probeMethod: 'tools/list',
};

export interface CallRecord {
  ts: number;
  success: boolean;
  errorCode?: string;
  latencyMs: number;
}

export interface ServerHealth {
  serverName: string;
  state: ServerHealthState;
  config: CircuitConfig;
  rolling: CallRecord[];
  consecutiveErrors: number;
  totalCallsSinceRegister: number;
  openedAt?: number;
  halfOpenTestAt?: number;
  reopenCount: number;
  lastTransitionAt: number;
  lastTransitionReason?: string;
}

export interface TransitionEvent {
  serverName: string;
  from: ServerHealthState;
  to: ServerHealthState;
  reason: string;
  ts: number;
}

export interface StateMachine {
  getState(serverName: string): ServerHealth;
  recordCall(serverName: string, rec: CallRecord): ServerHealthState;
  trip(serverName: string, reason: string): void;
  close(serverName: string, reason: string): void;
  reset(serverName: string): void;
  setEnabled(serverName: string, enabled: boolean, reason?: string): void;
  setConfig(serverName: string, config: Partial<CircuitConfig>): void;
  onTransition(listener: (event: TransitionEvent) => void): () => void;
  listAll(): ServerHealth[];
}

function freshHealth(serverName: string, config: CircuitConfig): ServerHealth {
  return {
    serverName,
    state: 'healthy',
    config: { ...config },
    rolling: [],
    consecutiveErrors: 0,
    totalCallsSinceRegister: 0,
    reopenCount: 0,
    lastTransitionAt: Date.now(),
  };
}

function errorRate(rolling: CallRecord[]): number {
  if (rolling.length === 0) return 0;
  let errs = 0;
  for (const r of rolling) if (!r.success) errs++;
  return errs / rolling.length;
}

export class InMemoryStateMachine implements StateMachine {
  private servers = new Map<string, ServerHealth>();
  private listeners = new Set<(e: TransitionEvent) => void>();
  private defaults: CircuitConfig;

  constructor(defaults: CircuitConfig = DEFAULT_CIRCUIT_CONFIG) {
    this.defaults = { ...defaults };
  }

  /**
   * Returns the ServerHealth for a server. If the server is not yet tracked,
   * a fresh "healthy" entry is created. Also performs lazy half-open promotion:
   * if a circuit has been open for at least `cooldownMs`, this call transitions
   * it to half_open before returning.
   */
  getState(serverName: string): ServerHealth {
    let h = this.servers.get(serverName);
    if (!h) {
      h = freshHealth(serverName, this.defaults);
      this.servers.set(serverName, h);
    }
    if (h.state === 'circuit_open' && h.openedAt !== undefined) {
      if (Date.now() - h.openedAt >= h.config.cooldownMs) {
        this.transition(h, 'half_open', 'cooldown elapsed');
        h.halfOpenTestAt = Date.now();
      }
    }
    return h;
  }

  recordCall(serverName: string, rec: CallRecord): ServerHealthState {
    const h = this.getState(serverName);

    // manual_disabled and quarantined are terminal absent admin action
    if (h.state === 'manual_disabled' || h.state === 'quarantined') {
      return h.state;
    }

    // Append + maintain bounded window
    h.rolling.push(rec);
    if (h.rolling.length > h.config.windowSize) {
      h.rolling.splice(0, h.rolling.length - h.config.windowSize);
    }
    h.totalCallsSinceRegister += 1;
    h.consecutiveErrors = rec.success ? 0 : h.consecutiveErrors + 1;

    // Warmup: count calls but no transitions
    if (h.totalCallsSinceRegister <= h.config.warmupCalls) {
      return h.state;
    }

    // Half-open: a single result decides — succeed and we go healthy,
    // fail and we reopen (or quarantine if we've flapped too many times).
    if (h.state === 'half_open') {
      if (rec.success) {
        this.transition(h, 'healthy', 'half_open probe succeeded');
        h.openedAt = undefined;
        h.halfOpenTestAt = undefined;
        h.reopenCount = 0;
      } else {
        h.reopenCount += 1;
        if (h.reopenCount >= h.config.quarantineAfterReopens) {
          this.transition(h, 'quarantined', `flapped ${h.reopenCount} times`);
          h.openedAt = undefined;
          h.halfOpenTestAt = undefined;
        } else {
          this.transition(h, 'circuit_open', 'half_open probe failed');
          h.openedAt = Date.now();
          h.halfOpenTestAt = undefined;
        }
      }
      return h.state;
    }

    // Consecutive errors trip wins over rolling rate
    if (h.consecutiveErrors >= h.config.consecutiveErrorsToTrip) {
      this.transition(
        h,
        'circuit_open',
        `${h.consecutiveErrors} consecutive errors`,
      );
      h.openedAt = Date.now();
      return h.state;
    }

    // Rolling error rate
    const rate = errorRate(h.rolling);
    if (h.state === 'healthy' && rate >= h.config.errorRateThreshold) {
      this.transition(h, 'degraded', `error rate ${rate.toFixed(2)}`);
      return h.state;
    }
    if (h.state === 'degraded') {
      if (rate >= h.config.errorRateThreshold) {
        // still degraded; consecutive-error trip handled above
        return h.state;
      }
      // Recover once rate falls clearly below threshold (half of it)
      if (rate < h.config.errorRateThreshold * 0.5) {
        this.transition(h, 'healthy', `recovered, rate ${rate.toFixed(2)}`);
        return h.state;
      }
    }
    return h.state;
  }

  trip(serverName: string, reason: string): void {
    const h = this.getState(serverName);
    if (h.state === 'circuit_open') return;
    this.transition(h, 'circuit_open', reason || 'manual trip');
    h.openedAt = Date.now();
  }

  close(serverName: string, reason: string): void {
    const h = this.getState(serverName);
    if (h.state === 'healthy') return;
    this.transition(h, 'healthy', reason || 'manual close');
    h.openedAt = undefined;
    h.halfOpenTestAt = undefined;
    h.consecutiveErrors = 0;
  }

  reset(serverName: string): void {
    const existing = this.servers.get(serverName);
    const cfg = existing?.config ?? this.defaults;
    const next = freshHealth(serverName, cfg);
    const from = existing?.state ?? 'healthy';
    this.servers.set(serverName, next);
    if (from !== 'healthy') {
      this.emit({ serverName, from, to: 'healthy', reason: 'reset', ts: Date.now() });
    }
  }

  setEnabled(serverName: string, enabled: boolean, reason?: string): void {
    const h = this.getState(serverName);
    if (enabled) {
      if (h.state !== 'manual_disabled') return;
      this.transition(h, 'healthy', reason || 'manual enable');
      h.openedAt = undefined;
      h.halfOpenTestAt = undefined;
      h.consecutiveErrors = 0;
      h.rolling = [];
    } else {
      if (h.state === 'manual_disabled') return;
      this.transition(h, 'manual_disabled', reason || 'manual disable');
    }
  }

  setConfig(serverName: string, config: Partial<CircuitConfig>): void {
    const h = this.getState(serverName);
    h.config = { ...h.config, ...config };
  }

  onTransition(listener: (event: TransitionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  listAll(): ServerHealth[] {
    return Array.from(this.servers.values());
  }

  // --- internal ---

  private transition(
    h: ServerHealth,
    to: ServerHealthState,
    reason: string,
  ): void {
    if (h.state === to) return;
    const from = h.state;
    h.state = to;
    h.lastTransitionAt = Date.now();
    h.lastTransitionReason = reason;
    this.emit({
      serverName: h.serverName,
      from,
      to,
      reason,
      ts: h.lastTransitionAt,
    });
  }

  private emit(event: TransitionEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        logger.warn({ err, event }, 'state-machine transition listener threw');
      }
    }
  }
}
