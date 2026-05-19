import { useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { useTenants } from './api';
import type { Tenant } from '@/types/api';

function statusBadge(status: string) {
  if (status === 'active') return <Badge variant="secondary">active</Badge>;
  if (status === 'suspended') return <Badge variant="destructive">suspended</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function TenantsPage() {
  const navigate = useNavigate();
  const { data } = useTenants();
  const tenants = data?.tenants ?? [];

  const columns = useMemo<ColumnDef<Tenant>[]>(() => [
    { accessorKey: 'slug', header: 'Slug', cell: ({ row }) => <code className="font-mono text-xs text-primary">{row.original.slug}</code> },
    { accessorKey: 'displayName', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.displayName}</span> },
    { accessorKey: 'plan', header: 'Plan', cell: ({ row }) => <Badge variant="outline">{row.original.plan}</Badge> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => statusBadge(row.original.status) },
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="mt-1 text-sm text-muted-foreground">Multi-tenant workspace management</p>
        </div>
        <Button onClick={() => navigate('/tenants/new')}><Plus className="h-4 w-4" /> New Tenant</Button>
      </div>

      {tenants.length === 0 ? (
        <EmptyState icon={Building2} title="No tenants yet"
          description="Tenants represent isolated workspaces with their own principals, servers, and groups."
          action={<Button onClick={() => navigate('/tenants/new')}><Plus className="h-4 w-4" /> New Tenant</Button>}
        />
      ) : (
        <DataTable columns={columns} data={tenants} onRowClick={(t) => navigate(`/tenants/${encodeURIComponent(t.id)}`)} />
      )}

      <Outlet />
    </div>
  );
}
