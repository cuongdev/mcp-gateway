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

export interface ImportedServer {
  name: string;
  transport: { type: string; command?: string; url?: string; args?: string[]; env?: Record<string, string>; headers?: Record<string, string> };
  warnings: string[];
}
export interface ImportPreview {
  source: string | null;
  servers: ImportedServer[];
  warnings: string[];
}
export interface ImportResults {
  source: string | null;
  results: Array<{ name: string; ok: boolean; tools?: string[]; warning?: string; error?: string }>;
  warnings: string[];
}

/** Dry-run: parse a client config and return the detected servers for preview. */
export function useImportPreview() {
  return useMutation({
    mutationFn: (config: string) => apiPost<ImportPreview>('/api/servers/import', { config, dryRun: true }),
    onError: (e: Error) => toast.error(`Parse failed: ${e.message}`),
  });
}

/** Register the selected servers from a client config. */
export function useImportServers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { config: string; only: string[] }) =>
      apiPost<ImportResults>('/api/servers/import', { config: input.config, only: input.only }),
    onSuccess: (data) => {
      const okCount = data.results.filter((r) => r.ok).length;
      const failCount = data.results.length - okCount;
      toast.success(`Imported ${okCount} server${okCount === 1 ? '' : 's'}${failCount ? `, ${failCount} failed` : ''}`);
      qc.invalidateQueries({ queryKey: queryKeys.servers });
      qc.invalidateQueries({ queryKey: queryKeys.tools() });
    },
    onError: (e: Error) => toast.error(`Import failed: ${e.message}`),
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
