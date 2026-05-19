import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Key, Trash2 } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ChipInput } from '@/components/chip-input';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { TokenRevealDialog } from '@/components/token-reveal-dialog';
import { useDeleteMcpClient, useMcpClients, usePatchMcpClient, useRotateMcpClientToken } from './api';

export function McpClientDetailSheet() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const close = () => navigate('/mcp-clients');

  const { data } = useMcpClients();
  const client = data?.clients.find((c) => c.principalId === id);

  const patch = usePatchMcpClient();
  const del = useDeleteMcpClient();
  const rotate = useRotateMcpClientToken();

  const [allowedServers, setAllowedServers] = useState<string[]>([]);
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);

  useEffect(() => {
    if (client) setAllowedServers(client.allowedServers);
  }, [client]);

  if (!client) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent><SheetHeader><SheetTitle>Client not found</SheetTitle></SheetHeader></SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={!rotatedToken} onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent className="flex flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span>{client.name}</span>
              {client.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="secondary">Active</Badge>}
            </SheetTitle>
            <SheetDescription>{client.description ?? 'No description'}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
            <section className="space-y-2">
              <Label>Allowed servers</Label>
              <ChipInput value={allowedServers} onChange={setAllowedServers} placeholder="db, github, or *" ariaLabel="allowedServers" />
              <Button size="sm" variant="secondary" disabled={patch.isPending}
                onClick={() => patch.mutate({ id: client.principalId, allowedServers })}>
                {patch.isPending ? 'Saving…' : 'Save allowedServers'}
              </Button>
            </section>

            <Separator />

            <section className="flex items-center justify-between">
              <Label htmlFor="active" className="flex flex-col">
                <span>Active</span>
                <span className="text-xs font-normal text-muted-foreground">Disabled clients are denied at the gateway.</span>
              </Label>
              <Switch id="active" checked={!client.disabled} disabled={patch.isPending}
                onCheckedChange={(checked) => patch.mutate({ id: client.principalId, disabled: !checked })} />
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Token</h3>
              <Button variant="secondary" disabled={rotate.isPending} className="w-full justify-start"
                onClick={async () => {
                  const d = await rotate.mutateAsync(client.principalId);
                  setRotatedToken(d.token);
                }}>
                <Key className="h-4 w-4" /> {rotate.isPending ? 'Rotating…' : 'Rotate token'}
              </Button>
              <p className="text-xs text-muted-foreground">Rotating revokes the previous token and shows the new one once.</p>
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Danger zone</h3>
              <ConfirmDestructive
                trigger={<Button variant="destructive" size="sm" className="w-full justify-start"><Trash2 className="h-4 w-4" /> Delete client</Button>}
                title={`Delete "${client.name}"?`}
                description="Cascades to all tokens and audit-log principal references."
                confirmLabel="Delete"
                onConfirm={async () => { await del.mutateAsync(client.principalId); close(); }}
              />
            </section>
          </div>

          <SheetFooter>
            <Button variant="secondary" onClick={close}>Close</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <TokenRevealDialog token={rotatedToken} label="Rotated token" onClose={() => setRotatedToken(null)} />
    </>
  );
}
