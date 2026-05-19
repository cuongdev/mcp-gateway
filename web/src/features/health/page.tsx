import { HeartPulse } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDot } from '@/components/status-dot';
import { EmptyState } from '@/components/empty-state';
import { useHealth } from './api';

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function statusBadge(status: string) {
  if (status === 'healthy') return <Badge variant="secondary">healthy</Badge>;
  if (status === 'degraded') return <Badge variant="outline">degraded</Badge>;
  return <Badge variant="destructive">unhealthy</Badge>;
}

export function HealthPage() {
  const { data, isLoading, dataUpdatedAt } = useHealth();
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gateway + upstream server status</p>
        </div>
        <Badge variant="outline" className="text-xs">Last checked {lastUpdated} · polling 10s</Badge>
      </div>

      {isLoading ? null : !data ? (
        <EmptyState icon={HeartPulse} title="Health endpoint unreachable" />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Gateway</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Overall</span>{statusBadge(data.status)}</div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Version</span><code className="font-mono text-xs">{data.version}</code></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Uptime</span><code className="font-mono text-xs">{formatUptime(data.uptime)}</code></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Upstream servers</span>
                <Badge variant="secondary">{data.servers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.servers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No registered upstream servers.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.servers.map((s) => (
                    <li key={s.name} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <StatusDot ok={s.status === 'healthy'} />
                        <span className="font-medium">{s.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{s.transport}</Badge>
                      </div>
                      {statusBadge(s.status)}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
