import { useNavigate, useParams } from 'react-router-dom';
import { Pause, Play } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CopyButton } from '@/components/copy-button';
import { useResumeTenant, useSuspendTenant, useTenants } from './api';

export function TenantDetailSheet() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const close = () => navigate('/tenants');

  const { data } = useTenants();
  const tenant = data?.tenants.find((t) => t.id === id);

  const suspend = useSuspendTenant();
  const resume = useResumeTenant();

  if (!tenant) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent><SheetHeader><SheetTitle>Tenant not found</SheetTitle></SheetHeader></SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>{tenant.displayName}</span>
            <CopyButton value={tenant.slug} label="slug" />
          </SheetTitle>
          <SheetDescription>
            <code className="font-mono text-xs">{tenant.slug}</code>
            {' · plan '}<Badge variant="outline">{tenant.plan}</Badge>
            {' · '}<Badge variant={tenant.status === 'active' ? 'secondary' : tenant.status === 'suspended' ? 'destructive' : 'outline'}>{tenant.status}</Badge>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Metadata</h3>
            <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">{JSON.stringify(tenant.metadata, null, 2)}</pre>
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lifecycle</h3>
            {tenant.status === 'active' ? (
              <Button variant="destructive" className="w-full justify-start" disabled={suspend.isPending}
                onClick={() => suspend.mutate(tenant.id)}>
                <Pause className="h-4 w-4" /> {suspend.isPending ? 'Suspending…' : 'Suspend tenant'}
              </Button>
            ) : (
              <Button variant="secondary" className="w-full justify-start" disabled={resume.isPending}
                onClick={() => resume.mutate(tenant.id)}>
                <Play className="h-4 w-4" /> {resume.isPending ? 'Resuming…' : 'Resume tenant'}
              </Button>
            )}
          </section>
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
