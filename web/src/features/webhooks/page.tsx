import { Outlet, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { CopyButton } from '@/components/copy-button';
import { useDeleteWebhook, useWebhooks } from './api';

export function WebhooksPage() {
  const navigate = useNavigate();
  const { data } = useWebhooks();
  const webhooks = data?.webhooks ?? [];
  const del = useDeleteWebhook();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">HTTP callbacks fired on approval / system events</p>
        </div>
        <Button onClick={() => navigate('/webhooks/new')}><Plus className="h-4 w-4" /> New Webhook</Button>
      </div>

      {webhooks.length === 0 ? (
        <EmptyState icon={WebhookIcon} title="No webhooks yet"
          description="Webhooks deliver event JSON to your URL with optional HMAC signing."
          action={<Button onClick={() => navigate('/webhooks/new')}><Plus className="h-4 w-4" /> New Webhook</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {webhooks.map((w) => (
            <Card key={w.id}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span>{w.name}</span>
                      {w.enabled ? <Badge variant="secondary">enabled</Badge> : <Badge variant="outline">disabled</Badge>}
                    </div>
                    <div className="flex items-center gap-1 font-normal">
                      <code className="break-all font-mono text-xs text-muted-foreground">{w.url}</code>
                      <CopyButton value={w.url} label="webhook URL" />
                    </div>
                  </div>
                  <ConfirmDestructive
                    trigger={<Button variant="ghost" size="icon" aria-label="Delete webhook"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    title={`Delete webhook "${w.name}"?`}
                    description="Future events will no longer be delivered to this URL."
                    confirmLabel="Delete"
                    onConfirm={async () => { await del.mutateAsync(w.id); }}
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {w.events.length === 0 ? <Badge variant="outline">all events</Badge> :
                    w.events.map((e) => <Badge key={e} variant="outline" className="font-mono text-[10px]">{e}</Badge>)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {w.secret ? 'HMAC signing enabled' : 'No HMAC signing'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Outlet />
    </div>
  );
}
