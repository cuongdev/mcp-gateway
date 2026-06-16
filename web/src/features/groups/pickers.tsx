import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTools } from '@/features/tools/api';
import { useServers } from '@/features/servers/api';
import { useUsers } from '@/features/users/api';

/**
 * Searchable tool picker grouped by MCP server (a sub-tree). Each server can be
 * expanded/collapsed and bulk-toggled; individual tools have checkboxes.
 * `value`/`onChange` carry canonical `server__tool` names.
 */
export function ToolPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useTools({ all: true });
  const tools = data?.tools ?? [];
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sel = new Set(value);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const m = new Map<string, typeof tools>();
    for (const t of tools) {
      if (q && !t.name.toLowerCase().includes(q) && !t.server.toLowerCase().includes(q)) continue;
      const arr = m.get(t.server) ?? [];
      arr.push(t);
      m.set(t.server, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tools, search]);

  const searching = search.trim() !== '';

  const toggleTool = (name: string) => {
    const next = new Set(sel);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next]);
  };
  const toggleServer = (names: string[]) => {
    const allSel = names.every((n) => sel.has(n));
    const next = new Set(sel);
    names.forEach((n) => (allSel ? next.delete(n) : next.add(n)));
    onChange([...next]);
  };
  const toggleOpen = (server: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(server)) next.delete(server);
      else next.add(server);
      return next;
    });

  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border p-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools or servers…" className="h-8" />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {tools.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No tools available — register a server first.</div>
        ) : groups.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No tools match "{search}".</div>
        ) : (
          groups.map(([server, sts]) => {
            const names = sts.map((t) => t.name);
            const selCount = names.filter((n) => sel.has(n)).length;
            const expanded = searching || open.has(server);
            return (
              <div key={server} className="mb-0.5">
                <div className="flex items-center gap-1 rounded px-1 py-1 hover:bg-muted/50">
                  <button type="button" onClick={() => toggleServer(names)} className="flex items-center" aria-label={`Toggle all ${server} tools`}>
                    <input
                      type="checkbox"
                      readOnly
                      className="h-3.5 w-3.5 accent-primary"
                      checked={selCount === names.length}
                      ref={(el) => { if (el) el.indeterminate = selCount > 0 && selCount < names.length; }}
                    />
                  </button>
                  <button type="button" onClick={() => toggleOpen(server)} className="flex flex-1 items-center gap-1 text-left">
                    <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                    <span className="font-mono text-xs font-medium">{server}</span>
                    <Badge variant="secondary" className="ml-auto text-[10px]">{selCount}/{names.length}</Badge>
                  </button>
                </div>
                {expanded && (
                  <div className="ml-5 border-l border-border pl-1">
                    {sts.map((t) => {
                      const original = t.originalName || (t.name.startsWith(`${server}__`) ? t.name.slice(server.length + 2) : t.name);
                      return (
                        <label key={t.name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-0.5 hover:bg-muted/50">
                          <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={sel.has(t.name)} onChange={() => toggleTool(t.name)} />
                          <span className="truncate font-mono text-xs" title={t.description || original}>{original}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-border p-2 text-xs text-muted-foreground">
        {value.length} tool{value.length === 1 ? '' : 's'} selected
      </div>
    </div>
  );
}

/**
 * Server chips — toggle the registered MCP servers. Used for a group's
 * `includedServers` (auto-expand every tool from the chosen servers).
 */
export function ServerPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useServers();
  const servers = useMemo(() => (data?.servers ?? []).map((s) => s.name).sort(), [data]);
  const sel = new Set(value);
  const toggle = (n: string) => {
    const next = new Set(sel);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange([...next]);
  };
  if (servers.length === 0) return <p className="text-xs text-muted-foreground">No servers registered.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {servers.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => toggle(n)}
          className={cn(
            'rounded-full border px-2.5 py-1 font-mono text-xs transition-colors',
            sel.has(n) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/**
 * User chips — toggle which users have DIRECT access to a tool group
 * (group.allowedUsers, matched by email). Options = registered users ∪ current
 * selection (so externally-set identifiers still render).
 */
export function UserPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useUsers();
  const options = useMemo(() => {
    const emails = (data?.users ?? []).map((u) => u.email).filter(Boolean);
    return [...new Set([...emails, ...value])].sort();
  }, [data, value]);
  const sel = new Set(value);
  const toggle = (e: string) => {
    const next = new Set(sel);
    if (next.has(e)) next.delete(e);
    else next.add(e);
    onChange([...next]);
  };
  if (options.length === 0) return <p className="text-xs text-muted-foreground">No users registered.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => toggle(e)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs transition-colors',
            sel.has(e) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/**
 * Role chips — toggle from the known roles (base set + any seen in bindings +
 * current selection), plus an input to add a custom role.
 */
export function RolePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useQuery({
    queryKey: queryKeys.roles,
    queryFn: () => api<{ bindings: Array<{ user: string; role: string }> }>('/api/roles').catch(() => ({ bindings: [] })),
  });
  const roles = useMemo(() => {
    const base = ['admin', 'analyst', 'user', 'guest'];
    const fromBindings = (data?.bindings ?? []).map((b) => b.role);
    return [...new Set([...base, ...fromBindings, ...value])].sort();
  }, [data, value]);
  const sel = new Set(value);
  const [custom, setCustom] = useState('');

  const toggle = (r: string) => {
    const next = new Set(sel);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    onChange([...next]);
  };
  const addCustom = () => {
    const r = custom.trim();
    if (r && !sel.has(r)) onChange([...value, r]);
    setCustom('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => toggle(r)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              sel.has(r) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="add a custom role…"
          className="h-8"
        />
        <Button variant="secondary" size="sm" onClick={addCustom} disabled={!custom.trim()}>Add</Button>
      </div>
    </div>
  );
}
