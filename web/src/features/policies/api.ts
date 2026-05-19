import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Policy, RoleBinding } from '@/types/api';

export function usePolicies() {
  return useQuery({
    queryKey: queryKeys.policies,
    queryFn: () => api<{ policies: Policy[] }>('/api/policies'),
  });
}

export function useRoleBindings() {
  return useQuery({
    queryKey: queryKeys.roles,
    queryFn: () => api<{ bindings: RoleBinding[] }>('/api/roles'),
  });
}

export function useAddPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sub: string; obj: string; act: string }) =>
      apiPost<{ added: boolean }>('/api/policies', body),
    onSuccess: () => {
      toast.success('Policy added');
      qc.invalidateQueries({ queryKey: queryKeys.policies });
    },
    onError: (err: Error) => toast.error(`Add failed: ${err.message}`),
  });
}

export function useRemovePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sub: string; obj: string; act: string }) =>
      api<{ removed: boolean }>('/api/policies', { method: 'DELETE', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Policy removed');
      qc.invalidateQueries({ queryKey: queryKeys.policies });
    },
    onError: (err: Error) => toast.error(`Remove failed: ${err.message}`),
  });
}

export function useReloadPolicies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ message: string }>('/api/policies/reload'),
    onSuccess: () => {
      toast.success('Policies reloaded from file');
      qc.invalidateQueries({ queryKey: queryKeys.policies });
      qc.invalidateQueries({ queryKey: queryKeys.roles });
    },
    onError: (err: Error) => toast.error(`Reload failed: ${err.message}`),
  });
}

export function useAddRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { user: string; role: string }) =>
      apiPost<{ added: boolean }>('/api/roles', body),
    onSuccess: () => {
      toast.success('Role assigned');
      qc.invalidateQueries({ queryKey: queryKeys.roles });
    },
    onError: (err: Error) => toast.error(`Assign failed: ${err.message}`),
  });
}

export function useRemoveRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { user: string; role: string }) =>
      api<{ removed: boolean }>('/api/roles', { method: 'DELETE', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('Role binding removed');
      qc.invalidateQueries({ queryKey: queryKeys.roles });
    },
    onError: (err: Error) => toast.error(`Remove failed: ${err.message}`),
  });
}
