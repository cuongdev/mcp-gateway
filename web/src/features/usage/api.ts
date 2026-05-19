import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { UsageResponse } from '@/types/api';

export interface UsageQuery {
  since?: number;
  until?: number;
  by: 'tool' | 'principal' | 'server';
  action?: string;
}

export function useUsage(q: UsageQuery) {
  const params = new URLSearchParams();
  if (q.since !== undefined) params.set('since', String(q.since));
  if (q.until !== undefined) params.set('until', String(q.until));
  params.set('by', q.by);
  if (q.action) params.set('action', q.action);
  return useQuery({
    queryKey: queryKeys.usage({ since: q.since, until: q.until, by: q.by, action: q.action }),
    queryFn: () => api<UsageResponse>(`/api/usage?${params}`),
  });
}
