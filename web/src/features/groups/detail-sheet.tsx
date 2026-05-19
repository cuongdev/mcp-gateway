import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChipInput } from '@/components/chip-input';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { CopyButton } from '@/components/copy-button';
import { useDeleteGroup, useGroup, usePatchGroup } from './api';

export function GroupDetailSheet() {
  const navigate = useNavigate();
  const { name = '' } = useParams<{ name: string }>();
  const close = () => navigate('/groups');

  const { data } = useGroup(name);
  const patch = usePatchGroup();
  const del = useDeleteGroup();

  const [description, setDescription] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [includedServers, setIncluded] = useState<string[]>([]);
  const [excludedTools, setExcluded] = useState<string[]>([]);
  const [allowedRoles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setDescription(data.group.description ?? '');
    setTools(data.group.tools);
    setIncluded(data.group.includedServers);
    setExcluded(data.group.excludedTools);
    setRoles(data.group.allowedRoles);
  }, [data]);

  if (!data) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Loading…</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const save = async () => {
    await patch.mutateAsync({
      name, description, tools, includedServers, excludedTools, allowedRoles,
    });
    close();
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>{name}</span>
            <CopyButton value={`/mcp/groups/${name}`} label="endpoint" />
          </SheetTitle>
          <SheetDescription>Edit the tool group's tools, filters, and roles.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4">
          <Tabs defaultValue="tools">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="filters">Filters</TabsTrigger>
              <TabsTrigger value="roles">Roles</TabsTrigger>
            </TabsList>

            <TabsContent value="tools" className="mt-4 space-y-3">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Read-only data tools" />
              <Label>Tools (canonical names)</Label>
              <ChipInput value={tools} onChange={setTools} placeholder="db__query, fs__read_file" ariaLabel="tools" />
              <p className="text-xs text-muted-foreground">Explicit list of canonical tool names included in this group.</p>
            </TabsContent>

            <TabsContent value="filters" className="mt-4 space-y-3">
              <Label>Included servers (auto-expand all tools from these servers)</Label>
              <ChipInput value={includedServers} onChange={setIncluded} placeholder="db, github" ariaLabel="includedServers" />
              <Label>Excluded tools (subtract from the expanded set)</Label>
              <ChipInput value={excludedTools} onChange={setExcluded} placeholder="github__delete_repo" ariaLabel="excludedTools" />
            </TabsContent>

            <TabsContent value="roles" className="mt-4 space-y-3">
              <Label>Allowed roles (empty = all roles)</Label>
              <ChipInput value={allowedRoles} onChange={setRoles} placeholder="analyst, admin" ariaLabel="allowedRoles" />
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <ConfirmDestructive
            trigger={<Button variant="destructive" size="sm"><Trash2 className="h-4 w-4" /> Delete group</Button>}
            title={`Delete group "${name}"?`}
            description="This removes the group and its dedicated /mcp/groups endpoint. Tools and other groups are unaffected."
            confirmLabel="Delete"
            onConfirm={async () => { await del.mutateAsync(name); close(); }}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={save} disabled={patch.isPending}>
              {patch.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
