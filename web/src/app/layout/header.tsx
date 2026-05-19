import { useLocation } from 'react-router-dom';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

function titleFromPath(path: string): string {
  const seg = path.split('/').filter(Boolean)[0] ?? 'overview';
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Header() {
  const loc = useLocation();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="text-sm text-muted-foreground">{titleFromPath(loc.pathname)}</div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
