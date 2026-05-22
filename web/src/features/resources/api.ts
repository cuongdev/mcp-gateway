import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPost, apiPut } from '@/lib/api';
import type { ResourceSummary, ResourceContents } from './types';

const RES_KEY = ['resources'] as const;

export function useResources() {
  return useQuery({
    queryKey: RES_KEY,
    queryFn: () => api<{ resources: ResourceSummary[] }>('/api/resources'),
  });
}

export function useReadResource() {
  return useMutation({
    mutationFn: ({ canonical }: { canonical: string }) =>
      apiPost<ResourceContents>(`/api/resources/${encodeURIComponent(canonical)}/read`),
    onError: (e: Error) => toast.error(`Read failed: ${e.message}`),
  });
}

export function useSetResourceEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ canonical, enabled }: { canonical: string; enabled: boolean }) =>
      apiPut(`/api/resources/${encodeURIComponent(canonical)}/${enabled ? 'enable' : 'disable'}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: RES_KEY }); },
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });
}
