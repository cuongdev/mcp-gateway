import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPut } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { PromptSummary } from '@/types/api';

export function usePrompts(opts: { enabledOnly?: boolean } = {}) {
  return useQuery({
    queryKey: opts.enabledOnly ? ['prompts', { enabled: true }] : queryKeys.prompts,
    queryFn: () => api<{ prompts: PromptSummary[] }>(
      `/api/prompts${opts.enabledOnly ? '?enabled=true' : ''}`,
    ),
  });
}

export function useTogglePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiPut<{ ok: true }>(`/api/prompts/${encodeURIComponent(name)}/${enabled ? 'enable' : 'disable'}`),
    onSuccess: (_d, { name, enabled }) => {
      toast.success(`"${name}" ${enabled ? 'enabled' : 'disabled'}`);
      qc.invalidateQueries({ queryKey: queryKeys.prompts });
    },
    onError: (err: Error) => toast.error(`Toggle failed: ${err.message}`),
  });
}
