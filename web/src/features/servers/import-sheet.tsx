import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, AlertTriangle } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useImportPreview, useImportServers, type ImportPreview, type ImportedServer } from './api';

const PLACEHOLDER = `{
  "mcpServers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "ghp_…" } },
    "api": { "url": "https://api.example.com/mcp" }
  }
}`;

interface EditServer {
  name: string;
  type: 'stdio' | 'streamable-http' | 'sse';
  command: string;
  args: string;
  url: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  selected: boolean;
}

// Editor placeholders the gateway can't resolve (it only substitutes ${UPPER_SNAKE}).
const UNRESOLVED = /\$\{([^}]+)\}/g;
function unresolvedVars(...vals: string[]): string[] {
  const out = new Set<string>();
  for (const v of vals) {
    for (const m of v.matchAll(UNRESOLVED)) {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(m[1])) out.add(m[0]);
    }
  }
  return [...out];
}

function toEdit(s: ImportedServer): EditServer {
  const t = s.transport;
  return {
    name: s.name,
    type: (t.type as EditServer['type']) ?? 'streamable-http',
    command: t.command ?? '',
    args: (t.args ?? []).join(' '),
    url: t.url ?? '',
    env: t.env,
    headers: t.headers,
    selected: true,
  };
}

function toTransport(e: EditServer) {
  if (e.type === 'stdio') {
    return { type: 'stdio', command: e.command, args: e.args.split(/\s+/).filter(Boolean), ...(e.env ? { env: e.env } : {}) };
  }
  return { type: e.type, url: e.url, ...(e.headers ? { headers: e.headers } : {}) };
}

export function ServerImportSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/servers');

  const [text, setText] = useState('');
  const [edits, setEdits] = useState<EditServer[] | null>(null);
  const [topWarnings, setTopWarnings] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const detect = useImportPreview();
  const importer = useImportServers();

  const runDetect = () => {
    detect.mutate(text, {
      onSuccess: (data: ImportPreview) => {
        setEdits(data.servers.map(toEdit));
        setTopWarnings(data.warnings);
      },
    });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setEdits(null);
  };

  const patch = (i: number, p: Partial<EditServer>) =>
    setEdits((prev) => prev!.map((e, idx) => (idx === i ? { ...e, ...p } : e)));

  // Replace ${workspaceFolder}/${workspaceRoot} with the entered path across all rows (one-shot, on click).
  const applyWorkspace = () => {
    if (!workspace.trim()) return;
    const sub = (v: string) => v.replaceAll('${workspaceFolder}', workspace).replaceAll('${workspaceRoot}', workspace);
    setEdits((prev) => prev!.map((e) => ({ ...e, command: sub(e.command), args: sub(e.args), url: sub(e.url) })));
  };

  const runImport = () => {
    const servers = edits!
      .filter((e) => e.selected)
      .map((e) => ({ name: e.name, transport: toTransport(e) }));
    importer.mutate(servers, { onSuccess: () => close() });
  };

  const selectedCount = edits?.filter((e) => e.selected).length ?? 0;
  const showWorkspace = edits?.some((e) => unresolvedVars(e.command, e.args, e.url).length > 0) ?? false;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Import MCP servers</SheetTitle>
          <SheetDescription>
            Paste or upload a client config (Claude Desktop, Cursor, VS Code, Antigravity, Windsurf…). Detect the servers, edit if needed, then import.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
          {!edits ? (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder={PLACEHOLDER}
                className="font-mono text-xs"
              />
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0] ?? undefined)}
              />
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload a config file
              </Button>
            </>
          ) : (
            <>
              {topWarnings.length > 0 && (
                <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
                  {topWarnings.map((w, i) => (
                    <div key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><span>{w}</span></div>
                  ))}
                </div>
              )}

              {showWorkspace && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <Label htmlFor="ws" className="text-xs">Workspace path</Label>
                  <div className="mt-1 flex gap-2">
                    <Input id="ws" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="/Users/me/projects/app" className="font-mono text-xs" />
                    <Button variant="secondary" size="sm" onClick={applyWorkspace} disabled={!workspace.trim()}>Apply</Button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Replaces <code>{'${workspaceFolder}'}</code> in the rows below with this path.</p>
                </div>
              )}

              {edits.length === 0 ? (
                <div className="text-sm text-muted-foreground">No servers detected in this config.</div>
              ) : (
                <div className="space-y-2">
                  {edits.map((e, i) => {
                    const warns = unresolvedVars(e.command, e.args, e.url);
                    return (
                      <div key={i} className="space-y-2 rounded-md border border-border p-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={e.selected}
                            onChange={() => patch(i, { selected: !e.selected })}
                            className="h-4 w-4 accent-primary"
                            aria-label={`Import ${e.name}`}
                          />
                          <Input
                            value={e.name}
                            onChange={(ev) => patch(i, { name: ev.target.value })}
                            className="h-8 flex-1 font-medium"
                            aria-label={`Name for ${e.name}`}
                          />
                          <Badge variant="secondary" className="text-[10px]">{e.type}</Badge>
                        </div>
                        {e.type === 'stdio' ? (
                          <div className="grid grid-cols-[5rem_1fr] gap-2 pl-7">
                            <Input value={e.command} onChange={(ev) => patch(i, { command: ev.target.value })} className="h-8 font-mono text-xs" placeholder="command" aria-label={`Command for ${e.name}`} />
                            <Input value={e.args} onChange={(ev) => patch(i, { args: ev.target.value })} className="h-8 font-mono text-xs" placeholder="args" aria-label={`Args for ${e.name}`} />
                          </div>
                        ) : (
                          <div className="pl-7">
                            <Input value={e.url} onChange={(ev) => patch(i, { url: ev.target.value })} className="h-8 font-mono text-xs" placeholder="https://…" aria-label={`URL for ${e.name}`} />
                          </div>
                        )}
                        {warns.length > 0 && (
                          <div className="pl-7 text-[11px] text-amber-600">⚠ Unresolved {warns.join(', ')} — set the Workspace path above or edit inline.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <SheetFooter>
          {!edits ? (
            <>
              <Button variant="secondary" onClick={close}>Cancel</Button>
              <Button onClick={runDetect} disabled={!text.trim() || detect.isPending}>
                {detect.isPending ? 'Detecting…' : 'Detect servers'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEdits(null)}>Back</Button>
              <Button onClick={runImport} disabled={selectedCount === 0 || importer.isPending}>
                {importer.isPending ? 'Importing…' : `Import ${selectedCount} server${selectedCount === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
