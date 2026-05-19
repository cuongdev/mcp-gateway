import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateTenant } from './api';

export function TenantNewSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/tenants');

  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [plan, setPlan] = useState('');
  const create = useCreateTenant();

  const submit = async () => {
    try {
      await create.mutateAsync({ slug, displayName, plan: plan || undefined });
      close();
    } catch { /* toast handled */ }
  };

  const slugValid = /^[a-z0-9][a-z0-9-]*$/.test(slug);

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create Tenant</SheetTitle>
          <SheetDescription>Tenants isolate workspaces with their own principals and servers.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-corp" />
            <p className="text-xs text-muted-foreground">Lowercase alphanumeric + hyphens. Used in URLs and headers.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ACME Corporation" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan">Plan (optional)</Label>
            <Input id="plan" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="enterprise" />
          </div>
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !slug || !displayName || !slugValid}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
