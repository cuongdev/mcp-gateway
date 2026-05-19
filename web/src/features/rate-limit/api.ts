import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { RateLimitStatus } from '@/types/api';

export function useRateLimit() {
  return useQuery({
    queryKey: queryKeys.rateLimit,
    queryFn: () => api<RateLimitStatus>('/api/rate-limit/status'),
  });
}
