import { useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Plus, Users as UsersIcon } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { useGroups } from '@/features/groups/api';
import { useRoleBindings } from '@/features/policies/api';
import { useUsers } from './api';
import { accessibleGroups, accessibleToolNames, userRolesFor } from './access';
import type { User } from '@/types/api';

export function UsersPage() {
  const navigate = useNavigate();
  const { data } = useUsers();
  const users = data?.users ?? [];
  const { data: groupsData } = useGroups();
  const { data: bindingsData } = useRoleBindings();
  const groups = groupsData?.groups ?? [];
  const bindings = bindingsData?.bindings ?? [];

  // Per-user effective access: which groups they can reach + how many tools.
  const accessByUser = useMemo(() => {
    const m = new Map<string, { groups: string[]; toolCount: number }>();
    for (const u of users) {
      const subject = u.email || u.principalId;
      const roles = userRolesFor(subject, bindings);
      const gs = accessibleGroups(groups, { email: u.email, principalId: u.principalId, roles });
      m.set(u.principalId, { groups: gs.map((g) => g.name), toolCount: accessibleToolNames(gs).length });
    }
    return m;
  }, [users, groups, bindings]);

  const columns = useMemo<ColumnDef<User>[]>(() => [
    { accessorKey: 'displayName', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.displayName}</span> },
    { accessorKey: 'email', header: 'Email', cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.email}</span> },
    {
      id: 'groups', header: 'Groups',
      cell: ({ row }) => {
        const names = accessByUser.get(row.original.principalId)?.groups ?? [];
        if (names.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {names.slice(0, 3).map((n) => <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>)}
            {names.length > 3 && <Badge variant="outline" className="text-[10px]">+{names.length - 3}</Badge>}
          </div>
        );
      },
    },
    {
      id: 'tools', header: 'Tools',
      cell: ({ row }) => <Badge variant="secondary" className="text-xs">{accessByUser.get(row.original.principalId)?.toolCount ?? 0}</Badge>,
    },
    { accessorKey: 'disabled', header: 'Status', cell: ({ row }) => row.original.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="secondary">Active</Badge> },
  ], [accessByUser]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage gateway user accounts</p>
        </div>
        <Button onClick={() => navigate('/users/new')}><Plus className="h-4 w-4" /> New User</Button>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet" description="Users authenticate via OIDC or PATs." action={
          <Button onClick={() => navigate('/users/new')}><Plus className="h-4 w-4" /> New User</Button>
        } />
      ) : (
        <DataTable columns={columns} data={users} onRowClick={(u) => navigate(`/users/${encodeURIComponent(u.principalId)}`)} />
      )}

      <Outlet />
    </div>
  );
}
