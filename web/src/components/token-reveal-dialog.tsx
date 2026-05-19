import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CopyButton } from './copy-button';

/**
 * One-time secret reveal. Renders a non-dismissible dialog with the raw
 * token + copy button + "I've saved it" confirm.
 *
 * Callers control the lifecycle: pass `token` to open; pass `null` to close.
 * `onClose` fires after the user clicks "I've saved it".
 */
export function TokenRevealDialog({
  token, label = 'Token', onClose,
}: { token: string | null; label?: string; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  if (!token) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && confirmed) onClose(); }}>
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {label} created
          </DialogTitle>
          <DialogDescription>
            Copy this {label.toLowerCase()} now. It will not be shown again — if you lose it, you'll have to rotate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3">
            <code className="flex-1 break-all font-mono text-xs">{token}</code>
            <CopyButton value={token} label={label.toLowerCase()} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => { setConfirmed(true); onClose(); }}
          >
            I've saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
