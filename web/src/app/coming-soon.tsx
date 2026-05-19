import { Sparkles } from 'lucide-react';

export function ComingSoon({ phase, title }: { phase: 'B' | 'C' | 'D' | 'E'; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Ships in Phase {phase} of the frontend redesign.
      </p>
    </div>
  );
}
