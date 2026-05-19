import { Gauge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { useRateLimit } from './api';

export function RateLimitPage() {
  const { data, isLoading } = useRateLimit();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rate Limit</h1>
        <p className="mt-1 text-sm text-muted-foreground">Read-only view of the gateway's rate-limit configuration</p>
      </div>

      {isLoading ? null : !data ? (
        <EmptyState icon={Gauge} title="Rate limiter unavailable" description="The /api/rate-limit/status endpoint did not respond." />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Enabled</span>
                {data.enabled ? <Badge variant="secondary">on</Badge> : <Badge variant="outline">off</Badge>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Backend</span>
                <code className="font-mono text-xs">{data.backend}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Default limit</span>
                <code className="font-mono text-xs">{data.default}</code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Rules</span>
                <Badge variant="secondary">{data.rules.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.rules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No per-principal or per-tool overrides — every caller uses the default limit.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.rules.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      {r.principalType && <Badge variant="outline" className="font-mono text-[10px]">{r.principalType}</Badge>}
                      {r.principalId && <code className="font-mono text-xs">{r.principalId}</code>}
                      {r.tool && <code className="font-mono text-xs text-primary">tool:{r.tool}</code>}
                      <span className="ml-auto text-muted-foreground">→</span>
                      <code className="font-mono text-xs">{r.limit}</code>
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
