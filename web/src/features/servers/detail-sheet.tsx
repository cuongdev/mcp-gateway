import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { StatusDot } from '@/components/status-dot';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { CopyButton } from '@/components/copy-button';
import { useDeleteServer, usePatchServer, useServers, useSyncServer } from './api';

export function ServerDetailSheet() {
  const navigate = useNavigate();
  const { name = '' } = useParams<{ name: string }>();
  const close = () => navigate('/servers');

  const { data } = useServers();
  const server = data?.servers.find((s) => s.name === name);

  const syncMut = useSyncServer();
  const deleteMut = useDeleteServer();
  const patchMut = usePatchServer();

  if (!server) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Server not found</SheetTitle>
            <SheetDescription>"{name}" is not registered.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <StatusDot ok={server.session} />
            <span>{server.name}</span>
            <CopyButton value={server.name} label="server name" />
          </SheetTitle>
          <SheetDescription>{server.session ? 'Connected' : 'Offline'}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Tools</h3>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{server.tools.length}</Badge>
              <span className="text-sm text-muted-foreground">
                {server.tools.length === 0 ? 'No tools discovered.' : `Discovered ${server.tools.length} tools.`}
              </span>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Settings</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled" className="flex flex-col">
                <span>Enabled</span>
                <span className="text-xs font-normal text-muted-foreground">Disabled servers are skipped by MCP routing.</span>
              </Label>
              <Switch
                id="enabled"
                defaultChecked
                disabled={patchMut.isPending}
                onCheckedChange={(checked) => patchMut.mutate({ name: server.name, enabled: checked })}
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</h3>
            <Button
              variant="secondary"
              className="w-full justify-start"
              disabled={syncMut.isPending}
              onClick={() => syncMut.mutate(server.name)}
            >
              <RefreshCw className={`h-4 w-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
              {syncMut.isPending ? 'Syncing…' : 'Sync tools from upstream'}
            </Button>
            <ConfirmDestructive
              trigger={
                <Button variant="destructive" className="w-full justify-start">
                  <Trash2 className="h-4 w-4" /> Deregister server
                </Button>
              }
              title={`Deregister "${server.name}"?`}
              description="This removes the server from the gateway and disables all its tools. The upstream server itself is not affected."
              confirmLabel="Deregister"
              onConfirm={async () => {
                await deleteMut.mutateAsync(server.name);
                close();
              }}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
