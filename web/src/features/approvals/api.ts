import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Approval } from '@/types/api';

export function usePendingApprovals() {
  return useQuery({
    queryKey: queryKeys.approvals('pending'),
    queryFn: () => api<{ approvals: Approval[] }>('/api/approvals?status=pending'),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiPost<{ ok: true }>(`/api/approvals/${encodeURIComponent(id)}/approve`, { reason }),
    onSuccess: () => {
      toast.success('Approved');
      qc.invalidateQueries({ queryKey: queryKeys.approvals('pending') });
    },
    onError: (err: Error) => toast.error(`Approve failed: ${err.message}`),
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiPost<{ ok: true }>(`/api/approvals/${encodeURIComponent(id)}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Rejected');
      qc.invalidateQueries({ queryKey: queryKeys.approvals('pending') });
    },
    onError: (err: Error) => toast.error(`Reject failed: ${err.message}`),
  });
}
