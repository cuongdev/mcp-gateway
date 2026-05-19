import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { AuditEntry } from '@/types/api';

export interface AuditQuery {
  since?: number;
  until?: number;
  principalId?: string;
  action?: string;
  result?: 'success' | 'denied' | 'error';
  limit?: number;
}

export function useAuditEvents(q: AuditQuery) {
  const params = new URLSearchParams();
  if (q.since !== undefined) params.set('since', String(q.since));
  if (q.until !== undefined) params.set('until', String(q.until));
  if (q.principalId) params.set('principalId', q.principalId);
  if (q.action) params.set('action', q.action);
  if (q.result) params.set('result', q.result);
  if (q.limit !== undefined) params.set('limit', String(q.limit));
  return useQuery({
    queryKey: queryKeys.audit({
      since: q.since, until: q.until, principalId: q.principalId,
      action: q.action, result: q.result, limit: q.limit,
    }),
    queryFn: () => api<{ events: AuditEntry[]; limit: number }>(`/api/audit/events?${params}`),
  });
}
