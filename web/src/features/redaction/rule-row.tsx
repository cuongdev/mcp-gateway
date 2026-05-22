import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDestructive } from '@/components/confirm-destructive';
import { Trash2 } from 'lucide-react';
import type { RedactionRule, RedactionMode } from './types';
import { useUpdateRedactionRule, useDeleteRedactionRule } from './api';

const MODE_LABEL: Record<RedactionMode, string> = {
  redact: 'Redact',
  block:  'Block',
  warn:   'Warn',
};
const MODE_TONE: Record<RedactionMode, 'default' | 'destructive' | 'secondary'> = {
  redact: 'default', block: 'destructive', warn: 'secondary',
};

export function RuleRow({ rule, hitCount = 0 }: { rule: RedactionRule; hitCount?: number }) {
  const update = useUpdateRedactionRule();
  const del = useDeleteRedactionRule();
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(checked) => update.mutate({ id: rule.id, patch: { enabled: checked } })}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{rule.name}</div>
          <code className="text-xs text-muted-foreground font-mono truncate block max-w-md">
            {rule.kind}
          </code>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-xs text-muted-foreground tabular-nums w-16 text-right">
          {hitCount.toLocaleString()} hits
        </div>
        <Select value={rule.mode} onValueChange={(v) => update.mutate({ id: rule.id, patch: { mode: v as RedactionMode } })}>
          <SelectTrigger className="w-28 h-8">
            <SelectValue>
              <Badge variant={MODE_TONE[rule.mode]} className="font-normal">{MODE_LABEL[rule.mode]}</Badge>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="redact">Redact</SelectItem>
            <SelectItem value="block">Block</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
          </SelectContent>
        </Select>
        {!rule.builtIn && (
          <ConfirmDestructive
            trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>}
            title={`Delete "${rule.name}"?`}
            description="Custom redaction rule will be permanently removed."
            onConfirm={() => del.mutate(rule.id)}
          />
        )}
      </div>
    </div>
  );
}
