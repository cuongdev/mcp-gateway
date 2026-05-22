import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCircuit, useTripCircuit, useCloseCircuit, useResetCircuit, useUpdateCircuitConfig } from './api';
import { Sparkline } from './sparkline';
import { ConfirmDestructive } from '@/components/confirm-destructive';

export function CircuitDetailSheet() {
  const { server } = useParams<{ server: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useCircuit(server);
  const trip = useTripCircuit();
  const close = useCloseCircuit();
  const reset = useResetCircuit();
  const updateConfig = useUpdateCircuitConfig();

  const c = data?.circuit;
  const [errorRate, setErrorRate] = useState('');
  const [cooldownMs, setCooldownMs] = useState('');
  const [consec, setConsec] = useState('');

  const onSaveConfig = () => {
    if (!server) return;
    const config: Record<string, number> = {};
    if (errorRate) config.errorRateThreshold = Number(errorRate);
    if (cooldownMs) config.cooldownMs = Number(cooldownMs);
    if (consec) config.consecutiveErrorsToTrip = Number(consec);
    if (Object.keys(config).length === 0) return;
    updateConfig.mutate({ server, config });
    setErrorRate(''); setCooldownMs(''); setConsec('');
  };

  return (
    <Sheet open onOpenChange={(o) => !o && navigate('/circuits')}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono">{server}</SheetTitle>
          <SheetDescription>Circuit breaker details and configuration</SheetDescription>
        </SheetHeader>

        {isLoading || !c ? (
          <div className="text-sm text-muted-foreground py-8">Loading…</div>
        ) : (
          <div className="space-y-6 mt-6">
            <section className="space-y-2">
              <Label>Current state</Label>
              <div className="flex items-center gap-2">
                <Badge variant={c.state === 'healthy' ? 'secondary' : c.state === 'circuit_open' ? 'destructive' : 'default'}>
                  {c.state.replace('_', ' ')}
                </Badge>
                {c.lastTransitionReason && (
                  <span className="text-xs text-muted-foreground">— {c.lastTransitionReason}</span>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <Label>Recent calls (last {c.config.windowSize})</Label>
              <Sparkline rolling={c.rolling} windowSize={c.config.windowSize} />
              <div className="text-xs text-muted-foreground">
                {c.rolling.length} call{c.rolling.length === 1 ? '' : 's'} • {c.rolling.filter((r) => r.success).length} ok • {c.rolling.filter((r) => !r.success).length} failed
              </div>
            </section>

            <section className="space-y-2">
              <Label>Config</Label>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Error rate threshold</div>
                  <div>{c.config.errorRateThreshold}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Window size</div>
                  <div>{c.config.windowSize}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Trip after consecutive errors</div>
                  <div>{c.config.consecutiveErrorsToTrip}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Cooldown ms</div>
                  <div>{c.config.cooldownMs}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Reopen count</div>
                  <div>{c.reopenCount}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Total calls</div>
                  <div>{c.totalCallsSinceRegister.toLocaleString()}</div>
                </div>
              </div>
            </section>

            <section className="space-y-2 pt-2 border-t">
              <Label>Override config</Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Error rate</Label>
                  <Input type="number" step="0.05" min="0" max="1" placeholder={String(c.config.errorRateThreshold)} value={errorRate} onChange={(e) => setErrorRate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Cooldown ms</Label>
                  <Input type="number" placeholder={String(c.config.cooldownMs)} value={cooldownMs} onChange={(e) => setCooldownMs(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Consec. errors</Label>
                  <Input type="number" placeholder={String(c.config.consecutiveErrorsToTrip)} value={consec} onChange={(e) => setConsec(e.target.value)} />
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={onSaveConfig} disabled={updateConfig.isPending || (!errorRate && !cooldownMs && !consec)}>
                Save config override
              </Button>
            </section>

            <section className="space-y-2 pt-4 border-t">
              <Label>Manual actions</Label>
              <div className="flex flex-wrap gap-2">
                {c.state !== 'circuit_open' && c.state !== 'quarantined' && (
                  <Button size="sm" variant="outline" disabled={trip.isPending}
                    onClick={() => trip.mutate({ server: server!, reason: 'manual' })}>
                    Trip
                  </Button>
                )}
                {(c.state === 'circuit_open' || c.state === 'quarantined' || c.state === 'manual_disabled') && (
                  <Button size="sm" variant="outline" disabled={close.isPending}
                    onClick={() => close.mutate({ server: server!, reason: 'manual' })}>
                    Close
                  </Button>
                )}
                <ConfirmDestructive
                  trigger={<Button size="sm" variant="ghost">Reset counters</Button>}
                  title="Reset counters?"
                  description="This zeros the rolling window and consecutive error count. State returns to healthy."
                  onConfirm={() => reset.mutate({ server: server! })}
                />
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
