import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInvalidateCache } from './api';

export function CachePage() {
  const [tool, setTool] = useState('');
  const [principal, setPrincipal] = useState('');
  const invalidate = useInvalidateCache();

  const submit = async () => {
    if (!tool && !principal) return;
    try {
      await invalidate.mutateAsync({
        tool: tool || undefined,
        principal: principal || undefined,
      });
      setTool(''); setPrincipal('');
    } catch { /* toast handled in hook */ }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cache</h1>
        <p className="mt-1 text-sm text-muted-foreground">Invalidate cached tool-call responses</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4" /> Invalidate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Specify a canonical tool name, a principal ID, or both. Cache entries matching either filter will be removed.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="tool">Tool (canonical name)</Label>
            <Input id="tool" value={tool} onChange={(e) => setTool(e.target.value)} placeholder="db__query" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="principal">Principal ID</Label>
            <Input id="principal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="usr_xxx or sa_xxx or mc_xxx" />
          </div>
          <Button onClick={submit} disabled={invalidate.isPending || (!tool && !principal)}>
            {invalidate.isPending ? 'Invalidating…' : 'Invalidate cache'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
