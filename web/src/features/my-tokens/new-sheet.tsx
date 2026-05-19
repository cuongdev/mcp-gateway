import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TokenRevealDialog } from '@/components/token-reveal-dialog';
import { useCreateMyToken } from './api';

export function MyTokenNewSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/my-tokens');

  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const create = useCreateMyToken();

  const submit = async () => {
    try {
      const d = await create.mutateAsync({
        name,
        expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
      });
      setRevealed(d.token);
    } catch { /* toast handled */ }
  };

  return (
    <>
      <Sheet open={!revealed} onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent className="flex flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New Personal Access Token</SheetTitle>
            <SheetDescription>Generated once and shown once. Save it before closing.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="laptop-cli" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp">Expires in (days, optional)</Label>
              <Input id="exp" type="number" min={1} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="90" />
              <p className="text-xs text-muted-foreground">Leave empty for a non-expiring token.</p>
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
      <TokenRevealDialog token={revealed} label="Personal access token" onClose={() => { setRevealed(null); close(); }} />
    </>
  );
}
