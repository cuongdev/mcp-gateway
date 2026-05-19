import { useMemo } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Key, Plus, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { useMyTokens, useRevokeMyToken } from './api';
import type { PatToken } from '@/types/api';

export function MyTokensPage() {
  const navigate = useNavigate();
  const { data } = useMyTokens();
  const tokens = data?.tokens ?? [];
  const revoke = useRevokeMyToken();

  const columns = useMemo<ColumnDef<PatToken>[]>(() => [
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.name ?? '—'}</span> },
    { accessorKey: 'prefix', header: 'Prefix', cell: ({ row }) => <code className="font-mono text-xs">{row.original.prefix}…</code> },
    {
      accessorKey: 'createdAt', header: 'Created',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleString()}</span>,
    },
    {
      accessorKey: 'expiresAt', header: 'Expires',
      cell: ({ row }) => row.original.expiresAt
        ? <span className="text-xs text-muted-foreground">{new Date(row.original.expiresAt).toLocaleString()}</span>
        : <span className="text-xs text-muted-foreground">never</span>,
    },
    {
      id: 'actions', header: '',
      cell: ({ row }) => (
        <ConfirmDestructive
          trigger={<Button variant="ghost" size="icon" aria-label="Revoke token"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
          title={`Revoke "${row.original.name ?? row.original.prefix}"?`}
          description="The token will stop working immediately. Cannot be undone."
          confirmLabel="Revoke"
          onConfirm={async () => { await revoke.mutateAsync(row.original.id); }}
        />
      ),
    },
  ], [revoke]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Tokens</h1>
          <p className="mt-1 text-sm text-muted-foreground">Personal access tokens for CLI and automation</p>
        </div>
        <Button onClick={() => navigate('/my-tokens/new')}><Plus className="h-4 w-4" /> New PAT</Button>
      </div>

      {tokens.length === 0 ? (
        <EmptyState icon={Key} title="No personal tokens yet"
          description="Create a PAT to authenticate the CLI or scripts as yourself."
          action={<Button onClick={() => navigate('/my-tokens/new')}><Plus className="h-4 w-4" /> New PAT</Button>}
        />
      ) : (
        <DataTable columns={columns} data={tokens} />
      )}

      <Outlet />
    </div>
  );
}
