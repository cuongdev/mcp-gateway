import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CopyButton } from '@/components/copy-button';
import { useDeleteProxy, usePatchProxy, useProxies, useProxyReferences } from './api';

export function ProxyDetailSheet() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const close = () => navigate('/proxies');

  const { data } = useProxies();
  const proxy = data?.proxies.find((p) => p.id === id);
  const refs = useProxyReferences(id);

  const patch = usePatchProxy();
  const del = useDeleteProxy();

  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!proxy) return;
    setUrl(proxy.url);
    setDescription(proxy.description ?? '');
  }, [proxy]);

  if (!proxy) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent><SheetHeader><SheetTitle>Proxy not found</SheetTitle></SheetHeader></SheetContent>
      </Sheet>
    );
  }

  const references = refs.data?.references ?? [];
  const hasReferences = references.length > 0;

  const deleteProxy = async (force: boolean) => {
    await del.mutateAsync({ id: proxy.id, force });
    close();
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <code className="font-mono text-base">{proxy.name}</code>
            <CopyButton value={proxy.name} label="proxy name" />
          </SheetTitle>
          <SheetDescription>
            {proxy.enabled ? <Badge variant="secondary">enabled</Badge> : <Badge variant="outline">disabled</Badge>}
            {' · '}{references.length} reference{references.length === 1 ? '' : 's'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
          <section className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="url">URL</Label>
              <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground">Password redacted in list response but updatable here.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled" className="flex flex-col">
                <span>Enabled</span>
                <span className="text-xs font-normal text-muted-foreground">Disabled proxies stop routing new requests.</span>
              </Label>
              <Switch id="enabled" checked={proxy.enabled} disabled={patch.isPending}
                onCheckedChange={(checked) => patch.mutate({ id: proxy.id, enabled: checked })} />
            </div>
            <Button size="sm" variant="secondary" disabled={patch.isPending}
              onClick={() => patch.mutate({ id: proxy.id, url, description })}>
              {patch.isPending ? 'Saving…' : 'Save URL + description'}
            </Button>
          </section>

          <Separator />

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">References</h3>
            {!hasReferences ? (
              <p className="text-sm text-muted-foreground">No servers or groups reference this proxy.</p>
            ) : (
              <ul className="space-y-1.5">
                {references.map((r) => (
                  <li key={`${r.kind}-${r.name}`} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono text-[10px]">{r.kind}</Badge>
                    <code className="font-mono">{r.name}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Danger zone</h3>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full justify-start">
                  <Trash2 className="h-4 w-4" /> Delete proxy
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete proxy "{proxy.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {hasReferences ? (
                      <>
                        {references.length} server{references.length === 1 ? '' : 's'}/group{references.length === 1 ? '' : 's'} currently reference this proxy:
                        <ul className="mt-2 space-y-0.5 text-xs">
                          {references.slice(0, 5).map((r) => (
                            <li key={`${r.kind}-${r.name}`}><code className="font-mono">{r.kind}:{r.name}</code></li>
                          ))}
                          {references.length > 5 && <li className="text-muted-foreground">+ {references.length - 5} more</li>}
                        </ul>
                        <p className="mt-2">Use "Force delete" to cascade — references will fall back to direct routing.</p>
                      </>
                    ) : (
                      'This proxy is not referenced. Deleting it is safe.'
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel asChild><Button variant="secondary">Cancel</Button></AlertDialogCancel>
                  {hasReferences ? (
                    <AlertDialogAction asChild>
                      <Button variant="destructive" onClick={() => void deleteProxy(true)}>Force delete (cascade)</Button>
                    </AlertDialogAction>
                  ) : (
                    <AlertDialogAction asChild>
                      <Button variant="destructive" onClick={() => void deleteProxy(false)}>Delete</Button>
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
