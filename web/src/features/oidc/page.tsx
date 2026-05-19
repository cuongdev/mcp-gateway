import { ShieldCheck, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { CopyButton } from '@/components/copy-button';
import { useOidcProviders } from './api';

export function OidcProvidersPage() {
  const { data } = useOidcProviders();
  const providers = data?.providers ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">OIDC Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only view of configured identity providers. Edit via gateway config and restart.
        </p>
      </div>

      {providers.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No OIDC providers configured"
          description={`Gateway is in dev mode or no providers are configured. Edit \`oidcProviders\` in your config file and restart to enable.`}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {providers.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <span>{p.name}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">{p.id}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <a
                    href={p.loginUrl}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Login URL <ExternalLink className="h-3 w-3" />
                  </a>
                  <CopyButton value={p.loginUrl} label="login URL" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Users click "Sign in with {p.name}" on the login screen.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
