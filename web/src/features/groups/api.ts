import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiDelete, apiPatch, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { GroupDetail } from '@/types/api';

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => api<{ groups: GroupDetail[] }>('/api/groups'),
  });
}

export function useGroup(name: string | undefined) {
  return useQuery({
    queryKey: name ? queryKeys.group(name) : ['group', 'none'],
    queryFn: () => api<{ group: GroupDetail; resolvedTools: string[] }>(`/api/groups/${encodeURIComponent(name!)}`),
    enabled: !!name,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      description?: string;
      tools: string[];
      allowedRoles?: string[];
      allowedUsers?: string[];
      includedServers?: string[];
      excludedTools?: string[];
    }) => apiPost<{ group: GroupDetail }>('/api/groups', body),
    onSuccess: (data) => {
      toast.success(`Group "${data.group.name}" created`);
      qc.invalidateQueries({ queryKey: queryKeys.groups });
    },
    onError: (err: Error) => toast.error(`Create failed: ${err.message}`),
  });
}

export function usePatchGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      tools?: string[];
      includedServers?: string[];
      excludedTools?: string[];
      allowedRoles?: string[];
      allowedUsers?: string[];
      description?: string;
    }) => apiPatch<{ group: GroupDetail }>(`/api/groups/${encodeURIComponent(input.name)}`, {
      tools: input.tools, includedServers: input.includedServers,
      excludedTools: input.excludedTools, allowedRoles: input.allowedRoles,
      allowedUsers: input.allowedUsers, description: input.description,
    }),
    onSuccess: (_d, input) => {
      toast.success(`"${input.name}" updated`);
      qc.invalidateQueries({ queryKey: queryKeys.groups });
      qc.invalidateQueries({ queryKey: queryKeys.group(input.name) });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiDelete<{ ok: true }>(`/api/groups/${encodeURIComponent(name)}`),
    onSuccess: (_d, name) => {
      toast.success(`Group "${name}" deleted`);
      qc.invalidateQueries({ queryKey: queryKeys.groups });
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });
}
