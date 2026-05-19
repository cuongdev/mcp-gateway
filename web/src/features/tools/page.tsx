import { useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Search, Wrench } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { useTools, useToggleTool } from './api';
import type { ToolSummary } from '@/types/api';

export function ToolsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);

  const { data } = useTools({ all: true });
  const toggle = useToggleTool();

  const tools = (data?.tools ?? []).filter((t) =>
    (showDisabled || t.enabled) &&
    (search === '' ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.server.toLowerCase().includes(search.toLowerCase())),
  );

  const columns = useMemo<ColumnDef<ToolSummary>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Tool',
      cell: ({ row }) => (
        <div>
          <span className="font-mono text-xs text-muted-foreground">{row.original.server}__</span>
          <span className="font-medium">{row.original.originalName}</span>
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.description ?? '—'}</span>
      ),
    },
    {
      id: 'flags',
      header: 'Flags',
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.cacheable && <Badge variant="secondary">cache</Badge>}
          {row.original.sensitive && <Badge variant="destructive">sensitive</Badge>}
        </div>
      ),
    },
    {
      accessorKey: 'enabled',
      header: 'Enabled',
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          disabled={toggle.isPending}
          onCheckedChange={(checked) =>
            toggle.mutate({ name: row.original.name, enabled: checked })
          }
          onClick={(e) => e.stopPropagation()}
          aria-label={`Toggle ${row.original.name}`}
        />
      ),
    },
  ], [toggle]);

  const totalAll = data?.total ?? 0;
  const servers = new Set(tools.map((t) => t.server));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tools.length} of {totalAll} tools from {servers.size} server{servers.size === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="showDisabled" className="text-sm text-muted-foreground">Show disabled</Label>
          <Switch id="showDisabled" checked={showDisabled} onCheckedChange={setShowDisabled} />
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools by name or server…"
          className="pl-9"
        />
      </div>

      {tools.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={totalAll === 0 ? 'No tools registered' : 'No tools match your filters'}
          description={totalAll === 0 ? 'Register a server to discover tools.' : 'Try clearing the search or enabling "Show disabled".'}
        />
      ) : (
        <DataTable
          columns={columns}
          data={tools}
          onRowClick={(t) => navigate(`/tools/${encodeURIComponent(t.name)}`)}
        />
      )}

      <Outlet />
    </div>
  );
}
