// ============================================================
// Circuit-breaker pipeline interceptor (spec §5.1)
//
// Future-proof interceptor for when the gateway hot path migrates to
// the PipelineChain runner. For P6, the SessionManager.send() guard +
// recordCall does the heavy lifting; this interceptor is the canonical
// form of the same logic so the existing chain runner has a citizen
// to test against.
//
// Semantics:
//   - `before` consults the state machine. If state is
//     circuit_open / manual_disabled / quarantined, it throws a
//     PipelineReject with the canonical code so the chain runner
//     short-circuits BEFORE the upstream call. Half-open marks the
//     request as a probe via ctx.metadata.
//   - `finally` records the call outcome on the state machine UNLESS
//     the outcome was a rejection from this same interceptor — we never
//     double-count the rejection as a failure.
// ============================================================

import type {
  Interceptor,
  PipelineContext,
  PipelineOutcome,
} from '../types.js';
import { PipelineReject } from '../types.js';
import { PIPELINE_PRIORITY } from '../ordering.js';
import type { StateMachine } from '../../health/state-machine.js';

/**
 * Distinct PipelineReject `code` values emitted by this interceptor. Tests
 * import these so they don't have to hardcode strings.
 */
export const CIRCUIT_REJECT_CODES = {
  CIRCUIT_OPEN: 'circuit_open',
  SERVER_DISABLED: 'server_disabled',
  SERVER_QUARANTINED: 'server_quarantined',
} as const;

export class CircuitBreakerInterceptor implements Interceptor {
  readonly name = 'circuit-breaker';
  readonly priority = PIPELINE_PRIORITY.CIRCUIT_BREAKER;
  enabled = true;

  constructor(private readonly stateMachine: StateMachine) {}

  async before(ctx: PipelineContext): Promise<void> {
    if (!ctx.serverName) return;
    const health = this.stateMachine.getState(ctx.serverName);
    ctx.metadata.set('circuit.state', health.state);

    if (health.state === 'circuit_open') {
      throw new PipelineReject(
        503,
        CIRCUIT_REJECT_CODES.CIRCUIT_OPEN,
        `Upstream server '${ctx.serverName}' is currently unavailable.`,
        {
          server: ctx.serverName,
          openedAt: health.openedAt,
          retryAfter:
            health.openedAt !== undefined
              ? health.openedAt + health.config.cooldownMs
              : undefined,
        },
      );
    }
    if (health.state === 'manual_disabled') {
      throw new PipelineReject(
        503,
        CIRCUIT_REJECT_CODES.SERVER_DISABLED,
        `Upstream '${ctx.serverName}' is administratively disabled.`,
        { server: ctx.serverName },
      );
    }
    if (health.state === 'quarantined') {
      throw new PipelineReject(
        503,
        CIRCUIT_REJECT_CODES.SERVER_QUARANTINED,
        `Upstream '${ctx.serverName}' is quarantined.`,
        { server: ctx.serverName },
      );
    }
    if (health.state === 'half_open') {
      ctx.metadata.set('circuit.probe', true);
    }
  }

  async finally(ctx: PipelineContext, outcome: PipelineOutcome): Promise<void> {
    if (!ctx.serverName) return;

    // Never double-count a rejection from this same interceptor.
    if (
      outcome.kind === 'rejected' &&
      (outcome.reason.code === CIRCUIT_REJECT_CODES.CIRCUIT_OPEN ||
        outcome.reason.code === CIRCUIT_REJECT_CODES.SERVER_DISABLED ||
        outcome.reason.code === CIRCUIT_REJECT_CODES.SERVER_QUARANTINED)
    ) {
      return;
    }

    const success = outcome.kind === 'success';
    const errorCode =
      outcome.kind === 'rejected'
        ? outcome.reason.code
        : outcome.kind === 'upstream_error'
        ? outcome.error.name
        : undefined;

    this.stateMachine.recordCall(ctx.serverName, {
      ts: Date.now(),
      success,
      errorCode,
      latencyMs: outcome.latencyMs,
    });
  }
}
