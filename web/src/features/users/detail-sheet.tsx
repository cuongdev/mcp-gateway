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
import { cn } from '@/lib/utils';
import { RolePicker } from '@/features/groups/pickers';
import { useRoleBindings, useAddRole, useRemoveRole } from '@/features/policies/api';
import { useGroups, usePatchGroup } from '@/features/groups/api';
import { useDeleteUser, usePatchUser, useUsers } from './api';
import { accessibleGroups, accessibleToolNames } from './access';

export function UserDetailSheet() {
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const close = () => navigate('/users');

  const { data } = useUsers();
  const user = data?.users.find((u) => u.principalId === id);
  const patch = usePatchUser();
  const del = useDeleteUser();

  // Role bindings are keyed by the subject the gateway resolves at /auth/me:
  // the user's email when present, else the principal id.
  const subject = user ? (user.email || user.principalId) : '';
  const { data: rb } = useRoleBindings();
  const userRoles = (rb?.bindings ?? []).filter((b) => b.user === subject).map((b) => b.role);
  const addRole = useAddRole();
  const removeRole = useRemoveRole();
  const onRolesChange = (next: string[]) => {
    const cur = new Set(userRoles);
    const nxt = new Set(next);
    next.forEach((r) => { if (!cur.has(r)) addRole.mutate({ user: subject, role: r }); });
    userRoles.forEach((r) => { if (!nxt.has(r)) removeRole.mutate({ user: subject, role: r }); });
  };

  // Direct group membership (group.allowedUsers), toggled from the user side.
  const { data: groupsData } = useGroups();
  const groups = groupsData?.groups ?? [];
  const patchGroup = usePatchGroup();
  const toggleGroup = (g: { name: string; allowedUsers?: string[] }) => {
    const cur = g.allowedUsers ?? [];
    const next = cur.includes(subject) ? cur.filter((u) => u !== subject) : [...cur, subject];
    patchGroup.mutate({ name: g.name, allowedUsers: next });
  };

  if (!user) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent>
          <SheetHeader><SheetTitle>User not found</SheetTitle></SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  // Effective access (role-matched + direct + open groups) for the summary.
  const accGroups = accessibleGroups(groups, { email: user.email, principalId: user.principalId, roles: userRoles });
  const accToolCount = accessibleToolNames(accGroups).length;

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
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Access summary</h3>
            <p className="text-xs text-muted-foreground">
              Belongs to <span className="font-medium text-foreground">{accGroups.length}</span> group{accGroups.length === 1 ? '' : 's'}
              {' · can access '}<span className="font-medium text-foreground">{accToolCount}</span> tool{accToolCount === 1 ? '' : 's'}.
            </p>
            {accGroups.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {accGroups.map((g) => <Badge key={g.name} variant="secondary" className="font-mono text-[10px]">{g.name}</Badge>)}
              </div>
            )}
          </section>

          <Separator />

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
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Roles</h3>
            <p className="text-xs text-muted-foreground">
              Assign roles to this user. Roles grant access to tool groups (via each group's allowed roles).
            </p>
            <RolePicker value={userRoles} onChange={onRolesChange} />
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tool groups (direct access)</h3>
            <p className="text-xs text-muted-foreground">Grant this user direct access to specific tool groups (in addition to role-based access).</p>
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tool groups yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const member = (g.allowedUsers ?? []).includes(subject);
                  return (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => toggleGroup(g)}
                      disabled={patchGroup.isPending}
                      className={cn(
                        'rounded-full border px-2.5 py-1 font-mono text-xs transition-colors',
                        member ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            )}
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
