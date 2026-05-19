import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { useUsage } from './api';

type GroupBy = 'tool' | 'principal' | 'server';
type RangePreset = '1h' | '24h' | '7d' | '30d';

const PRESETS: Record<RangePreset, number> = {
  '1h':  60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':   7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function UsagePage() {
  const [by, setBy] = useState<GroupBy>('tool');
  const [preset, setPreset] = useState<RangePreset>('24h');
  const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const id = setInterval(() => setNowMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(id);
  }, []);
  const since = useMemo(() => nowMinute * 60_000 - PRESETS[preset], [preset, nowMinute]);

  const { data } = useUsage({ since, by, action: 'tool.call' });
  const series = data?.series ?? [];

  const totals = useMemo(() => series.reduce(
    (acc, b) => ({ total: acc.total + b.total, success: acc.success + b.success, denied: acc.denied + b.denied, error: acc.error + b.error }),
    { total: 0, success: 0, denied: 0, error: 0 },
  ), [series]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tool-call aggregates over time</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(['1h', '24h', '7d', '30d'] as RangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded ${preset === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <Select value={by} onValueChange={(v) => setBy(v as GroupBy)}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tool">By tool</SelectItem>
              <SelectItem value="principal">By principal</SelectItem>
              <SelectItem value="server">By server</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total calls</div><div className="mt-1 text-2xl font-bold">{totals.total.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Success</div><div className="mt-1 text-2xl font-bold text-green-500">{totals.success.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Denied</div><div className="mt-1 text-2xl font-bold text-amber-500">{totals.denied.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Errors</div><div className="mt-1 text-2xl font-bold text-destructive">{totals.error.toLocaleString()}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Top {by}s · last {preset}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <EmptyState icon={BarChart3} title="No usage data in this range" description="Tool calls will appear here once principals start invoking tools." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={[...series].sort((a, b) => b.total - a.total).slice(0, 12).map((s) => ({ name: s.key, total: s.total, success: s.success, denied: s.denied, error: s.error }))}>
                <defs>
                  <linearGradient id="usageBrand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#usageBrand)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">All {by}s</CardTitle></CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="divide-y divide-border">
              {[...series].sort((a, b) => b.total - a.total).map((s) => (
                <li key={s.key} className="flex items-center justify-between py-2 text-sm">
                  <code className="font-mono">{s.key}</code>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{s.success}<Badge variant="secondary" className="ml-1">ok</Badge></span>
                    {s.denied > 0 && <span>{s.denied}<Badge variant="outline" className="ml-1">deny</Badge></span>}
                    {s.error > 0 && <span>{s.error}<Badge variant="destructive" className="ml-1">err</Badge></span>}
                    <span className="font-medium text-foreground tabular-nums">{s.total}</span>
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
