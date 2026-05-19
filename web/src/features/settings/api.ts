import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { GatewayConfig } from '@/types/api';

interface SystemInfo {
  version: string | null;
  startedAt: string | null;
  config: GatewayConfig;
}

export function useSystemInfo() {
  return useQuery({
    queryKey: queryKeys.systemInfo,
    queryFn: () => api<SystemInfo>('/api/system/info'),
  });
}
