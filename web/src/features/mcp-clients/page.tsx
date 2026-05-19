import { useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Bot, Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { useMcpClients } from './api';
import type { McpClient } from '@/types/api';

export function McpClientsPage() {
  const navigate = useNavigate();
  const { data } = useMcpClients();
  const clients = data?.clients ?? [];

  const columns = useMemo<ColumnDef<McpClient>[]>(() => [
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    {
      id: 'allowedServers', header: 'Allowed servers',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.allowedServers.length === 0 || row.original.allowedServers[0] === '*'
            ? <Badge variant="secondary">all</Badge>
            : row.original.allowedServers.map((s) => <Badge key={s} variant="outline" className="font-mono">{s}</Badge>)}
        </div>
      ),
    },
    { accessorKey: 'disabled', header: 'Status', cell: ({ row }) => row.original.disabled ? <Badge variant="outline">Disabled</Badge> : <Badge variant="secondary">Active</Badge> },
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">MCP Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Programmatic identities for AI agents and orchestrators</p>
        </div>
        <Button onClick={() => navigate('/mcp-clients/new')}><Plus className="h-4 w-4" /> New MCP Client</Button>
      </div>

      {clients.length === 0 ? (
        <EmptyState icon={Bot} title="No MCP Clients yet"
          description="MCP Clients hold scoped tokens that AI agents use to call /mcp."
          action={<Button onClick={() => navigate('/mcp-clients/new')}><Plus className="h-4 w-4" /> New MCP Client</Button>}
        />
      ) : (
        <DataTable columns={columns} data={clients} onRowClick={(c) => navigate(`/mcp-clients/${encodeURIComponent(c.principalId)}`)} />
      )}

      <Outlet />
    </div>
  );
}
