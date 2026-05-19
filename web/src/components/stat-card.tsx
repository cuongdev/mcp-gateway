import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatCard({
  label, value, icon: Icon, tone = 'default',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  const ring = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-500/10 text-green-500',
    warning: 'bg-amber-500/10 text-amber-500',
    danger: 'bg-destructive/10 text-destructive',
  }[tone];
  return (
    <Card>
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
