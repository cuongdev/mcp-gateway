import { useState, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { useCircuits } from './api';
import { CircuitCard } from './card';
import type { ServerHealthState } from './types';

const FILTERS: Array<{ key: 'all' | ServerHealthState; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'circuit_open', label: 'Open' },
  { key: 'degraded', label: 'Degraded' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'manual_disabled', label: 'Disabled' },
];

export function CircuitsPage() {
  const { data, isLoading } = useCircuits();
  const [filter, setFilter] = useState<typeof FILTERS[number]['key']>('all');
  const circuits = useMemo(() => {
    const list = data?.circuits ?? [];
    if (filter === 'all') return list;
    return list.filter((c) => c.state === filter);
  }, [data, filter]);
  const counts = useMemo<Record<typeof FILTERS[number]['key'], number>>(() => {
    const list = data?.circuits ?? [];
    return {
      all: list.length,
      healthy: list.filter((c) => c.state === 'healthy').length,
      degraded: list.filter((c) => c.state === 'degraded').length,
      circuit_open: list.filter((c) => c.state === 'circuit_open').length,
      half_open: list.filter((c) => c.state === 'half_open').length,
      quarantined: list.filter((c) => c.state === 'quarantined').length,
      manual_disabled: list.filter((c) => c.state === 'manual_disabled').length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Circuits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-server circuit breakers — auto-trip on repeated upstream failures and recover with half-open probes
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label} <Badge variant="outline" className="ml-1">{counts[f.key] ?? 0}</Badge>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : circuits.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={filter === 'all' ? 'No circuits tracked' : `No ${filter.replace('_', ' ')} circuits`}
          description={filter === 'all'
            ? 'Circuits initialise lazily after the first call to each upstream server.'
            : 'All servers are in another state — try another filter.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {circuits.map((c) => <CircuitCard key={c.serverName} circuit={c} />)}
        </div>
      )}

      <Outlet />
    </div>
  );
}
