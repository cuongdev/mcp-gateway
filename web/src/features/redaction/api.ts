import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiPost, apiPatch, apiDelete } from '@/lib/api';
import type { RedactionRule, RedactionFinding, RedactionTestResult, RedactionStats, RedactionMode } from './types';

const RULES_KEY = ['redaction', 'rules'] as const;
const STATS_KEY = ['redaction', 'stats'] as const;
const findingsKey = (params: Record<string, string | number | undefined>) => ['redaction', 'findings', params] as const;

export function useRedactionRules() {
  return useQuery({
    queryKey: RULES_KEY,
    queryFn: () => api<{ rules: RedactionRule[] }>('/api/redaction/rules'),
  });
}

export function useRedactionFindings(params: { since?: number; ruleId?: string; serverName?: string; scope?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: findingsKey(params as Record<string, string | number | undefined>),
    queryFn: () => {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') search.set(k, String(v));
      return api<{ findings: RedactionFinding[] }>(`/api/redaction/findings?${search}`);
    },
  });
}

export function useRedactionStats() {
  return useQuery({
    queryKey: STATS_KEY,
    queryFn: () => api<RedactionStats>('/api/redaction/stats'),
  });
}

export function useCreateRedactionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; kind: string; pattern: string; mode: RedactionMode; replacement?: string; scopeRequest?: boolean; scopeResponse?: boolean }) =>
      apiPost<{ rule: RedactionRule }>('/api/redaction/rules', body),
    onSuccess: (data) => { toast.success(`Rule "${data.rule.name}" created`); qc.invalidateQueries({ queryKey: RULES_KEY }); },
    onError: (err: Error) => toast.error(`Create failed: ${err.message}`),
  });
}

export function useUpdateRedactionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<{ mode: RedactionMode; enabled: boolean; pattern: string; replacement: string }> }) =>
      apiPatch<{ rule: RedactionRule }>(`/api/redaction/rules/${encodeURIComponent(id)}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: RULES_KEY }); },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteRedactionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/redaction/rules/${encodeURIComponent(id)}`),
    onSuccess: () => { toast.success('Rule deleted'); qc.invalidateQueries({ queryKey: RULES_KEY }); },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });
}

export function useRedactionTest() {
  return useMutation({
    mutationFn: (body: { text: string; ruleIds?: string[]; scope?: 'request' | 'response' }) =>
      apiPost<RedactionTestResult>('/api/redaction/test', body),
  });
}
