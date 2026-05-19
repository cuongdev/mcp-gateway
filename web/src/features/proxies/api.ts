import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiDelete, apiPatch, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Proxy, ProxyReference } from '@/types/api';

export function useProxies() {
  return useQuery({
    queryKey: queryKeys.proxies,
    queryFn: () => api<{ proxies: Proxy[] }>('/api/proxies'),
  });
}

export function useProxyReferences(id: string | undefined) {
  return useQuery({
    queryKey: id ? queryKeys.proxyReferences(id) : ['proxy', 'none', 'references'],
    queryFn: () => api<{ references: ProxyReference[] }>(`/api/proxies/${encodeURIComponent(id!)}/references`),
    enabled: !!id,
  });
}

export function useCreateProxy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; url: string; description?: string }) =>
      apiPost<Proxy>('/api/proxies', body),
    onSuccess: (p) => {
      toast.success(`Proxy "${p.name}" created`);
      qc.invalidateQueries({ queryKey: queryKeys.proxies });
    },
    onError: (err: Error) => toast.error(`Create failed: ${err.message}`),
  });
}

export function usePatchProxy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; url?: string; description?: string; enabled?: boolean }) =>
      apiPatch<{ ok: true }>(`/api/proxies/${encodeURIComponent(input.id)}`, {
        url: input.url, description: input.description, enabled: input.enabled,
      }),
    onSuccess: () => {
      toast.success('Proxy updated');
      qc.invalidateQueries({ queryKey: queryKeys.proxies });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteProxy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; force?: boolean }) =>
      apiDelete<{ ok: true; detached?: ProxyReference[] }>(
        `/api/proxies/${encodeURIComponent(input.id)}${input.force ? '?force=true' : ''}`,
      ),
    onSuccess: (data) => {
      if (data.detached && data.detached.length > 0) {
        toast.success(`Proxy deleted, detached from ${data.detached.length} reference${data.detached.length === 1 ? '' : 's'}`);
      } else {
        toast.success('Proxy deleted');
      }
      qc.invalidateQueries({ queryKey: queryKeys.proxies });
      qc.invalidateQueries({ queryKey: queryKeys.servers });
      qc.invalidateQueries({ queryKey: queryKeys.groups });
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });
}
