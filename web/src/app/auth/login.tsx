import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AuthProvider } from '@/types/api';

export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({
    queryKey: queryKeys.authProviders,
    queryFn: async () => {
      const r = await api<{ providers: AuthProvider[] }>('/auth/providers', { silent401: true });
      return r.providers;
    },
  });

  const enterDevMode = async () => {
    try {
      await api('/auth/dev-login', { method: 'POST', silent401: true });
      await qc.invalidateQueries({ queryKey: queryKeys.authMe });
      navigate('/overview', { replace: true });
    } catch (err) {
      toast.error(`Dev login failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  const errFromUrl = new URLSearchParams(window.location.search).get('auth_error');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">MCP Gateway</h1>
          <p className="mt-1 text-sm text-muted-foreground">Admin Dashboard</p>
        </div>
        {errFromUrl && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive">
            Login failed: {decodeURIComponent(errFromUrl)}
          </div>
        )}
        <Card>
          <CardContent className="pt-6">
            {providers.length === 0 ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Running in <span className="font-medium text-primary">development mode</span> — no authentication required.
                </p>
                <Button className="w-full" onClick={enterDevMode}>
                  Enter as Admin (Dev Mode)
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="mb-2 text-center text-sm text-muted-foreground">Sign in with your identity provider</p>
                {providers.map((p) => (
                  <a key={p.id} href={p.loginUrl}>
                    <Button variant="secondary" className="w-full justify-between">
                      <span>Continue with {p.name}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          MCP Gateway — Access controlled by your organization
        </p>
      </div>
    </div>
  );
}
