import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CopyButton } from '@/components/copy-button';
import { cn } from '@/lib/utils';
import { useTools, usePatchTool, useToggleTool, useCallTool, type ToolCallResult } from './api';

/** Render a tools/call result readably: unwrap MCP text blocks, pretty-print
 *  any embedded JSON, and wrap long lines instead of scrolling horizontally. */
function ToolResultView({ data }: { data: ToolCallResult }) {
  const base = 'max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-2 font-mono text-[11px]';
  if (data.error) {
    return <pre className={cn(base, 'border-rose-300 text-rose-700')}>{JSON.stringify(data.error, null, 2)}</pre>;
  }
  const result = data.result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean } | null;
  const blocks = Array.isArray(result?.content) ? result!.content : null;
  const pretty = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };
  const body = blocks && blocks.length
    ? blocks.map((b) => (b.text != null ? pretty(b.text) : JSON.stringify(b, null, 2))).join('\n')
    : JSON.stringify(result, null, 2);
  return <pre className={cn(base, result?.isError && 'border-rose-300 text-rose-700')}>{body}</pre>;
}

export function ToolDetailSheet() {
  const navigate = useNavigate();
  const { canonicalName = '' } = useParams<{ canonicalName: string }>();
  const close = () => navigate('/tools');

  const { data } = useTools({ all: true });
  const tool = data?.tools.find((t) => t.name === canonicalName);

  const toggle = useToggleTool();
  const patch = usePatchTool();
  const call = useCallTool();

  const [argsText, setArgsText] = useState('{}');
  const [argsErr, setArgsErr] = useState<string | null>(null);

  const runTest = () => {
    let args: Record<string, unknown>;
    try {
      args = argsText.trim() ? JSON.parse(argsText) : {};
    } catch (e) {
      setArgsErr((e as Error).message);
      return;
    }
    setArgsErr(null);
    call.mutate({ name: tool!.name, args });
  };

  const [cacheable, setCacheable] = useState(false);
  const [cacheTtlSec, setCacheTtlSec] = useState<string>('');
  const [perPrincipal, setPerPrincipal] = useState(false);
  const [sensitive, setSensitive] = useState(false);

  useEffect(() => {
    if (!tool) return;
    setCacheable(tool.cacheable);
    setCacheTtlSec(tool.cacheTtlSec == null ? '' : String(tool.cacheTtlSec));
    setPerPrincipal(tool.cachePerPrincipal);
    setSensitive(tool.sensitive);
  }, [tool]);

  if (!tool) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Tool not found</SheetTitle>
            <SheetDescription>"{canonicalName}" is not registered.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const save = async () => {
    await patch.mutateAsync({
      name: tool.name,
      cacheable,
      cacheTtlSec: cacheTtlSec === '' ? null : Number(cacheTtlSec),
      cachePerPrincipal: perPrincipal,
      sensitive,
    });
    close();
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-base">{tool.name}</span>
            <CopyButton value={tool.name} label="tool name" />
          </SheetTitle>
          <SheetDescription>
            <Badge variant="secondary">{tool.server}</Badge>
            {tool.description && <span className="ml-2">{tool.description}</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
          <section className="flex items-center justify-between">
            <Label htmlFor="enabled" className="flex flex-col">
              <span>Enabled</span>
              <span className="text-xs font-normal text-muted-foreground">Disabled tools are hidden from MCP clients.</span>
            </Label>
            <Switch
              id="enabled"
              checked={tool.enabled}
              disabled={toggle.isPending}
              onCheckedChange={(checked) => toggle.mutate({ name: tool.name, enabled: checked })}
            />
          </section>

          <Separator />

          <section className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cache</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="cacheable">Cacheable</Label>
              <Switch id="cacheable" checked={cacheable} onCheckedChange={setCacheable} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ttl">TTL (seconds)</Label>
              <Input
                id="ttl"
                type="number"
                min={1}
                value={cacheTtlSec}
                onChange={(e) => setCacheTtlSec(e.target.value)}
                disabled={!cacheable}
                placeholder="60"
              />
              <p className="text-xs text-muted-foreground">Leave empty to use the gateway default.</p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="perPrincipal" className="flex flex-col">
                <span>Cache per principal</span>
                <span className="text-xs font-normal text-muted-foreground">Bucket cache entries by caller identity.</span>
              </Label>
              <Switch id="perPrincipal" checked={perPrincipal} onCheckedChange={setPerPrincipal} disabled={!cacheable} />
            </div>
          </section>

          <Separator />

          <section className="flex items-center justify-between">
            <Label htmlFor="sensitive" className="flex flex-col">
              <span>Sensitive</span>
              <span className="text-xs font-normal text-muted-foreground">Skip caching and auditing args.</span>
            </Label>
            <Switch id="sensitive" checked={sensitive} onCheckedChange={setSensitive} />
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Test tool</h3>
            {tool.inputSchema && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Input schema</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px]">
                  {JSON.stringify(tool.inputSchema, null, 2)}
                </pre>
              </details>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="args">Arguments (JSON)</Label>
              <Textarea
                id="args"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder='{ "path": "/tmp" }'
              />
              {argsErr && <p className="text-xs text-rose-600">Invalid JSON: {argsErr}</p>}
            </div>
            <Button variant="secondary" size="sm" onClick={runTest} disabled={call.isPending}>
              <Play className="h-4 w-4" /> {call.isPending ? 'Running…' : 'Run'}
            </Button>
            {call.data && (
              <div className="space-y-1">
                <Label className="text-xs">{call.data.error ? 'Error' : 'Result'}</Label>
                <ToolResultView data={call.data} />
              </div>
            )}
          </section>
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={save} disabled={patch.isPending}>
            {patch.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
