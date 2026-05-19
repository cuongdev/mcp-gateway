import { Outlet, useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { CopyButton } from '@/components/copy-button';
import { useGroups } from './api';

export function GroupsPage() {
  const navigate = useNavigate();
  const { data } = useGroups();
  const groups = data?.groups ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tool Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">Curated tool subsets with dedicated MCP endpoints</p>
        </div>
        <Button onClick={() => navigate('/groups/new')}>
          <Plus className="h-4 w-4" /> Create Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No tool groups yet"
          description="Groups let you expose curated subsets of tools to specific AI agents via dedicated /mcp/groups/<name> endpoints."
          action={<Button onClick={() => navigate('/groups/new')}><Plus className="h-4 w-4" /> Create Group</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <Card
              key={g.name}
              onClick={() => navigate(`/groups/${encodeURIComponent(g.name)}`)}
              className="cursor-pointer transition-colors hover:bg-accent/50"
            >
              <CardHeader>
                <CardTitle className="text-base">{g.name}</CardTitle>
                {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {g.tools.slice(0, 6).map((t) => (
                    <Badge key={t} variant="secondary" className="font-mono text-[10px]">{t}</Badge>
                  ))}
                  {g.tools.length > 6 && <Badge variant="outline">+{g.tools.length - 6} more</Badge>}
                  {g.tools.length === 0 && <span className="text-xs text-muted-foreground">No tools assigned</span>}
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <div className="flex gap-1">
                    {g.allowedRoles.map((r) => (
                      <Badge key={r} variant="outline">{r}</Badge>
                    ))}
                    {g.allowedRoles.length === 0 && <Badge variant="outline">All roles</Badge>}
                  </div>
                  <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <code className="font-mono">/mcp/groups/{g.name}</code>
                    <CopyButton value={`/mcp/groups/${g.name}`} label="endpoint" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Outlet />
    </div>
  );
}
