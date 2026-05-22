import { useState, useMemo } from 'react';
import { Plus, ShieldCheck, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRedactionRules, useRedactionStats, useCreateRedactionRule } from './api';
import type { RedactionMode } from './types';
import { RuleRow } from './rule-row';

export function RulesTab() {
  const { data } = useRedactionRules();
  const { data: stats } = useRedactionStats();
  const create = useCreateRedactionRule();
  const [open, setOpen] = useState(false);

  const builtIn = useMemo(() => (data?.rules ?? []).filter((r) => r.builtIn), [data]);
  const custom = useMemo(() => (data?.rules ?? []).filter((r) => !r.builtIn), [data]);
  const hitMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of stats?.byRule ?? []) map.set(r.ruleId, r.count);
    return map;
  }, [stats]);

  // form state
  const [name, setName] = useState('');
  const [kind, setKind] = useState('custom');
  const [pattern, setPattern] = useState('');
  const [mode, setMode] = useState<RedactionMode>('redact');

  const handleCreate = () => {
    if (!name.trim() || !pattern.trim()) return;
    create.mutate(
      { name: name.trim(), kind, pattern, mode },
      { onSuccess: () => { setName(''); setKind('custom'); setPattern(''); setMode('redact'); setOpen(false); } },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New custom rule</Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Built-in rules ({builtIn.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {builtIn.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No built-in rules loaded</div>
          ) : (
            builtIn.map((r) => <RuleRow key={r.id} rule={r} hitCount={hitMap.get(r.id) ?? 0} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Custom rules ({custom.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {custom.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No custom rules. Click "New custom rule" to add one.</div>
          ) : (
            custom.map((r) => <RuleRow key={r.id} rule={r} hitCount={hitMap.get(r.id) ?? 0} />)
          )}
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New custom redaction rule</SheetTitle>
            <SheetDescription>Regex applied to request arguments and/or response content.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My internal API token" />
            </div>
            <div>
              <Label>Kind (label)</Label>
              <Input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="custom" />
            </div>
            <div>
              <Label>Pattern (ECMAScript regex)</Label>
              <Input className="font-mono text-xs" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="^secret_[A-Za-z0-9]{16}$" />
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as RedactionMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="redact">Redact — replace match with placeholder</SelectItem>
                  <SelectItem value="block">Block — reject the call entirely</SelectItem>
                  <SelectItem value="warn">Warn — pass through, only audit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter className="mt-6">
            <SheetClose asChild><Button variant="outline">Cancel</Button></SheetClose>
            <Button onClick={handleCreate} disabled={create.isPending || !name.trim() || !pattern.trim()}>Create</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
