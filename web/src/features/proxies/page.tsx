import { useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Network, Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { useProxies } from './api';
import type { Proxy } from '@/types/api';

export function ProxiesPage() {
  const navigate = useNavigate();
  const { data } = useProxies();
  const proxies = data?.proxies ?? [];

  const columns = useMemo<ColumnDef<Proxy>[]>(() => [
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <code className="font-mono text-sm text-primary">{row.original.name}</code> },
    { accessorKey: 'url', header: 'URL', cell: ({ row }) => <code className="break-all font-mono text-xs text-muted-foreground">{row.original.url}</code> },
    { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.description ?? '—'}</span> },
    { accessorKey: 'enabled', header: 'Status', cell: ({ row }) => row.original.enabled ? <Badge variant="secondary">enabled</Badge> : <Badge variant="outline">disabled</Badge> },
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Outbound Proxies</h1>
          <p className="mt-1 text-sm text-muted-foreground">HTTP/SOCKS5 proxies for upstream egress (P5)</p>
        </div>
        <Button onClick={() => navigate('/proxies/new')}><Plus className="h-4 w-4" /> New Proxy</Button>
      </div>

      {proxies.length === 0 ? (
        <EmptyState icon={Network} title="No proxies configured"
          description="Outbound proxies route upstream MCP calls through HTTP or SOCKS5 intermediaries."
          action={<Button onClick={() => navigate('/proxies/new')}><Plus className="h-4 w-4" /> New Proxy</Button>}
        />
      ) : (
        <DataTable columns={columns} data={proxies} onRowClick={(p) => navigate(`/proxies/${encodeURIComponent(p.id)}`)} />
      )}

      <Outlet />
    </div>
  );
}
