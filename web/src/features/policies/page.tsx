import { useMemo, useState } from 'react';
import { Lock, RefreshCw, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import {
  useAddPolicy, useAddRole, usePolicies,
  useReloadPolicies, useRemovePolicy, useRemoveRole, useRoleBindings,
} from './api';
import type { Policy, RoleBinding } from '@/types/api';

export function PoliciesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Access Control</h1>
          <p className="mt-1 text-sm text-muted-foreground">Casbin policies + role bindings</p>
        </div>
        <ReloadButton />
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="bindings">Role Bindings</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <AddPolicyForm />
          <RulesTable />
        </TabsContent>

        <TabsContent value="bindings" className="space-y-4">
          <AddRoleForm />
          <BindingsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReloadButton() {
  const reload = useReloadPolicies();
  return (
    <Button variant="secondary" onClick={() => reload.mutate()} disabled={reload.isPending}>
      <RefreshCw className={`h-4 w-4 ${reload.isPending ? 'animate-spin' : ''}`} />
      {reload.isPending ? 'Reloading…' : 'Reload from file'}
    </Button>
  );
}

function AddPolicyForm() {
  const [sub, setSub] = useState('');
  const [obj, setObj] = useState('');
  const [act, setAct] = useState('');
  const add = useAddPolicy();
  const submit = async () => {
    if (!sub || !obj || !act) return;
    await add.mutateAsync({ sub, obj, act });
    setSub(''); setObj(''); setAct('');
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">Add policy rule</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="space-y-1"><Label htmlFor="sub">Subject</Label><Input id="sub" value={sub} onChange={(e) => setSub(e.target.value)} placeholder="admin" /></div>
        <div className="space-y-1"><Label htmlFor="obj">Object</Label><Input id="obj" value={obj} onChange={(e) => setObj(e.target.value)} placeholder="tool:db__*" /></div>
        <div className="space-y-1"><Label htmlFor="act">Action</Label><Input id="act" value={act} onChange={(e) => setAct(e.target.value)} placeholder="execute" /></div>
        <div className="flex items-end">
          <Button onClick={submit} disabled={add.isPending || !sub || !obj || !act}>Add</Button>
        </div>
      </div>
    </div>
  );
}

function RulesTable() {
  const { data } = usePolicies();
  const rows = data?.policies ?? [];
  const remove = useRemovePolicy();
  const columns = useMemo<ColumnDef<Policy>[]>(() => [
    { id: 'sub', header: 'Subject', cell: ({ row }) => <span className="font-mono text-sm text-primary">{row.original[0]}</span> },
    { id: 'obj', header: 'Object', cell: ({ row }) => <span className="font-mono text-sm">{row.original[1]}</span> },
    { id: 'act', header: 'Action', cell: ({ row }) => <Badge variant="secondary">{row.original[2]}</Badge> },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove rule"
          onClick={() => remove.mutate({ sub: row.original[0], obj: row.original[1], act: row.original[2] })}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ], [remove]);

  if (rows.length === 0) {
    return <EmptyState icon={Lock} title="No policy rules" description="Add a rule above to authorize subjects to perform actions on resources." />;
  }
  return <DataTable columns={columns} data={rows} />;
}

function AddRoleForm() {
  const [user, setUser] = useState('');
  const [role, setRole] = useState('');
  const add = useAddRole();
  const submit = async () => {
    if (!user || !role) return;
    await add.mutateAsync({ user, role });
    setUser(''); setRole('');
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">Assign role to user</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1"><Label htmlFor="user">User</Label><Input id="user" value={user} onChange={(e) => setUser(e.target.value)} placeholder="alice@example.com" /></div>
        <div className="space-y-1"><Label htmlFor="role">Role</Label><Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="admin" /></div>
        <div className="flex items-end">
          <Button onClick={submit} disabled={add.isPending || !user || !role}>Assign</Button>
        </div>
      </div>
    </div>
  );
}

function BindingsTable() {
  const { data } = useRoleBindings();
  const rows = data?.bindings ?? [];
  const remove = useRemoveRole();
  const columns = useMemo<ColumnDef<RoleBinding>[]>(() => [
    { accessorKey: 'user', header: 'User', cell: ({ row }) => <span className="font-mono text-sm">{row.original.user}</span> },
    { accessorKey: 'role', header: 'Role', cell: ({ row }) => <Badge variant="secondary">{row.original.role}</Badge> },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove binding"
          onClick={() => remove.mutate({ user: row.original.user, role: row.original.role })}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ], [remove]);

  if (rows.length === 0) {
    return <EmptyState icon={Lock} title="No role bindings" description="Assign roles to users above to grant role-based access." />;
  }
  return <DataTable columns={columns} data={rows} />;
}
