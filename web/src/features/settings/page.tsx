import { Settings as SettingsIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { useSystemInfo } from './api';

function ConfigSection({ title, value }: { title: string; value: unknown }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs">{JSON.stringify(value, null, 2)}</pre>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { data, isLoading, error } = useSystemInfo();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only runtime gateway configuration. Edit via the gateway config file and restart.
        </p>
      </div>

      {isLoading ? null : error || !data ? (
        <EmptyState icon={SettingsIcon} title="Settings unavailable" description="The /api/system/info endpoint did not respond. Admin role required." />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Runtime</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Version</span><code className="font-mono text-xs">{data.version ?? '—'}</code></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Started at</span><code className="font-mono text-xs">{data.startedAt ?? '—'}</code></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><Badge variant="secondary">{String((data.config as Record<string, unknown>).mode ?? '—')}</Badge></div>
            </CardContent>
          </Card>

          {(['gateway', 'auth', 'authorization', 'storage', 'rateLimit', 'quota', 'cache', 'approval', 'webhooks', 'tracing', 'openapi', 'proxy', 'tenancy', 'oidcProviders'] as const).map((key) => {
            const value = (data.config as Record<string, unknown>)[key];
            if (value === undefined) return null;
            return <ConfigSection key={key} title={key} value={value} />;
          })}
        </>
      )}
    </div>
  );
}
