// ============================================================
// Pipeline — Interceptor types (spec §4.2)
// ============================================================

import type { Span } from '@opentelemetry/api';
import type { Principal } from '../identity/principal.js';

/**
 * A Capability is a generic descriptor of the capability being invoked on the
 * upstream MCP server (e.g. a specific tool or resource). The concrete shape
 * is defined by the CapabilityRegistry in a later task; here we leave it as
 * an opaque structural type so interceptors and the chain runner compile
 * before that module lands.
 */
export interface Capability {
  /** Capability kind: "tool" | "resource" | "prompt" | etc. */
  kind: string;
  /** Capability name, scoped to its server. */
  name: string;
  /** Optional arbitrary metadata for downstream consumers. */
  [key: string]: unknown;
}

/**
 * Context handed to every interceptor and to the upstream call. Interceptors
 * mutate `params` and `metadata` to communicate; everything else is
 * effectively read-only past construction time.
 */
export interface PipelineContext {
  requestId: string;
  jsonrpcId: string | number | null;
  /** Which MCP method? "tools/call", "resources/read", "sampling/createMessage", … */
  method: string;
  /** The capability being invoked, if applicable. Absent for cross-cutting methods like `initialize`. */
  capability?: Capability;
  /** The upstream server name routing destination. Absent for virtual tools (handled by executor). */
  serverName?: string;
  /** Original JSON-RPC params, possibly mutated by interceptors. */
  params: unknown;
  /** Principal making the call. */
  principal: Principal;
  tenantId: string;
  /** Group endpoint name if routed via /mcp/groups/:name. */
  groupName?: string;
  /** Mutable bag for cross-interceptor data (e.g. cache key, redaction findings). */
  metadata: Map<string, unknown>;
  /** OTel span for this call. Interceptors should attach attributes, not create children. */
  span: Span;
  /** Start timestamp in ms (from `performance.now()`). */
  startedAt: number;
}

/**
 * Outcome reported to each interceptor's `finally` hook. `latencyMs` is the
 * end-to-end pipeline duration including before/upstream/after.
 */
export type PipelineOutcome =
  | { kind: 'success'; result: unknown; latencyMs: number }
  | { kind: 'rejected'; reason: PipelineReject; latencyMs: number }
  | { kind: 'upstream_error'; error: Error; latencyMs: number };

/**
 * Throw from `before` (or `after`) to short-circuit the chain with a
 * well-formed gateway response. Anything else thrown is treated as an
 * `upstream_error`.
 */
export class PipelineReject extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,         // 'circuit_open', 'redaction_block', etc.
    public readonly publicMessage: string,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(publicMessage);
    this.name = 'PipelineReject';
  }
}

/**
 * A pipeline interceptor. Each phase is optional; an interceptor that only
 * needs to observe the outcome can implement just `finally`.
 *
 * The chain runner guarantees:
 *   - `before` runs in ascending `priority` order.
 *   - `after`  runs in descending `priority` order.
 *   - `finally` runs in descending order of interceptors that completed
 *     `before` (or had no `before`), regardless of success/reject/error.
 *   - `finally` errors are swallowed and logged; they never affect the
 *     pipeline outcome.
 */
export interface Interceptor {
  /** Stable identifier (used in metrics, logs, OTel span attributes). */
  name: string;
  /** Sort order; lower runs first. Conventional buckets: 10-29 auth/authz, 30-89 pre-call, 90-129 post-call. */
  priority: number;
  /** Whether this interceptor is enabled (allows runtime disable for debugging). */
  enabled: boolean;
  /** Runs before the upstream call. Throw PipelineReject to short-circuit. */
  before?(ctx: PipelineContext): Promise<void>;
  /** Runs after the upstream call returns. Return value (if defined) replaces `result`. */
  after?(ctx: PipelineContext, result: unknown): Promise<unknown>;
  /** Always runs after either before-reject, success, or upstream error. */
  finally?(ctx: PipelineContext, outcome: PipelineOutcome): Promise<void>;
}
