import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, ServerCog, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/stat-card';
import { EmptyState } from '@/components/empty-state';

type Outcome = 'success' | 'client_refused' | 'timeout' | 'error' | 'method_not_supported';

interface SamplingEntry {
  id: string;
  requestId: string;
  upstreamServer: string;
  clientSessionId: string;
  principalId: string | null;
  method: string;
  requestPayloadHash: string;
  responsePayloadHash: string | null;
  latencyMs: number | null;
  outcome: Outcome;
  occurredAt: number;
}

const OUTCOME_TONE: Record<Outcome, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  success: 'secondary',
  client_refused: 'outline',
  timeout: 'destructive',
  error: 'destructive',
  method_not_supported: 'outline',
};

function ago(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function SamplingLogPage() {
  const [serverFilter, setServerFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | 'sampling/createMessage' | 'roots/list'>('all');
  // Stabilize `since` across re-renders so the sampling-log queryKey is stable —
  // recomputing Date.now() every render changes the key and causes an infinite
  // refetch loop (the list never leaves its "Loading…" state).
  const since = useMemo(() => Date.now() - 24 * 3600 * 1000, []);

  const entriesQ = useQuery({
    queryKey: ['sampling-log', { since, server: serverFilter, method: methodFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('since', String(since));
      params.set('limit', '200');
      if (serverFilter) params.set('serverName', serverFilter);
      if (methodFilter !== 'all') params.set('method', methodFilter);
      return api<{ entries: SamplingEntry[] }>(`/api/sampling-log?${params}`);
    },
    refetchInterval: 30_000,
  });

  const statsQ = useQuery({
    queryKey: ['sampling-log', 'stats'],
    queryFn: () => api<{ totalSince: number; byOutcome: Array<{ outcome: Outcome; count: number }>; byServer: Array<{ serverName: string; count: number }> }>('/api/sampling-log/stats'),
    refetchInterval: 30_000,
  });

  const entries = entriesQ.data?.entries ?? [];
  const stats = statsQ.data;
  const topOutcome = stats?.byOutcome[0];
  const topServer = stats?.byServer[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sampling Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Audit trail of reverse-channel requests (sampling/createMessage, roots/list). Full reverse-channel multiplexer ships in v0.9; v0.8 logs every attempt for visibility.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Attempts (24h)" value={(stats?.totalSince ?? 0).toLocaleString()} icon={ScrollText} />
        <StatCard label="Top outcome" value={topOutcome?.outcome ?? '—'} icon={AlertTriangle} />
        <StatCard label="Top server" value={topServer?.serverName ?? '—'} icon={ServerCog} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Server</Label>
              <Input placeholder="filter by server" value={serverFilter} onChange={(e) => setServerFilter(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={methodFilter} onValueChange={(v) => setMethodFilter(v as typeof methodFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="sampling/createMessage">sampling/createMessage</SelectItem>
                  <SelectItem value="roots/list">roots/list</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {entriesQ.isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : entries.length === 0 ? (
            <EmptyState icon={ScrollText} title="No sampling attempts logged" description="When clients invoke sampling/createMessage or roots/list, attempts appear here." />
          ) : (
            <div className="divide-y">
              <div className="grid grid-cols-12 gap-3 px-4 py-2 border-b text-xs font-medium text-muted-foreground">
                <div className="col-span-2">Time</div>
                <div className="col-span-3">Method</div>
                <div className="col-span-2">Server</div>
                <div className="col-span-2">Outcome</div>
                <div className="col-span-2">Principal</div>
                <div className="col-span-1 text-right">Latency</div>
              </div>
              {entries.map((e) => (
                <div key={e.id} className="grid grid-cols-12 gap-3 px-4 py-2 items-center text-sm">
                  <div className="col-span-2 text-xs text-muted-foreground tabular-nums" title={new Date(e.occurredAt).toLocaleString()}>
                    {ago(e.occurredAt)}
                  </div>
                  <div className="col-span-3"><code className="text-xs font-mono">{e.method}</code></div>
                  <div className="col-span-2 truncate"><code className="text-xs">{e.upstreamServer}</code></div>
                  <div className="col-span-2">
                    <Badge variant={OUTCOME_TONE[e.outcome]} className="text-xs">{e.outcome}</Badge>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground truncate">
                    {e.principalId ?? '—'}
                  </div>
                  <div className="col-span-1 text-right text-xs tabular-nums">
                    {e.latencyMs == null ? '—' : `${e.latencyMs}ms`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
