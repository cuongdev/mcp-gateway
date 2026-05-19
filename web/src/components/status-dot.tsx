import { cn } from '@/lib/utils';

export function StatusDot({ ok, className }: { ok: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        ok ? 'bg-green-500 animate-pulse' : 'bg-red-500',
        className,
      )}
    />
  );
}
