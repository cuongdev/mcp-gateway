import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CopyButton } from '@/components/copy-button';
import { useTools, usePatchTool, useToggleTool } from './api';

export function ToolDetailSheet() {
  const navigate = useNavigate();
  const { canonicalName = '' } = useParams<{ canonicalName: string }>();
  const close = () => navigate('/tools');

  const { data } = useTools({ all: true });
  const tool = data?.tools.find((t) => t.name === canonicalName);

  const toggle = useToggleTool();
  const patch = usePatchTool();

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
