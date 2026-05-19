import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiDelete, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { PatToken } from '@/types/api';

export function useMyTokens() {
  return useQuery({
    queryKey: queryKeys.myTokens,
    queryFn: () => api<{ tokens: PatToken[] }>('/api/users/me/tokens'),
  });
}

export function useCreateMyToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; expiresInDays?: number }) =>
      apiPost<{ tokenId: string; token: string; name: string; expiresAt?: number }>(
        '/api/users/me/tokens', body,
      ),
    onSuccess: () => {
      toast.success('PAT created');
      qc.invalidateQueries({ queryKey: queryKeys.myTokens });
    },
    onError: (err: Error) => toast.error(`Create failed: ${err.message}`),
  });
}

export function useRevokeMyToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/users/me/tokens/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success('PAT revoked');
      qc.invalidateQueries({ queryKey: queryKeys.myTokens });
    },
    onError: (err: Error) => toast.error(`Revoke failed: ${err.message}`),
  });
}
