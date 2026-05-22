import { useMemo, useState } from 'react';
import { FolderTree, FileText, Image as ImageIcon, FileQuestion, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/empty-state';
import { useResources, useReadResource, useSetResourceEnabled } from './api';
import type { ResourceSummary, ResourceContents } from './types';

function iconForMime(mime: string | null) {
  if (!mime) return FileQuestion;
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript')) return FileText;
  return FileQuestion;
}

export function ResourcesPage() {
  const { data, isLoading } = useResources();
  const setEnabled = useSetResourceEnabled();
  const read = useReadResource();
  const [selected, setSelected] = useState<ResourceSummary | null>(null);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<string, ResourceSummary[]>();
    for (const r of data?.resources ?? []) {
      if (search && !r.uri.toLowerCase().includes(search.toLowerCase())) continue;
      const arr = map.get(r.serverName) ?? [];
      arr.push(r);
      map.set(r.serverName, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data, search]);

  const handleRead = (r: ResourceSummary) => {
    setSelected(r);
    read.mutate({ canonical: r.canonicalName });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          MCP resources discovered from upstream servers. Read text, JSON, or media payloads.
        </p>
      </div>
      <Input
        placeholder="Search by URI…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : grouped.length === 0 ? (
            <EmptyState icon={FolderTree} title="No resources" description="Resources are auto-discovered via /servers/:name/sync." />
          ) : (
            grouped.map(([server, items]) => (
              <Card key={server}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono">{server}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {items.map((r) => {
                      const Icon = iconForMime(r.mimeType);
                      const active = selected?.canonicalName === r.canonicalName;
                      return (
                        <button
                          key={r.canonicalName}
                          onClick={() => handleRead(r)}
                          className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/50 ${active ? 'bg-muted' : ''}`}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <code className="text-xs truncate block">{r.name || r.uri}</code>
                            <div className="text-xs text-muted-foreground truncate">{r.mimeType ?? 'binary'}</div>
                          </div>
                          {!r.enabled && <Badge variant="outline" className="text-xs">disabled</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        <div className="lg:col-span-2">
          {selected ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-sm">{selected.name || selected.uri}</CardTitle>
                    <code className="text-xs text-muted-foreground break-all">{selected.uri}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{selected.mimeType ?? 'binary'}</Badge>
                    <Switch
                      checked={selected.enabled}
                      onCheckedChange={(v) => setEnabled.mutate({ canonical: selected.canonicalName, enabled: v })}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {read.isPending && <div className="text-sm text-muted-foreground">Loading content…</div>}
                {read.error && <div className="text-sm text-rose-600">Failed: {(read.error as Error).message}</div>}
                {read.data && <ResourceContentView contents={read.data} />}
              </CardContent>
            </Card>
          ) : (
            <EmptyState icon={FileText} title="Select a resource" description="Pick a URI from the list to read its content." />
          )}
        </div>
      </div>
    </div>
  );
}

function ResourceContentView({ contents }: { contents: ResourceContents }) {
  if (!contents.contents || contents.contents.length === 0) return <div className="text-sm text-muted-foreground">Empty</div>;
  return (
    <div className="space-y-3">
      {contents.contents.map((c, i) => {
        const mime = c.mimeType ?? 'text/plain';
        if (c.text !== undefined) {
          return (
            <pre key={i} className="rounded-md border bg-muted/30 p-3 font-mono text-xs overflow-x-auto max-h-96">
              {c.text}
            </pre>
          );
        }
        if (c.blob !== undefined && mime.startsWith('image/')) {
          return <img key={i} src={`data:${mime};base64,${c.blob}`} alt="" className="max-h-96 rounded-md border" />;
        }
        if (c.blob !== undefined) {
          return (
            <div key={i} className="rounded-md border p-3">
              <Button asChild variant="outline" size="sm">
                <a href={`data:${mime};base64,${c.blob}`} download={c.uri ?? 'resource'}>
                  <Download className="h-4 w-4" /> Download ({mime})
                </a>
              </Button>
            </div>
          );
        }
        return <div key={i} className="text-sm text-muted-foreground">No content</div>;
      })}
    </div>
  );
}
