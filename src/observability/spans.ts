// ============================================================
// Custom OTel Span Helpers
//
// `withSpan` wraps an async function in an OpenTelemetry span,
// setting attributes + status + recording exceptions automatically.
//
// `currentTraceparent` formats the active span's context as a W3C
// `traceparent` header value, suitable for forwarding to upstream
// HTTP requests.
//
// When tracing is disabled, the global API returns a no-op tracer
// so these helpers are still cheap to call.
// ============================================================

import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";

const tracer = trace.getTracer("mcp-gateway");

export type SpanAttrValue = string | number | boolean | undefined;

/**
 * Run `fn` inside an active OTel span. Sets the provided attributes,
 * marks status OK on resolution / ERROR + records the exception on
 * rejection. The span is always ended.
 */
export async function withSpan<T>(
  name: string,
  attrs: Record<string, SpanAttrValue>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined) span.setAttribute(k, v as never);
    }
    try {
      const out = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Return the W3C `traceparent` header for the currently active span,
 * or `undefined` if no span is active.
 *
 * Format: `00-<traceId>-<spanId>-<flags>`
 */
export function currentTraceparent(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  if (!ctx.traceId || !ctx.spanId) return undefined;
  const flags = (ctx.traceFlags & 0xff).toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}
