import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CopyButton } from '@/components/copy-button';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { useDeleteUser, usePatchUser, useUsers } from './api';

export function UserDetailSheet() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const close = () => navigate('/users');

  const { data } = useUsers();
  const user = data?.users.find((u) => u.principalId === id);
  const patch = usePatchUser();
  const del = useDeleteUser();

  if (!user) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent>
          <SheetHeader><SheetTitle>User not found</SheetTitle></SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>{user.displayName}</span>
            <CopyButton value={user.email} label="email" />
          </SheetTitle>
          <SheetDescription>
            <span className="font-mono text-xs">{user.email}</span>
            {' · '}
            {user.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="secondary">Active</Badge>}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
          <section className="flex items-center justify-between">
            <Label htmlFor="enabled" className="flex flex-col">
              <span>Active</span>
              <span className="text-xs font-normal text-muted-foreground">Disabled users cannot authenticate.</span>
            </Label>
            <Switch id="enabled" checked={!user.disabled} disabled={patch.isPending}
              onCheckedChange={(checked) => patch.mutate({ id: user.principalId, disabled: !checked })} />
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Danger zone</h3>
            <p className="text-xs text-muted-foreground">Hard delete removes the principal and cascades to tokens and role bindings.</p>
            <ConfirmDestructive
              trigger={<Button variant="destructive" size="sm" className="w-full justify-start"><Trash2 className="h-4 w-4" /> Hard delete user</Button>}
              title={`Hard delete "${user.displayName}"?`}
              description="Cascades to all PATs and Casbin role bindings. Use Disable above for a reversible action."
              confirmLabel="Hard delete"
              onConfirm={async () => { await del.mutateAsync({ id: user.principalId, hard: true }); close(); }}
            />
          </section>
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
