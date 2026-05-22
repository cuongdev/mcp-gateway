import type { CallRecord } from './types';

interface SparklineProps { rolling: CallRecord[]; windowSize: number; }

export function Sparkline({ rolling, windowSize }: SparklineProps) {
  // Pad to fixed width by left-padding with placeholder dots
  const padded: Array<CallRecord | null> = [];
  const pad = windowSize - rolling.length;
  for (let i = 0; i < pad; i++) padded.push(null);
  for (const c of rolling) padded.push(c);

  return (
    <div className="flex items-center gap-px h-6">
      {padded.map((c, i) => (
        <div key={i}
          className={
            c === null
              ? 'h-1.5 w-1.5 rounded-full bg-muted'
              : c.success
                ? 'h-3 w-1.5 rounded-sm bg-emerald-500/80'
                : 'h-3 w-1.5 rounded-sm bg-rose-500/80'
          }
          title={c ? `${new Date(c.ts).toLocaleTimeString()} ${c.success ? 'ok' : c.errorCode ?? 'fail'} ${c.latencyMs}ms` : 'no data'}
        />
      ))}
    </div>
  );
}
