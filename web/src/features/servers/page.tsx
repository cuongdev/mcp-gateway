import { useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Plus, Server as ServerIcon } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { StatusDot } from '@/components/status-dot';
import { EmptyState } from '@/components/empty-state';
import { api } from '@/lib/api';
import { useServers } from './api';
import type { ServerSummary } from '@/types/api';

interface CircuitSummary { serverName: string; state: string }
const CIRCUIT_TONE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  healthy: { variant: 'secondary', label: 'healthy' },
  degraded: { variant: 'default', label: 'degraded' },
  circuit_open: { variant: 'destructive', label: 'open' },
  half_open: { variant: 'default', label: 'half-open' },
  quarantined: { variant: 'destructive', label: 'quarantined' },
  manual_disabled: { variant: 'outline', label: 'disabled' },
};

export function ServersPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useServers();
  const servers = data?.servers ?? [];

  const { data: circuitsData } = useQuery({
    queryKey: ['circuits'],
    queryFn: () => api<{ circuits: CircuitSummary[] }>('/api/circuits').catch(() => ({ circuits: [] })),
    refetchInterval: 10_000,
  });
  const circuitByServer = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of circuitsData?.circuits ?? []) map.set(c.serverName, c.state);
    return map;
  }, [circuitsData]);

  const columns = useMemo<ColumnDef<ServerSummary>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Server',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'tools',
      header: 'Tools',
      cell: ({ row }) => <Badge variant="secondary">{row.original.tools.length}</Badge>,
    },
    {
      accessorKey: 'session',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <StatusDot ok={row.original.session} />
          <span className="text-sm">{row.original.session ? 'Connected' : 'Offline'}</span>
        </div>
      ),
    },
    {
      id: 'circuit',
      header: 'Circuit',
      cell: ({ row }) => {
        const state = circuitByServer.get(row.original.name);
        if (!state) return <span className="text-xs text-muted-foreground">—</span>;
        const tone = CIRCUIT_TONE[state] ?? { variant: 'outline' as const, label: state };
        return <Badge variant={tone.variant} className="text-xs">{tone.label}</Badge>;
      },
    },
  ], [circuitByServer]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Register and manage upstream MCP servers</p>
        </div>
        <Button onClick={() => navigate('/servers/new')}>
          <Plus className="h-4 w-4" /> Register Server
        </Button>
      </div>

      {isLoading ? null : servers.length === 0 ? (
        <EmptyState
          icon={ServerIcon}
          title="No servers registered"
          description="Register your first upstream MCP server to start exposing its tools."
          action={
            <Button onClick={() => navigate('/servers/new')}>
              <Plus className="h-4 w-4" /> Register Server
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={servers}
          onRowClick={(s) => navigate(`/servers/${encodeURIComponent(s.name)}`)}
        />
      )}

      {/* Side sheets render here (detail / new) */}
      <Outlet />
    </div>
  );
}
