/**
 * Percentile helpers for the perf harness. Pure functions; no I/O.
 */

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export function summarize(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    count: samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
    mean: sum / samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
  };
}

/** Assert that a current p99 is within ±maxIncreasePct of a baseline. */
export function assertNoP99Regression(current: LatencyStats, baseline: LatencyStats, maxIncreasePct = 0.2): void {
  if (baseline.p99 === 0) return; // no baseline yet
  const ratio = current.p99 / baseline.p99;
  if (ratio > 1 + maxIncreasePct) {
    throw new Error(
      `p99 regression: baseline=${baseline.p99.toFixed(2)}ms current=${current.p99.toFixed(2)}ms (+${((ratio - 1) * 100).toFixed(1)}%)`,
    );
  }
}
