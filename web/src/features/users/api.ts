import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiDelete, apiPatch, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { User } from '@/types/api';

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api<{ users: User[] }>('/api/users'),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; displayName: string }) =>
      apiPost<User>('/api/users', body),
    onSuccess: (u) => {
      toast.success(`User "${u.displayName}" created`);
      qc.invalidateQueries({ queryKey: queryKeys.users });
    },
    onError: (err: Error) => toast.error(`Create failed: ${err.message}`),
  });
}

export function usePatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; disabled: boolean }) =>
      apiPatch<{ ok: true }>(`/api/users/${encodeURIComponent(input.id)}`, { disabled: input.disabled }),
    onSuccess: (_d, input) => {
      toast.success(`User ${input.disabled ? 'disabled' : 'enabled'}`);
      qc.invalidateQueries({ queryKey: queryKeys.users });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; hard: boolean }) =>
      apiDelete<{ ok: true }>(`/api/users/${encodeURIComponent(input.id)}${input.hard ? '?hard=true' : ''}`),
    onSuccess: (_d, input) => {
      toast.success(input.hard ? 'User hard-deleted' : 'User disabled');
      qc.invalidateQueries({ queryKey: queryKeys.users });
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });
}
