import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPatch, apiPost, apiPut } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ToolSummary } from '@/types/api';

export function useTools(opts: { all: boolean } = { all: true }) {
  return useQuery({
    queryKey: queryKeys.tools(opts),
    queryFn: () => api<{ tools: ToolSummary[]; total: number }>(`/api/tools?all=${opts.all}`),
  });
}

export function useToggleTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiPut<{ tool: string; enabled: boolean }>(
        `/api/tools/${encodeURIComponent(name)}/${enabled ? 'enable' : 'disable'}`,
      ),
    onSuccess: (_d, { name, enabled }) => {
      toast.success(`"${name}" ${enabled ? 'enabled' : 'disabled'}`);
      qc.invalidateQueries({ queryKey: queryKeys.tools() });
    },
    onError: (err: Error) => toast.error(`Toggle failed: ${err.message}`),
  });
}

export interface ToolCallResult { result?: unknown; error?: unknown }

/** Test-invoke a tool through its upstream (admin playground). */
export function useCallTool() {
  return useMutation({
    mutationFn: (input: { name: string; args: Record<string, unknown> }) =>
      apiPost<ToolCallResult>(`/api/tools/${encodeURIComponent(input.name)}/call`, { arguments: input.args }),
    onError: (err: Error) => toast.error(`Call failed: ${err.message}`),
  });
}

export function usePatchTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      cacheable?: boolean;
      cacheTtlSec?: number | null;
      cachePerPrincipal?: boolean;
      sensitive?: boolean;
    }) => apiPatch<{ ok: true }>(`/api/tools/${encodeURIComponent(input.name)}`, {
      cacheable: input.cacheable,
      cacheTtlSec: input.cacheTtlSec,
      cachePerPrincipal: input.cachePerPrincipal,
      sensitive: input.sensitive,
    }),
    onSuccess: (_d, input) => {
      toast.success(`"${input.name}" updated`);
      qc.invalidateQueries({ queryKey: queryKeys.tools() });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}
