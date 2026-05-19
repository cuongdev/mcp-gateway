import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { UsageResponse } from '@/types/api';

export interface AuditQuery {
  since?: number;
  by?: 'tool' | 'principal' | 'server';
  action?: string;
}

export function useAudit(q: AuditQuery) {
  const params = new URLSearchParams();
  if (q.since !== undefined) params.set('since', String(q.since));
  params.set('by', q.by ?? 'principal');
  if (q.action) params.set('action', q.action);
  return useQuery({
    queryKey: queryKeys.audit({ since: q.since, by: q.by, action: q.action }),
    queryFn: () => api<UsageResponse>(`/api/usage?${params}`),
  });
}
