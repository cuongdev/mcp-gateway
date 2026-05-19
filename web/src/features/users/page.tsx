import { useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Plus, Users as UsersIcon } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { useUsers } from './api';
import type { User } from '@/types/api';

export function UsersPage() {
  const navigate = useNavigate();
  const { data } = useUsers();
  const users = data?.users ?? [];

  const columns = useMemo<ColumnDef<User>[]>(() => [
    { accessorKey: 'displayName', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.displayName}</span> },
    { accessorKey: 'email', header: 'Email', cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.email}</span> },
    { accessorKey: 'disabled', header: 'Status', cell: ({ row }) => row.original.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="secondary">Active</Badge> },
  ], []);

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
