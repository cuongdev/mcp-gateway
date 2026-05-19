import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPatch, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Tenant } from '@/types/api';

export function useTenants() {
  return useQuery({
    queryKey: queryKeys.tenants,
    queryFn: () => api<{ tenants: Tenant[] }>('/api/system/tenants'),
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { slug: string; displayName: string; plan?: string; metadata?: Record<string, unknown> }) =>
      apiPost<Tenant>('/api/system/tenants', body),
    onSuccess: (t) => {
      toast.success(`Tenant "${t.displayName}" created`);
      qc.invalidateQueries({ queryKey: queryKeys.tenants });
    },
    onError: (err: Error) => toast.error(`Create failed: ${err.message}`),
  });
}

export function usePatchTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; displayName?: string; plan?: string; metadata?: Record<string, unknown> }) =>
      apiPatch<{ ok: true }>(`/api/system/tenants/${encodeURIComponent(input.id)}`, {
        displayName: input.displayName, plan: input.plan, metadata: input.metadata,
      }),
    onSuccess: () => {
      toast.success('Tenant updated');
      qc.invalidateQueries({ queryKey: queryKeys.tenants });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useSuspendTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<{ ok: true }>(`/api/system/tenants/${encodeURIComponent(id)}/suspend`),
    onSuccess: () => {
      toast.success('Tenant suspended');
      qc.invalidateQueries({ queryKey: queryKeys.tenants });
    },
    onError: (err: Error) => toast.error(`Suspend failed: ${err.message}`),
  });
}

export function useResumeTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<{ ok: true }>(`/api/system/tenants/${encodeURIComponent(id)}/resume`),
    onSuccess: () => {
      toast.success('Tenant resumed');
      qc.invalidateQueries({ queryKey: queryKeys.tenants });
    },
    onError: (err: Error) => toast.error(`Resume failed: ${err.message}`),
  });
}
