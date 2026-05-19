import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChipInput } from '@/components/chip-input';
import { TokenRevealDialog } from '@/components/token-reveal-dialog';
import { useCreateMcpClient } from './api';

export function McpClientNewSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/mcp-clients');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowedServers, setAllowedServers] = useState<string[]>(['*']);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const create = useCreateMcpClient();

  const submit = async () => {
    try {
      const data = await create.mutateAsync({ name, description, allowedServers });
      setRevealedToken(data.token);
    } catch { /* toast handled in hook */ }
  };

  const onRevealClose = () => { setRevealedToken(null); close(); };

  return (
    <>
      <Sheet open={!revealedToken} onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent className="flex flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Create MCP Client</SheetTitle>
            <SheetDescription>An access token will be generated and shown once.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="claude-prod-01" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description (optional)</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Production Claude instance for the data analytics workspace" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Allowed servers</Label>
              <ChipInput value={allowedServers} onChange={setAllowedServers} placeholder="db, github, or * for all" ariaLabel="allowedServers" />
              <p className="text-xs text-muted-foreground">Use <code className="font-mono">*</code> to grant access to all registered servers.</p>
            </div>
          </div>

          <SheetFooter>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <TokenRevealDialog token={revealedToken} label="Client token" onClose={onRevealClose} />
    </>
  );
}
