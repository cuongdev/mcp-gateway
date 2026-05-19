import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/empty-state';
import { usePrompts, useTogglePrompt } from './api';
import type { PromptSummary } from '@/types/api';

function groupByServer(prompts: PromptSummary[]): Map<string, PromptSummary[]> {
  const m = new Map<string, PromptSummary[]>();
  for (const p of prompts) {
    const arr = m.get(p.serverName) ?? [];
    arr.push(p);
    m.set(p.serverName, arr);
  }
  return m;
}

export function PromptsPage() {
  const { data } = usePrompts({ enabledOnly: false });
  const toggle = useTogglePrompt();
  const prompts = data?.prompts ?? [];
  const groups = Array.from(groupByServer(prompts).entries());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prompts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Server-defined prompts discovered via MCP prompts/list</p>
      </div>

      {prompts.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No prompts discovered"
          description="Prompts are auto-discovered when a server is registered and responds to MCP prompts/list."
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([server, list]) => (
            <Card key={server}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{server}</span>
                  <Badge variant="secondary">{list.length} prompt{list.length === 1 ? '' : 's'}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {list.map((p) => (
                  <div key={p.canonicalName} className="flex items-start justify-between py-3 first:pt-0 last:pb-0">
                    <div>
                      <div className="font-mono text-sm">{p.originalName}</div>
                      {p.description && <div className="mt-0.5 text-xs text-muted-foreground">{p.description}</div>}
                    </div>
                    <Label htmlFor={`prompt-${p.canonicalName}`} className="sr-only">Toggle {p.canonicalName}</Label>
                    <Switch
                      id={`prompt-${p.canonicalName}`}
                      checked={p.enabled}
                      disabled={toggle.isPending}
                      onCheckedChange={(checked) => toggle.mutate({ name: p.canonicalName, enabled: checked })}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
