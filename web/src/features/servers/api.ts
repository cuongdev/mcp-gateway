import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiDelete, apiPatch, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { RegisterServerBody, ServerSummary } from '@/types/api';

export function useServers() {
  return useQuery({
    queryKey: queryKeys.servers,
    queryFn: () => api<{ servers: ServerSummary[] }>('/api/servers'),
  });
}

export function useRegisterServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterServerBody) =>
      apiPost<{ server: string; tools: string[]; warning?: string }>('/api/servers', body),
    onSuccess: (data) => {
      toast.success(
        data.warning
          ? `Server "${data.server}" registered (${data.warning})`
          : `Server "${data.server}" registered with ${data.tools.length} tools`,
      );
      qc.invalidateQueries({ queryKey: queryKeys.servers });
      qc.invalidateQueries({ queryKey: queryKeys.tools() });
    },
    onError: (err: Error) => toast.error(`Register failed: ${err.message}`),
  });
}

export function useSyncServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPost<{ tools: string[] }>(`/api/servers/${encodeURIComponent(name)}/sync`),
    onSuccess: (data, name) => {
      toast.success(`"${name}" synced: ${data.tools.length} tools`);
      qc.invalidateQueries({ queryKey: queryKeys.servers });
      qc.invalidateQueries({ queryKey: queryKeys.tools() });
    },
    onError: (err: Error) => toast.error(`Sync failed: ${err.message}`),
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiDelete<{ ok: true }>(`/api/servers/${encodeURIComponent(name)}`),
    onSuccess: (_d, name) => {
      toast.success(`"${name}" removed`);
      qc.invalidateQueries({ queryKey: queryKeys.servers });
      qc.invalidateQueries({ queryKey: queryKeys.tools() });
    },
    onError: (err: Error) => toast.error(`Remove failed: ${err.message}`),
  });
}

export function usePatchServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; enabled?: boolean; proxyName?: string | null }) =>
      apiPatch<{ ok: true }>(`/api/servers/${encodeURIComponent(input.name)}`, {
        enabled: input.enabled, proxyName: input.proxyName,
      }),
    onSuccess: (_d, input) => {
      toast.success(`"${input.name}" updated`);
      qc.invalidateQueries({ queryKey: queryKeys.servers });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}
