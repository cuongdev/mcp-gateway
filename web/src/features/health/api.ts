import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { HealthCheckResult } from '@/types/api';

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api<HealthCheckResult>('/api/health'),
    refetchInterval: 10_000,
  });
}
