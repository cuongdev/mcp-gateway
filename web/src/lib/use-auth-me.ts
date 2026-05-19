import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { queryKeys } from './query-keys';
import type { AuthMe } from '@/types/api';

/**
 * Single source of truth for the current authenticated principal.
 * AuthGate populates this on mount; consumers read from the cache.
 *
 * Returns `null` (not undefined) when unauthenticated. While loading,
 * `data` is `undefined`.
 */
export function useAuthMe() {
  return useQuery<AuthMe | null>({
    queryKey: queryKeys.authMe,
    queryFn: async () => {
      try {
        return await api<AuthMe>('/auth/me', { silent401: true });
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}
