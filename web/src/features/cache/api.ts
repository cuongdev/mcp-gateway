import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useInvalidateCache() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { tool?: string; principal?: string }) =>
      apiPost<{ ok: true; invalidated: number }>('/api/cache/invalidate', body),
    onSuccess: (data) => {
      toast.success(`Invalidated ${data.invalidated} cache entr${data.invalidated === 1 ? 'y' : 'ies'}`);
      qc.invalidateQueries({ queryKey: queryKeys.tools() });
    },
    onError: (err: Error) => toast.error(`Invalidate failed: ${err.message}`),
  });
}
