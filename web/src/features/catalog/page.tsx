import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Package } from 'lucide-react';
import { useConnectors, useInstalls, useUninstallConnector } from './api';
import { ConnectorCard } from './card';
import { InstallWizard } from './install-wizard';
import type { ConnectorTemplate, ConnectorCategory } from './types';
import { EmptyState } from '@/components/empty-state';

const CATEGORIES: Array<{ key: 'all' | ConnectorCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'developer-tools', label: 'Developer' },
  { key: 'databases', label: 'Databases' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'cloud', label: 'Cloud' },
  { key: 'ai-ml', label: 'AI/ML' },
  { key: 'communications', label: 'Comms' },
  { key: 'local', label: 'Local' },
];

export function CatalogPage() {
  const { data: connData } = useConnectors();
  const { data: installData } = useInstalls();
  const uninstall = useUninstallConnector();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | ConnectorCategory>('all');
  const [active, setActive] = useState<ConnectorTemplate | null>(null);

  const installedSet = useMemo(() => {
    const s = new Set<string>();
    for (const i of installData?.installs ?? []) s.add(i.connectorId);
    return s;
  }, [installData]);

  const filtered = useMemo(() => {
    const list = connData?.connectors ?? [];
    return list.filter((t) =>
      (category === 'all' || t.category === category) &&
      (!search || t.displayName.toLowerCase().includes(search.toLowerCase()) || t.id.includes(search.toLowerCase())),
    );
  }, [connData, category, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Catalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One-click templates for popular MCP servers — GitHub, Postgres, Slack, and more.
        </p>
      </div>

      <Tabs defaultValue="browse" className="space-y-4">
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="installed">Installed {installData?.installs.length ? <Badge variant="secondary" className="ml-1">{installData.installs.length}</Badge> : null}</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search connectors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No connectors match"
              description="Try a different search term or category."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((t) => (
                <ConnectorCard
                  key={t.id}
                  template={t}
                  installed={installedSet.has(t.id)}
                  onInstall={() => setActive(t)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="installed">
          {(installData?.installs ?? []).length === 0 ? (
            <EmptyState icon={Package} title="No installed connectors" description="Browse the catalog to install one." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="grid grid-cols-12 gap-3 px-4 py-2 border-b text-xs font-medium text-muted-foreground">
                  <div className="col-span-3">Server</div>
                  <div className="col-span-3">Connector</div>
                  <div className="col-span-2">Version</div>
                  <div className="col-span-3">Installed</div>
                  <div className="col-span-1 text-right">Actions</div>
                </div>
                {(installData?.installs ?? []).map((i) => (
                  <div key={i.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 items-center text-sm">
                    <div className="col-span-3"><code className="font-mono text-xs">{i.serverName}</code></div>
                    <div className="col-span-3">{i.connectorId}</div>
                    <div className="col-span-2">
                      {i.templateVersion}
                      {i.updateAvailable && <Badge variant="secondary" className="ml-2 text-xs">update</Badge>}
                    </div>
                    <div className="col-span-3 text-xs text-muted-foreground">
                      {new Date(i.installedAt).toLocaleDateString()}
                      {i.installedBy && <span> · {i.installedBy}</span>}
                    </div>
                    <div className="col-span-1 text-right">
                      <ConfirmDestructive
                        trigger={<Button variant="ghost" size="sm">Uninstall</Button>}
                        title={`Uninstall "${i.serverName}"?`}
                        description="The server will be deregistered and the install record removed."
                        confirmLabel="Uninstall"
                        onConfirm={() => uninstall.mutate(i.id)}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {active && (
        <InstallWizard template={active} open onOpenChange={(o) => !o && setActive(null)} />
      )}
    </div>
  );
}
