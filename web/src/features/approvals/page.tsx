import { useState } from 'react';
import { BadgeCheck, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { useApprove, usePendingApprovals, useReject } from './api';
import type { Approval } from '@/types/api';

function safeParseArgs(json: string): unknown {
  try { return JSON.parse(json); } catch { return json; }
}

function ApprovalCard({ approval }: { approval: Approval }) {
  const [reason, setReason] = useState('');
  const approve = useApprove();
  const reject = useReject();
  const expiresIn = Math.max(0, Math.floor((approval.tsExpires - Date.now()) / 1000));
  const args = safeParseArgs(approval.argsJson);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-2 text-base">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm text-primary">{approval.tool}</code>
              <Badge variant="outline">{approval.status}</Badge>
            </div>
            <p className="text-xs font-normal text-muted-foreground">
              Requested by <code className="font-mono">{approval.principalId}</code>
              {' · '}expires in {expiresIn}s
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">View args</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">{JSON.stringify(args, null, 2)}</pre>
        </details>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional reason"
          rows={2}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={approve.isPending || reject.isPending}
            onClick={() => approve.mutate({ id: approval.id, reason: reason || undefined })}
          >
            <Check className="h-4 w-4" /> Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={approve.isPending || reject.isPending}
            onClick={() => reject.mutate({ id: approval.id, reason: reason || undefined })}
          >
            <X className="h-4 w-4" /> Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApprovalsPage() {
  const { data, dataUpdatedAt } = usePendingApprovals();
  const approvals = data?.approvals ?? [];
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approvals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pending tool-call requests awaiting approver decision</p>
        </div>
        <Badge variant="outline" className="text-xs">Last updated {lastUpdated} · polling 10s</Badge>
      </div>

      {approvals.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="No pending approvals"
          description="Approval requests appear here when a tool call triggers an approval rule."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {approvals.map((a) => <ApprovalCard key={a.id} approval={a} />)}
        </div>
      )}
    </div>
  );
}
