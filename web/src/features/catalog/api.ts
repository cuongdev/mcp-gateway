import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPost, apiDelete } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ConnectorTemplate, InstalledConnector, InstallResult, InstallOptions } from './types';

const CONNECTORS_KEY = ['catalog', 'connectors'] as const;
const INSTALLS_KEY = ['catalog', 'installs'] as const;

export function useConnectors() {
  return useQuery({
    queryKey: CONNECTORS_KEY,
    queryFn: () => api<{ connectors: ConnectorTemplate[] }>('/api/catalog/connectors'),
    staleTime: 60_000,
  });
}

export function useConnector(id: string | undefined) {
  return useQuery({
    queryKey: ['catalog', 'connector', id],
    queryFn: () => api<{ connector: ConnectorTemplate }>(`/api/catalog/connectors/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}

export function useInstalls() {
  return useQuery({
    queryKey: INSTALLS_KEY,
    queryFn: () => api<{ installs: InstalledConnector[] }>('/api/catalog/installs'),
  });
}

export function useInstallConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { connectorId: string; name: string; env: Record<string, string>; args?: Record<string, unknown>; options?: InstallOptions }) =>
      apiPost<InstallResult>('/api/catalog/install', body),
    onSuccess: (data) => {
      toast.success(`Installed "${data.server}" — ${data.capabilitiesDiscovered} capabilities discovered`);
      qc.invalidateQueries({ queryKey: INSTALLS_KEY });
      qc.invalidateQueries({ queryKey: queryKeys.servers });
      qc.invalidateQueries({ queryKey: queryKeys.tools() });
    },
    onError: (err: Error) => toast.error(`Install failed: ${err.message}`),
  });
}

export function useUninstallConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/catalog/installs/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success('Uninstalled');
      qc.invalidateQueries({ queryKey: INSTALLS_KEY });
      qc.invalidateQueries({ queryKey: queryKeys.servers });
    },
    onError: (err: Error) => toast.error(`Uninstall failed: ${err.message}`),
  });
}
