import { useEffect, useMemo, useState } from 'react';
import { ScrollText, ChevronRight } from 'lucide-react';
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

/** One label/value row in the expanded detail panel. */
function DetailRow({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === '') return null;
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <code className="break-all font-mono text-xs">{text}</code>
    </div>
  );
}

/** Expanded detail for one audit event — surfaces the captured metadata. */
function AuditDetail({ metadata }: { metadata?: Record<string, unknown> }) {
  const m = metadata ?? {};
  const authz = m.authorization as { decision?: string; matchedPolicy?: string } | undefined;
  const hasAny =
    m.httpMethod || m.path || m.method || m.toolName || m.targetServer ||
    m.ipAddress || m.userAgent || m.requestId || m.errorCode || m.errorMessage || authz;
  return (
    <div className="mt-2 grid gap-1 rounded-md bg-muted/40 p-3 text-xs sm:grid-cols-2">
      <DetailRow label="HTTP" value={m.httpMethod && m.path ? `${m.httpMethod} ${m.path}${m.httpStatus ? ` → ${m.httpStatus}` : ''}` : undefined} />
      <DetailRow label="MCP method" value={m.method} />
      <DetailRow label="Tool" value={m.toolName} />
      <DetailRow label="Target server" value={m.targetServer} />
      <DetailRow label="Authorization" value={authz ? `${authz.decision ?? '—'}${authz.matchedPolicy ? ` (${authz.matchedPolicy})` : ''}` : undefined} />
      <DetailRow label="IP address" value={m.ipAddress} />
      <DetailRow label="User agent" value={m.userAgent} />
      <DetailRow label="User email" value={m.userEmail} />
      <DetailRow label="Request ID" value={m.requestId} />
      <DetailRow label="Error code" value={m.errorCode} />
      <DetailRow label="Error" value={m.errorMessage} />
      {!hasAny && <span className="text-muted-foreground">No additional metadata recorded.</span>}
    </div>
  );
}

export function AuditPage() {
  const [preset, setPreset] = useState<RangePreset>('24h');
  const [action, setAction] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
              {events.map((e) => {
                const open = expandedId === e.id;
                return (
                  <li key={e.id} className="py-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : e.id)}
                      className="flex w-full items-center justify-between gap-4 text-left"
                    >
                      <div className="flex min-w-0 flex-col">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
                          <code className="font-mono text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</code>
                          <code className="font-mono text-xs text-primary">{e.action}</code>
                          {e.resource && <code className="truncate font-mono text-xs text-foreground/80">{e.resource}</code>}
                        </div>
                        {e.principalId && <span className="pl-5 text-xs text-muted-foreground">by <code className="font-mono">{e.principalId}</code></span>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {resultBadge(e.result)}
                        {e.durationMs !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{e.durationMs}ms</span>}
                      </div>
                    </button>
                    {open && <div className="pl-5"><AuditDetail metadata={e.metadata} /></div>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
