import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { useMetrics, parseMetric } from './api';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

const HISTORY_LENGTH = 30;
const TRACKED = [
  'mcp_tool_calls_total',
  'mcp_tool_errors_total',
  'mcp_session_active',
];

interface Sample { ts: number; value: number }

export function MetricsPage() {
  const { data, isLoading, error, dataUpdatedAt } = useMetrics();
  const [history, setHistory] = useState<Record<string, Sample[]>>({});

  useEffect(() => {
    if (!data) return;
    const ts = Date.now();
    setHistory((prev) => {
      const next = { ...prev };
      for (const name of TRACKED) {
        const value = parseMetric(data, name);
        if (value !== null) {
          const arr = [...(prev[name] ?? []), { ts, value }];
          next[name] = arr.slice(-HISTORY_LENGTH);
        }
      }
      return next;
    });
  }, [data, dataUpdatedAt]);

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Metrics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Prometheus exposition + selected counters over time</p>
        </div>
        <Badge variant="outline" className="text-xs">Last fetched {lastUpdated} · polling 10s</Badge>
      </div>

      {isLoading ? null : error || !data ? (
        <EmptyState icon={Activity} title="Metrics unavailable" description="The /api/metrics endpoint did not respond. Metrics may be disabled in gateway config." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {TRACKED.map((name) => (
              <Card key={name}>
                <CardHeader>
                  <CardTitle className="break-all text-xs font-mono">{name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">
                    {history[name]?.[history[name].length - 1]?.value.toLocaleString() ?? '—'}
                  </div>
                  {(history[name]?.length ?? 0) > 1 && (
                    <ResponsiveContainer width="100%" height={50}>
                      <AreaChart data={history[name]}>
                        <defs>
                          <linearGradient id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="ts" hide />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }}
                          labelFormatter={(ts) => new Date(ts as number).toLocaleTimeString()}
                        />
                        <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill={`url(#grad-${name})`} strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Raw exposition</span>
                <Badge variant="outline" className="text-xs">{data.split('\n').length} lines</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded bg-muted p-3 font-mono text-[10px] leading-relaxed">{data}</pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
