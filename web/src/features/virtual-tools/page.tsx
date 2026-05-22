import { useNavigate, Outlet } from 'react-router-dom';
import { Workflow, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { useVirtualTools, useDeleteVirtualTool } from './api';

export function VirtualToolsPage() {
  const navigate = useNavigate();
  const { data } = useVirtualTools();
  const del = useDeleteVirtualTool();
  const tools = data?.tools ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Virtual Tools</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            DAG-orchestrated meta-tools that compose existing tools via a declarative plan.
          </p>
        </div>
        <Button onClick={() => navigate('/virtual-tools/new')}><Plus className="h-4 w-4" /> New virtual tool</Button>
      </div>

      {tools.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No virtual tools"
          description="Compose multiple upstream tool calls into one named virtual tool with a declarative plan."
          action={<Button onClick={() => navigate('/virtual-tools/new')}><Plus className="h-4 w-4" /> Create one</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-12 gap-3 px-4 py-2 border-b text-xs font-medium text-muted-foreground">
              <div className="col-span-4">Name</div>
              <div className="col-span-1 text-center">Steps</div>
              <div className="col-span-2">Error policy</div>
              <div className="col-span-3">Updated</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {tools.map((t) => (
              <div key={t.canonicalName} className="grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 items-center text-sm">
                <div className="col-span-4">
                  <button onClick={() => navigate(`/virtual-tools/${encodeURIComponent(t.canonicalName)}`)}
                    className="text-left hover:text-primary">
                    <code className="font-mono text-xs">{t.canonicalName}</code>
                    {!t.enabled && <Badge variant="outline" className="ml-2 text-xs">disabled</Badge>}
                  </button>
                  {t.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</div>}
                </div>
                <div className="col-span-1 text-center">
                  <Badge variant="secondary">{t.stepCount}</Badge>
                </div>
                <div className="col-span-2"><code className="text-xs">{t.errorPolicy}</code></div>
                <div className="col-span-3 text-xs text-muted-foreground">{new Date(t.updatedAt).toLocaleString()}</div>
                <div className="col-span-2 text-right">
                  <ConfirmDestructive
                    trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>}
                    title={`Delete "${t.canonicalName}"?`}
                    description="Virtual tool will be permanently removed."
                    onConfirm={() => del.mutate(t.canonicalName)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Outlet />
    </div>
  );
}
