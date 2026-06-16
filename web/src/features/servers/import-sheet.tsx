import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, AlertTriangle } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useImportPreview, useImportServers, type ImportPreview } from './api';

const PLACEHOLDER = `{
  "mcpServers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "ghp_…" } },
    "api": { "url": "https://api.example.com/mcp" }
  }
}`;

export function ServerImportSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/servers');

  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const detect = useImportPreview();
  const importer = useImportServers();

  const runDetect = () => {
    detect.mutate(text, {
      onSuccess: (data) => {
        setPreview(data);
        setSelected(new Set(data.servers.map((s) => s.name)));
      },
    });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setPreview(null);
  };

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const runImport = () => {
    importer.mutate({ config: text, only: [...selected] }, { onSuccess: () => close() });
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Import MCP servers</SheetTitle>
          <SheetDescription>
            Paste or upload a client config (Claude Desktop, Cursor, VS Code, Antigravity, Windsurf…). We detect the servers, then you pick which to import.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
          {!preview ? (
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
              {preview.warnings.length > 0 && (
                <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {preview.servers.length === 0 ? (
                <div className="text-sm text-muted-foreground">No servers detected in this config.</div>
              ) : (
                <div className="space-y-2">
                  {preview.servers.map((s) => (
                    <label
                      key={s.name}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(s.name)}
                        onChange={() => toggle(s.name)}
                        className="mt-1 h-4 w-4 accent-primary"
                        aria-label={`Import ${s.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{s.transport.type}</Badge>
                        </div>
                        <code className="block break-all text-xs text-muted-foreground">
                          {s.transport.command
                            ? `${s.transport.command} ${(s.transport.args ?? []).join(' ')}`.trim()
                            : s.transport.url}
                        </code>
                        {s.warnings.map((w, i) => (
                          <div key={i} className="mt-1 text-[11px] text-amber-600">⚠ {w}</div>
                        ))}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <SheetFooter>
          {!preview ? (
            <>
              <Button variant="secondary" onClick={close}>Cancel</Button>
              <Button onClick={runDetect} disabled={!text.trim() || detect.isPending}>
                {detect.isPending ? 'Detecting…' : 'Detect servers'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setPreview(null)}>Back</Button>
              <Button onClick={runImport} disabled={selected.size === 0 || importer.isPending}>
                {importer.isPending ? 'Importing…' : `Import ${selected.size} server${selected.size === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
