import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiDelete, apiPatch, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { McpClient } from '@/types/api';

interface CreateResponse {
  principalId: string;
  tokenId: string;
  token: string;
  name: string;
  allowedServers: string[];
}

export function useMcpClients() {
  return useQuery({
    queryKey: queryKeys.mcpClients,
    queryFn: () => api<{ clients: McpClient[] }>('/api/mcp-clients'),
  });
}

export function useCreateMcpClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; allowedServers?: string[] }) =>
      apiPost<CreateResponse>('/api/mcp-clients', body),
    onSuccess: (data) => {
      toast.success(`MCP Client "${data.name}" created`);
      qc.invalidateQueries({ queryKey: queryKeys.mcpClients });
    },
    onError: (err: Error) => toast.error(`Create failed: ${err.message}`),
  });
}

export function usePatchMcpClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; allowedServers?: string[]; disabled?: boolean; description?: string }) =>
      apiPatch<{ ok: true }>(`/api/mcp-clients/${encodeURIComponent(input.id)}`, {
        allowedServers: input.allowedServers, disabled: input.disabled, description: input.description,
      }),
    onSuccess: () => {
      toast.success('MCP Client updated');
      qc.invalidateQueries({ queryKey: queryKeys.mcpClients });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteMcpClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/mcp-clients/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success('MCP Client deleted');
      qc.invalidateQueries({ queryKey: queryKeys.mcpClients });
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });
}

export function useRotateMcpClientToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ tokenId: string; token: string }>(`/api/mcp-clients/${encodeURIComponent(id)}/tokens/rotate`),
    onSuccess: () => {
      toast.success('Token rotated');
      qc.invalidateQueries({ queryKey: queryKeys.mcpClients });
    },
    onError: (err: Error) => toast.error(`Rotate failed: ${err.message}`),
  });
}
