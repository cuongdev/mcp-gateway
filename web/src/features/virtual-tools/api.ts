import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPost, apiPatch, apiDelete } from '@/lib/api';
import type { VirtualToolPlan, VirtualToolSummary, TestResult, ValidationResult } from './types';

const KEY = ['virtual-tools'] as const;

export function useVirtualTools() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<{ tools: VirtualToolSummary[] }>('/api/virtual-tools'),
  });
}

export function useVirtualTool(name: string | undefined) {
  return useQuery({
    queryKey: ['virtual-tool', name],
    queryFn: () => api<{ tool: { canonicalName: string; description: string; plan: VirtualToolPlan; enabled: boolean } }>(`/api/virtual-tools/${encodeURIComponent(name!)}`),
    enabled: !!name,
  });
}

export function useCreateVirtualTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: VirtualToolPlan) => apiPost('/api/virtual-tools', plan),
    onSuccess: () => { toast.success('Virtual tool created'); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(`Create failed: ${e.message}`),
  });
}

export function useUpdateVirtualTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, plan }: { name: string; plan: VirtualToolPlan }) =>
      apiPatch(`/api/virtual-tools/${encodeURIComponent(name)}`, plan),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(`Update failed: ${e.message}`),
  });
}

export function useDeleteVirtualTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiDelete(`/api/virtual-tools/${encodeURIComponent(name)}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });
}

export function useValidatePlan() {
  return useMutation({
    mutationFn: (plan: unknown) => apiPost<ValidationResult>('/api/virtual-tools/validate', { plan }),
  });
}

export function useTestVirtualTool(name: string | undefined) {
  return useMutation({
    mutationFn: (args: unknown) => apiPost<TestResult>(`/api/virtual-tools/${encodeURIComponent(name!)}/test`, { args }),
  });
}
