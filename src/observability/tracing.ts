// ============================================================
// OpenTelemetry Bootstrap
//
// Wires up NodeSDK + OTLP HTTP exporter + ratio-based sampler +
// auto-instrumentations. Tracing defaults to DISABLED so existing
// tests don't get OTel side-effects (e.g. background HTTP exporter
// keeping the event loop alive).
// ============================================================

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { GatewayConfig } from "../config/schema.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ component: "tracing" });

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry. No-op when `tracing.enabled` is false.
 *
 * @param cfg parsed gateway config (must include `tracing` block)
 */
export async function initTracing(cfg: GatewayConfig): Promise<void> {
  if (!cfg.tracing.enabled) return;
  if (sdk) {
    log.warn("Tracing already initialized; ignoring duplicate init");
    return;
  }

  const exporter = new OTLPTraceExporter({
    url: cfg.tracing.otlpEndpoint ?? "http://localhost:4318/v1/traces",
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: cfg.tracing.serviceName,
    }),
    traceExporter: exporter,
    sampler: new TraceIdRatioBasedSampler(cfg.tracing.samplingRatio),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs auto-instrumentation is noisy and not useful for the gateway
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  // sdk.start() returns void in @opentelemetry/sdk-node 0.55.x
  sdk.start();

  log.info(
    {
      serviceName: cfg.tracing.serviceName,
      endpoint: cfg.tracing.otlpEndpoint ?? "http://localhost:4318/v1/traces",
      samplingRatio: cfg.tracing.samplingRatio,
    },
    "OpenTelemetry tracing started",
  );
}

/**
 * Flush + shut down the SDK. Safe to call when tracing was never enabled.
 */
export async function shutdownTracing(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (err) {
    log.warn({ err }, "Error shutting down OpenTelemetry SDK");
  } finally {
    sdk = null;
  }
}
