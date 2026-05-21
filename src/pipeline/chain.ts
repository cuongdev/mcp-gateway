// ============================================================
// Pipeline — Chain runner (spec §4.2)
// ============================================================

import { logger } from '../utils/logger.js';
import type {
  Interceptor,
  PipelineContext,
  PipelineOutcome,
} from './types.js';
import { PipelineReject } from './types.js';

/**
 * Runs a fixed set of interceptors around an upstream call. Sorting and
 * filtering happen once at construction time so `run()` is cheap on the hot
 * path.
 *
 * Semantics:
 *   1. `before` phase, in ascending priority order. Any throw aborts the
 *      phase. The throwing interceptor itself is NOT recorded as having
 *      completed `before` (and so will not receive a `finally`).
 *   2. `upstream(ctx)` runs once if every `before` completed.
 *   3. `after` phase, in descending priority order. The return value (when
 *      defined) replaces `result`. Throws bubble out as `upstream_error`.
 *   4. `finally` phase, descending order over the interceptors that ran
 *      `before` (or had none). Runs on success, on `PipelineReject` from
 *      `before`/`after`, and on any other thrown error.
 *
 * Errors thrown from `finally` are swallowed and logged; they never affect
 * the pipeline outcome.
 */
export class PipelineChain {
  private readonly sorted: ReadonlyArray<Interceptor>;

  constructor(private readonly interceptors: ReadonlyArray<Interceptor>) {
    // Sort once at construction; filter out disabled interceptors.
    this.sorted = [...interceptors]
      .filter((i) => i.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /** Exposed for tests/debug; the sorted, enabled-only view used at runtime. */
  get pipeline(): ReadonlyArray<Interceptor> {
    return this.sorted;
  }

  async run(
    ctx: PipelineContext,
    upstream: (ctx: PipelineContext) => Promise<unknown>,
  ): Promise<unknown> {
    const ran: Interceptor[] = [];
    try {
      // before phase
      for (const interceptor of this.sorted) {
        if (interceptor.before) {
          const tStart = performance.now();
          try {
            await interceptor.before(ctx);
            ran.push(interceptor);
          } catch (err) {
            // We did NOT complete `before`; do not record this interceptor
            // for the `finally` phase. Span attribute is still useful for
            // diagnosing how far we got.
            ctx.span.setAttribute(
              `mcp.interceptor.${interceptor.name}.before_ms`,
              performance.now() - tStart,
            );
            throw err;
          }
          ctx.span.setAttribute(
            `mcp.interceptor.${interceptor.name}.before_ms`,
            performance.now() - tStart,
          );
        } else {
          // No `before` hook — still eligible to receive `finally`.
          ran.push(interceptor);
        }
      }

      // upstream
      const upstreamStart = performance.now();
      let result = await upstream(ctx);
      ctx.span.setAttribute('mcp.upstream_ms', performance.now() - upstreamStart);

      // after phase (reverse priority order)
      const afterOrdered = [...this.sorted].reverse();
      for (const interceptor of afterOrdered) {
        if (interceptor.after) {
          const next = await interceptor.after(ctx, result);
          // Spec semantics: `next ?? result` — null/undefined means "keep".
          result = next ?? result;
        }
      }

      const outcome: PipelineOutcome = {
        kind: 'success',
        result,
        latencyMs: performance.now() - ctx.startedAt,
      };
      await this.runFinally(ran, ctx, outcome);
      return result;
    } catch (e) {
      const latencyMs = performance.now() - ctx.startedAt;
      const outcome: PipelineOutcome =
        e instanceof PipelineReject
          ? { kind: 'rejected', reason: e, latencyMs }
          : { kind: 'upstream_error', error: e as Error, latencyMs };
      await this.runFinally(ran, ctx, outcome);
      throw e;
    }
  }

  private async runFinally(
    ran: Interceptor[],
    ctx: PipelineContext,
    outcome: PipelineOutcome,
  ): Promise<void> {
    for (const interceptor of [...ran].reverse()) {
      if (interceptor.finally) {
        try {
          await interceptor.finally(ctx, outcome);
        } catch (err) {
          logger.error(
            { interceptor: interceptor.name, err },
            'Interceptor finally hook threw',
          );
        }
      }
    }
  }
}
