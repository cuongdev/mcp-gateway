import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateProxy } from './api';

export function ProxyNewSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/proxies');

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateProxy();

  const nameValid = /^[a-z0-9][a-z0-9-]*$/.test(name);

  const submit = async () => {
    try {
      await create.mutateAsync({ name, url, description: description || undefined });
      close();
    } catch { /* toast handled */ }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create Proxy</SheetTitle>
          <SheetDescription>HTTP(S) or SOCKS5 proxy for upstream egress.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="corp-egress" />
            <p className="text-xs text-muted-foreground">Lowercase alphanumeric + hyphens. Referenced from servers and groups.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">URL</Label>
            <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://user:pass@proxy.example.com:3128" />
            <p className="text-xs text-muted-foreground">Supports <code className="font-mono">http://</code>, <code className="font-mono">https://</code>, <code className="font-mono">socks5://</code>, <code className="font-mono">socks5h://</code>.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description (optional)</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Corporate egress for production traffic" />
          </div>
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !name || !url || !nameValid}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
