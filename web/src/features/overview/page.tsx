import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Server, Wrench, LayoutGrid, Zap, ShieldAlert, Boxes, ZapOff } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { StatCard } from '@/components/stat-card';
import { StatusDot } from '@/components/status-dot';
import { EmptyState } from '@/components/empty-state';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ServerSummary, ToolSummary, GroupSummary, UsageResponse } from '@/types/api';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function OverviewPage() {
  // Stabilize `since` across re-renders so the /api/usage queryKey doesn't
  // shift each tick and trigger needless refetches. Once-per-mount is fine
  // for a 24h aggregate.
  const since = useMemo(() => Date.now() - ONE_DAY_MS, []);
  const [serversQ, toolsQ, groupsQ, usageQ, circuitsQ, redactionStatsQ, installsQ] = useQueries({
    queries: [
      { queryKey: queryKeys.servers, queryFn: () => api<{ servers: ServerSummary[] }>('/api/servers') },
      { queryKey: queryKeys.tools(), queryFn: () => api<{ tools: ToolSummary[]; total: number }>('/api/tools') },
      { queryKey: queryKeys.groups, queryFn: () => api<{ groups: GroupSummary[] }>('/api/groups') },
      {
        queryKey: queryKeys.usage({ since, by: 'tool', action: 'tool.call' }),
        queryFn: () => api<UsageResponse>(`/api/usage?since=${since}&by=tool&action=tool.call`),
      },
      {
        queryKey: ['circuits'],
        queryFn: () => api<{ circuits: Array<{ state: string }> }>('/api/circuits').catch(() => ({ circuits: [] })),
        refetchInterval: 30_000,
      },
      {
        queryKey: ['redaction', 'stats'],
        queryFn: () => api<{ totalLast24h: number }>('/api/redaction/stats').catch(() => ({ totalLast24h: 0 })),
        refetchInterval: 30_000,
      },
      {
        queryKey: ['catalog', 'installs'],
        queryFn: () => api<{ installs: Array<{ updateAvailable: boolean }> }>('/api/catalog/installs').catch(() => ({ installs: [] })),
        refetchInterval: 60_000,
      },
    ],
  });

  const servers = serversQ.data?.servers ?? [];
  const toolTotal = toolsQ.data?.total ?? 0;
  const groupCount = groupsQ.data?.groups.length ?? 0;
  const usage = usageQ.data?.series ?? [];
  const reqTotal = usage.reduce((acc, b) => acc + b.total, 0);
  const openCircuits = (circuitsQ.data?.circuits ?? []).filter((c) => c.state === 'circuit_open' || c.state === 'quarantined').length;
  const findings24h = redactionStatsQ.data?.totalLast24h ?? 0;
  const updatesAvailable = (installsQ.data?.installs ?? []).filter((i) => i.updateAvailable).length;

  // Crude hourly sparkline from /usage 24h aggregate by tool — we don't have
  // per-hour buckets in Phase A; show top tools as bar substitute.
  const topTools = [...usage].sort((a, b) => b.total - a.total).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Operational summary across the gateway</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="MCP Servers" value={servers.length} icon={Server} tone="primary" />
        <StatCard label="Registered Tools" value={toolTotal} icon={Wrench} tone="default" />
        <StatCard label="Tool Groups" value={groupCount} icon={LayoutGrid} tone="success" />
        <StatCard label="Tool calls (24h)" value={reqTotal.toLocaleString()} icon={Zap} tone="warning" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Open circuits" value={openCircuits} icon={ZapOff} tone={openCircuits > 0 ? 'danger' : 'default'} />
        <StatCard label="Redaction findings (24h)" value={findings24h.toLocaleString()} icon={ShieldAlert} tone={findings24h > 0 ? 'warning' : 'default'} />
        <StatCard label="Catalog updates available" value={updatesAvailable} icon={Boxes} tone={updatesAvailable > 0 ? 'warning' : 'default'} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Top tools (24h)</CardTitle></CardHeader>
        <CardContent>
          {topTools.length === 0 ? (
            <EmptyState icon={Zap} title="No usage data yet" description="Once tools start running, top tools by call volume will appear here." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={topTools.map((b) => ({ name: b.key, total: b.total }))}>
                <defs>
                  <linearGradient id="ovBrand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#ovBrand)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Server status</CardTitle></CardHeader>
        <CardContent>
          {servers.length === 0 ? (
            <EmptyState icon={Server} title="No servers registered" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Tools</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="secondary">{s.tools.length} tools</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusDot ok={s.session} />
                        <span className="text-sm">{s.session ? 'Connected' : 'Offline'}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
