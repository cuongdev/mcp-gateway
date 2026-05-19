import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { QuotaStatus } from '@/types/api';

export function useQuota() {
  return useQuery({
    queryKey: queryKeys.quota,
    queryFn: () => api<QuotaStatus>('/api/quota/status'),
  });
}
