import { useNavigate } from 'react-router-dom';
import type { KeyboardEvent } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatCard({
  label, value, icon: Icon, tone = 'default', to,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  /** When set, the card becomes a link to this route. */
  to?: string;
}) {
  const navigate = useNavigate();
  const ring = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-500/10 text-green-500',
    warning: 'bg-amber-500/10 text-amber-500',
    danger: 'bg-destructive/10 text-destructive',
  }[tone];
  const clickable = !!to;
  return (
    <Card
      className={cn(clickable && 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30')}
      {...(clickable
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: () => navigate(to),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(to); }
            },
          }
        : {})}
    >
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-bold">{value}</div>
        </div>
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-lg', ring)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
