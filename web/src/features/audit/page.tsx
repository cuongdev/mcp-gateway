import { useEffect, useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { useAuditEvents } from './api';

type RangePreset = '1h' | '24h' | '7d';
type ResultFilter = 'all' | 'success' | 'denied' | 'error';

const PRESETS: Record<RangePreset, number> = {
  '1h':  60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':   7 * 24 * 60 * 60 * 1000,
};

function resultBadge(result: string) {
  if (result === 'success') return <Badge variant="secondary">success</Badge>;
  if (result === 'denied') return <Badge variant="outline">denied</Badge>;
  return <Badge variant="destructive">error</Badge>;
}

export function AuditPage() {
  const [preset, setPreset] = useState<RangePreset>('24h');
  const [action, setAction] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [search, setSearch] = useState('');
  const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60_000));

  useEffect(() => {
    const id = setInterval(() => setNowMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(id);
  }, []);

  const since = useMemo(() => nowMinute * 60_000 - PRESETS[preset], [preset, nowMinute]);

  const { data } = useAuditEvents({
    since,
    action: action || undefined,
    result: resultFilter === 'all' ? undefined : resultFilter,
    limit: 200,
  });
  const events = (data?.events ?? []).filter((e) =>
    search === '' ||
    (e.principalId ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.resource ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Per-event audit log — last {preset}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(['1h', '24h', '7d'] as RangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded ${preset === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <Select value={resultFilter} onValueChange={(v) => setResultFilter(v as ResultFilter)}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="success">success</SelectItem>
              <SelectItem value="denied">denied</SelectItem>
              <SelectItem value="error">error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Search principalId or resource…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Input
          placeholder="Action filter (e.g. tool.call)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {events.length} events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState icon={ScrollText} title="No audit events in this range" description="Events appear here as tools are called and policies are evaluated." />
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</code>
                      <code className="font-mono text-xs text-primary">{e.action}</code>
                      {e.resource && <code className="font-mono text-xs">{e.resource}</code>}
                    </div>
                    {e.principalId && <span className="text-xs text-muted-foreground">by <code className="font-mono">{e.principalId}</code></span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {resultBadge(e.result)}
                    {e.durationMs !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{e.durationMs}ms</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
