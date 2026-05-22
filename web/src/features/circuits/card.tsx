import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, Zap } from 'lucide-react';
import { Sparkline } from './sparkline';
import { useTripCircuit, useCloseCircuit } from './api';
import type { CircuitSummary, ServerHealthState } from './types';

const STATE_TONE: Record<ServerHealthState, { dot: string; badge: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  healthy:         { dot: 'bg-emerald-500', badge: 'secondary' },
  degraded:        { dot: 'bg-amber-500',   badge: 'default' },
  circuit_open:    { dot: 'bg-rose-500',    badge: 'destructive' },
  half_open:       { dot: 'bg-sky-500',     badge: 'default' },
  quarantined:     { dot: 'bg-rose-700',    badge: 'destructive' },
  manual_disabled: { dot: 'bg-slate-500',   badge: 'outline' },
};

function formatRetry(openedAt: number | undefined, cooldownMs: number): string {
  if (!openedAt) return '—';
  const remaining = Math.max(0, (openedAt + cooldownMs) - Date.now());
  if (remaining === 0) return 'probing…';
  const s = Math.ceil(remaining / 1000);
  return `${s}s`;
}

function successRate(rolling: CircuitSummary['rolling']): number {
  if (rolling.length === 0) return 1;
  const ok = rolling.filter(r => r.success).length;
  return ok / rolling.length;
}

function p99(rolling: CircuitSummary['rolling']): number | null {
  if (rolling.length === 0) return null;
  const lat = rolling.map(r => r.latencyMs).sort((a, b) => a - b);
  const idx = Math.min(lat.length - 1, Math.floor(lat.length * 0.99));
  return Math.round(lat[idx]);
}

export function CircuitCard({ circuit }: { circuit: CircuitSummary }) {
  const navigate = useNavigate();
  const trip = useTripCircuit();
  const close = useCloseCircuit();
  const tone = STATE_TONE[circuit.state];
  const sr = successRate(circuit.rolling);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 rounded-full ${tone.dot} flex-shrink-0`} />
            <code className="text-sm font-mono font-semibold truncate">{circuit.serverName}</code>
          </div>
          <Badge variant={tone.badge}>{circuit.state.replace('_', ' ')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Sparkline rolling={circuit.rolling} windowSize={circuit.config.windowSize} />
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Success</div>
            <div className="font-semibold">{(sr * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-muted-foreground">p99 ms</div>
            <div className="font-semibold">{p99(circuit.rolling) ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{circuit.state === 'circuit_open' ? 'Retry' : 'Calls'}</div>
            <div className="font-semibold">
              {circuit.state === 'circuit_open'
                ? formatRetry(circuit.openedAt, circuit.config.cooldownMs)
                : circuit.totalCallsSinceRegister.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          {circuit.state === 'circuit_open' || circuit.state === 'quarantined' || circuit.state === 'manual_disabled' ? (
            <Button size="sm" variant="outline" disabled={close.isPending}
              onClick={() => close.mutate({ server: circuit.serverName })}>
              Close
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={trip.isPending}
              onClick={() => trip.mutate({ server: circuit.serverName })}>
              <Zap className="h-3 w-3" /> Trip
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => navigate(`/circuits/${encodeURIComponent(circuit.serverName)}`)}>
            Details <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
