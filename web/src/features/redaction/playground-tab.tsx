import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useRedactionTest } from './api';
import type { RedactionMode } from './types';

const MODE_TONE: Record<RedactionMode, 'default' | 'destructive' | 'secondary'> = {
  redact: 'default', block: 'destructive', warn: 'secondary',
};

const SAMPLE = `My GitHub token is ghp_abc123def456ghi789jkl012mno345pqr67890
A user email: user@example.com
AWS key: AKIA1234567890ABCDEF
Database: postgres://admin:secret@db.internal:5432/myapp
JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc123`;

export function PlaygroundTab() {
  const [text, setText] = useState(SAMPLE);
  const [scope, setScope] = useState<'request' | 'response'>('request');
  const test = useRedactionTest();
  const result = test.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Sample text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="w-full min-h-32 rounded-md border bg-background p-2 font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste arbitrary text or JSON to scan against all enabled redaction rules"
          />
          <div className="flex items-center gap-3">
            <Label className="text-xs">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as 'request' | 'response')}>
              <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="request">Request</SelectItem>
                <SelectItem value="response">Response</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => test.mutate({ text, scope })} disabled={test.isPending || !text.trim()}>
              Scan
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Findings
              {result.blocked && <Badge variant="destructive">BLOCKED</Badge>}
              <Badge variant="outline" className="ml-auto">{result.findings.length} rule{result.findings.length === 1 ? '' : 's'} matched</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.findings.length === 0 ? (
              <div className="text-sm text-muted-foreground">No matches.</div>
            ) : (
              <div className="divide-y rounded-md border">
                {result.findings.map((f) => (
                  <div key={f.ruleId} className="px-3 py-2 flex items-center gap-3 text-sm">
                    <Badge variant={MODE_TONE[f.mode]}>{f.mode}</Badge>
                    <code className="text-xs font-mono flex-1 truncate">{f.kind}</code>
                    <span className="text-xs text-muted-foreground">{f.ruleName}</span>
                    <Badge variant="outline" className="tabular-nums">×{f.count}</Badge>
                  </div>
                ))}
              </div>
            )}
            <div>
              <Label className="text-xs">Redacted output</Label>
              <pre className="mt-1 rounded-md border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap overflow-x-auto">
                {typeof result.redacted === 'string' ? result.redacted : JSON.stringify(result.redacted, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
