import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

async function fetchMetrics(): Promise<string> {
  const res = await fetch('/api/metrics', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`metrics fetch failed: ${res.status}`);
  return res.text();
}

export function useMetrics() {
  return useQuery({
    queryKey: queryKeys.metrics,
    queryFn: fetchMetrics,
    refetchInterval: 10_000,
  });
}

/**
 * Parse Prometheus exposition text and extract the value for a given
 * metric name. Returns null if the line is missing.
 */
export function parseMetric(text: string, metric: string): number | null {
  const re = new RegExp(`^${metric}(?:\\{[^}]*\\})?\\s+(\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)`, 'm');
  const match = text.match(re);
  if (!match) return null;
  return parseFloat(match[1]);
}
