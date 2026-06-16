import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/stat-card';
import { ScrollText, ShieldX, ShieldAlert, Shield } from 'lucide-react';
import { useRedactionFindings, useRedactionStats } from './api';
import type { RedactionMode } from './types';

const MODE_TONE: Record<RedactionMode, 'default' | 'destructive' | 'secondary'> = {
  redact: 'default', block: 'destructive', warn: 'secondary',
};
const MODE_ICON: Record<RedactionMode, typeof ShieldX> = {
  redact: Shield, block: ShieldX, warn: ShieldAlert,
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function FindingsTab() {
  const [serverFilter, setServerFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState('');
  const [scope, setScope] = useState<'all' | 'request' | 'response'>('all');
  // Stabilize `since` across re-renders so the findings queryKey is stable —
  // recomputing Date.now() every render changes the key and causes an infinite
  // refetch loop (the list never leaves its "Loading…" state).
  const since = useMemo(() => Date.now() - 24 * 3600 * 1000, []);

  const params = {
    since,
    serverName: serverFilter || undefined,
    ruleId: ruleFilter || undefined,
    scope: scope === 'all' ? undefined : scope,
    limit: 200,
  };

  const { data, isLoading } = useRedactionFindings(params);
  const { data: stats } = useRedactionStats();
  const findings = data?.findings ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Findings 24h" value={(stats?.totalLast24h ?? 0).toLocaleString()} icon={ScrollText} />
        <StatCard label="Top rule" value={stats?.byRule[0]?.ruleName ?? "—"} icon={Shield} />
        <StatCard label="Top server" value={stats?.byServer[0]?.serverName ?? "—"} icon={ShieldAlert} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Server</Label>
              <Input placeholder="github" value={serverFilter} onChange={(e) => setServerFilter(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Rule id</Label>
              <Input placeholder="github_pat" value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'request' | 'response')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="request">Request only</SelectItem>
                  <SelectItem value="response">Response only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : findings.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No findings match the current filters.</div>
          ) : (
            <div className="divide-y">
              {findings.map((f) => {
                const Icon = MODE_ICON[f.mode];
                return (
                  <div key={f.id} className="grid grid-cols-12 items-center gap-3 px-4 py-2 text-sm">
                    <div className="col-span-2 text-xs text-muted-foreground tabular-nums" title={formatRelativeTime(f.occurredAt)}>
                      {formatTime(f.occurredAt)}
                    </div>
                    <div className="col-span-3 truncate">
                      <code className="text-xs font-mono">{f.capabilityName ?? '—'}</code>
                    </div>
                    <div className="col-span-3 truncate">
                      <span className="text-xs">{f.ruleName ?? f.ruleId}</span>
                    </div>
                    <div className="col-span-1">
                      <Badge variant="outline" className="text-xs">{f.scope}</Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={MODE_TONE[f.mode]} className="text-xs"><Icon className="h-3 w-3 mr-1 inline" />{f.mode}</Badge>
                    </div>
                    <div className="col-span-1 text-right text-xs tabular-nums">×{f.matchCount}</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
