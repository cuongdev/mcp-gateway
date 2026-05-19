import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { useAudit } from './api';

type GroupBy = 'principal' | 'tool' | 'server';
type RangePreset = '1h' | '24h' | '7d';

const PRESETS: Record<RangePreset, number> = {
  '1h':  60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':   7 * 24 * 60 * 60 * 1000,
};

export function AuditPage() {
  const [by, setBy] = useState<GroupBy>('principal');
  const [preset, setPreset] = useState<RangePreset>('24h');
  const [action, setAction] = useState<string>('tool.call');
  const [search, setSearch] = useState('');
  const since = useMemo(() => Date.now() - PRESETS[preset], [preset]);

  const { data } = useAudit({ since, by, action: action || undefined });
  const rows = (data?.series ?? []).filter((r) =>
    search === '' || r.key.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aggregated audit log — counts grouped by {by} over the last {preset}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(['1h', '24h', '7d'] as RangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded ${preset === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <Select value={by} onValueChange={(v) => setBy(v as GroupBy)}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="principal">By principal</SelectItem>
              <SelectItem value="tool">By tool</SelectItem>
              <SelectItem value="server">By server</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder={`Search ${by}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Input
          placeholder="Action filter (default: tool.call)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {rows.length} entries · action="{action || 'all'}"
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={ScrollText} title="No audit data in this range" description="Audit entries appear here once tools have been called." />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <code className="font-mono">{r.key}</code>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">success {r.success}</Badge>
                    {r.denied > 0 && <Badge variant="outline">denied {r.denied}</Badge>}
                    {r.error > 0 && <Badge variant="destructive">error {r.error}</Badge>}
                    <span className="ml-2 font-medium tabular-nums">{r.total}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
