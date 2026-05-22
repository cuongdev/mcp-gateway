import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2 } from 'lucide-react';
import type { ConnectorTemplate, InstallOptions } from './types';
import { useInstallConnector } from './api';

type Step = 'configure' | 'preview' | 'result';

export function InstallWizard({ template, open, onOpenChange }: {
  template: ConnectorTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const install = useInstallConnector();
  const [step, setStep] = useState<Step>('configure');
  const [name, setName] = useState(template.id);
  const [env, setEnv] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<InstallOptions>({
    autoDiscover: true,
    enableCircuitBreaker: true,
    applyRedaction: true,
  });

  const requiredEnvFilled = useMemo(
    () => template.requiredEnv.every((e) => (env[e.key] ?? '').trim().length > 0),
    [template.requiredEnv, env],
  );

  const reset = () => {
    setStep('configure');
    setName(template.id);
    setEnv({});
    setOptions({ autoDiscover: true, enableCircuitBreaker: true, applyRedaction: true });
    install.reset();
  };

  const handleInstall = async () => {
    try {
      await install.mutateAsync({ connectorId: template.id, name, env, options });
      setStep('result');
    } catch {
      // toast handled in mutation
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Install: {template.displayName}</SheetTitle>
          <SheetDescription>
            Step {step === 'configure' ? '1' : step === 'preview' ? '2' : '3'} of 3 — {step === 'configure' ? 'Configure' : step === 'preview' ? 'Preview' : 'Done'}
          </SheetDescription>
        </SheetHeader>

        {step === 'configure' && (
          <div className="space-y-4 mt-6">
            <div>
              <Label>Server name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
              <p className="mt-1 text-xs text-muted-foreground">Used in canonical tool naming: {name}__&lt;tool&gt;</p>
            </div>

            {template.requiredEnv.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Required secrets</Label>
                {template.requiredEnv.map((e) => (
                  <div key={e.key}>
                    <Label className="text-xs">{e.key} {e.secret && '🔒'}</Label>
                    <Input
                      type={e.secret ? 'password' : 'text'}
                      placeholder={e.pattern ? `pattern: ${e.pattern}` : ''}
                      value={env[e.key] ?? ''}
                      onChange={(ev) => setEnv((cur) => ({ ...cur, [e.key]: ev.target.value }))}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-semibold">Options</Label>
              <div className="flex items-center justify-between">
                <Label className="text-xs cursor-pointer">Auto-discover tools after install</Label>
                <Switch checked={options.autoDiscover ?? true} onCheckedChange={(v) => setOptions((o) => ({ ...o, autoDiscover: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs cursor-pointer">Enable circuit breaker</Label>
                <Switch checked={options.enableCircuitBreaker ?? true} onCheckedChange={(v) => setOptions((o) => ({ ...o, enableCircuitBreaker: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs cursor-pointer">Apply redaction rules</Label>
                <Switch checked={options.applyRedaction ?? true} onCheckedChange={(v) => setOptions((o) => ({ ...o, applyRedaction: v }))} />
              </div>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 mt-6">
            <div>
              <Label className="text-xs">Will register server</Label>
              <pre className="mt-1 rounded-md border bg-muted/40 p-2 font-mono text-xs overflow-x-auto">
{JSON.stringify({
  name,
  transport: template.transport,
  env: Object.fromEntries(
    Object.keys(env).map((k) => {
      const def = template.requiredEnv.find((e) => e.key === k);
      return [k, def?.secret ? '***' : env[k]];
    }),
  ),
}, null, 2)}
              </pre>
            </div>
            <div>
              <Label className="text-xs">After install</Label>
              <ul className="mt-1 text-xs space-y-1 text-muted-foreground">
                <li>· Server <code className="font-mono text-foreground">{name}</code> registered</li>
                {options.autoDiscover && <li>· Tool auto-discovery triggered</li>}
                {options.enableCircuitBreaker && <li>· Circuit breaker enabled with defaults</li>}
                {options.applyRedaction && <li>· Tenant-level redaction rules active</li>}
              </ul>
            </div>
          </div>
        )}

        {step === 'result' && install.data && (
          <div className="space-y-4 mt-6 text-center py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <div className="text-lg font-semibold">Installed "{install.data.server}"</div>
              <div className="text-sm text-muted-foreground mt-1">
                {install.data.capabilitiesDiscovered} capabilit{install.data.capabilitiesDiscovered === 1 ? 'y' : 'ies'} discovered
                · v{install.data.templateVersion}
              </div>
            </div>
          </div>
        )}

        <SheetFooter className="mt-6">
          {step === 'configure' && (
            <>
              <SheetClose asChild><Button variant="outline">Cancel</Button></SheetClose>
              <Button onClick={() => setStep('preview')} disabled={!name.trim() || !requiredEnvFilled}>Next: Preview</Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('configure')}>Back</Button>
              <Button onClick={handleInstall} disabled={install.isPending}>
                {install.isPending ? 'Installing…' : 'Install'}
              </Button>
            </>
          )}
          {step === 'result' && (
            <SheetClose asChild><Button>Done</Button></SheetClose>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
