import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiDelete, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Webhook } from '@/types/api';

export function useWebhooks() {
  return useQuery({
    queryKey: queryKeys.webhooks,
    queryFn: () => api<{ webhooks: Webhook[] }>('/api/webhooks'),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; url: string; secret?: string; events: string[] }) =>
      apiPost<Webhook>('/api/webhooks', body),
    onSuccess: () => {
      toast.success('Webhook created');
      qc.invalidateQueries({ queryKey: queryKeys.webhooks });
    },
    onError: (err: Error) => toast.error(`Create failed: ${err.message}`),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/webhooks/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success('Webhook deleted');
      qc.invalidateQueries({ queryKey: queryKeys.webhooks });
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });
}

export function useWebhookEvents() {
  return useQuery({
    queryKey: ['webhooks', 'events'] as const,
    queryFn: () => api<{ events: string[] }>('/api/webhooks/events'),
    staleTime: 60 * 60 * 1000,  // 1 hour
  });
}
