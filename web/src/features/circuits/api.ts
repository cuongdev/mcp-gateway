import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPost, apiPatch } from '@/lib/api';
import type { CircuitSummary, CircuitConfig } from './types';

const queryKey = ['circuits'] as const;

export function useCircuits() {
  return useQuery({
    queryKey,
    queryFn: () => api<{ circuits: CircuitSummary[] }>('/api/circuits'),
    refetchInterval: 5_000,
  });
}

export function useCircuit(serverName: string | undefined) {
  return useQuery({
    queryKey: ['circuit', serverName],
    queryFn: () => api<{ circuit: CircuitSummary }>(`/api/circuits/${encodeURIComponent(serverName!)}`),
    enabled: !!serverName,
    refetchInterval: 5_000,
  });
}

export function useTripCircuit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ server, reason }: { server: string; reason?: string }) =>
      apiPost(`/api/circuits/${encodeURIComponent(server)}/trip`, { reason: reason ?? 'manual' }),
    onSuccess: (_d, v) => { toast.success(`Tripped circuit for ${v.server}`); qc.invalidateQueries({ queryKey }); },
    onError: (e: Error) => toast.error(`Trip failed: ${e.message}`),
  });
}

export function useCloseCircuit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ server, reason }: { server: string; reason?: string }) =>
      apiPost(`/api/circuits/${encodeURIComponent(server)}/close`, { reason: reason ?? 'manual' }),
    onSuccess: (_d, v) => { toast.success(`Closed circuit for ${v.server}`); qc.invalidateQueries({ queryKey }); },
    onError: (e: Error) => toast.error(`Close failed: ${e.message}`),
  });
}

export function useResetCircuit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ server }: { server: string }) =>
      apiPost(`/api/circuits/${encodeURIComponent(server)}/reset`),
    onSuccess: (_d, v) => { toast.success(`Reset circuit for ${v.server}`); qc.invalidateQueries({ queryKey }); },
    onError: (e: Error) => toast.error(`Reset failed: ${e.message}`),
  });
}

export function useUpdateCircuitConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ server, config }: { server: string; config: Partial<CircuitConfig> }) =>
      apiPatch(`/api/circuits/${encodeURIComponent(server)}/config`, config),
    onSuccess: () => { toast.success('Circuit config updated'); qc.invalidateQueries({ queryKey }); },
    onError: (e: Error) => toast.error(`Update failed: ${e.message}`),
  });
}
