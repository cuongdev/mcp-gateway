import { Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { useQuota } from './api';

function pct(used: number, limit?: number): number {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function Bar({ used, limit }: { used: number; limit?: number }) {
  const p = pct(used, limit);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{used.toLocaleString()}</span>
        <span className="text-muted-foreground">{limit ? `/ ${limit.toLocaleString()}` : '/ unlimited'}</span>
      </div>
      {limit && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${p >= 90 ? 'bg-destructive' : p >= 70 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${p}%` }} />
        </div>
      )}
    </div>
  );
}

export function QuotaPage() {
  const { data, isLoading, error } = useQuota();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quota</h1>
        <p className="mt-1 text-sm text-muted-foreground">Current principal's daily and monthly tool-call quotas</p>
      </div>

      {isLoading ? null : error || !data ? (
        <EmptyState icon={Database} title="Quota unavailable" description="The /api/quota/status endpoint did not respond. Quota may be disabled or the current principal is unauthenticated." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Daily</CardTitle></CardHeader>
            <CardContent><Bar used={data.daily.used} limit={data.daily.limit} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Monthly</CardTitle></CardHeader>
            <CardContent><Bar used={data.monthly.used} limit={data.monthly.limit} /></CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
