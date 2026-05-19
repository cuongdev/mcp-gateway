import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { AuthProvider } from '@/types/api';

export function useOidcProviders() {
  return useQuery({
    queryKey: queryKeys.authProviders,
    queryFn: () => api<{ providers: AuthProvider[] }>('/auth/providers'),
  });
}
