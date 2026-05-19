import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChipInput } from '@/components/chip-input';
import { useCreateGroup } from './api';

export function GroupNewSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/groups');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const create = useCreateGroup();

  const submit = async () => {
    try {
      await create.mutateAsync({ name, description, tools, allowedRoles });
      close();
    } catch { /* toast handled in hook */ }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create Tool Group</SheetTitle>
          <SheetDescription>Define a curated set of tools, exposed at /mcp/groups/&lt;name&gt;.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="data-analyst" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Read-only data tools" />
          </div>
          <div className="space-y-1.5">
            <Label>Tools (canonical names)</Label>
            <ChipInput value={tools} onChange={setTools} placeholder="db__query, fs__read_file" ariaLabel="tools" />
            <p className="text-xs text-muted-foreground">Add tools by their canonical <code className="font-mono">server__tool</code> name.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Allowed roles (empty = all)</Label>
            <ChipInput value={allowedRoles} onChange={setAllowedRoles} placeholder="analyst, admin" ariaLabel="roles" />
          </div>
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || name.trim() === '' || tools.length === 0}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
