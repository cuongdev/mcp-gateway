import { NavLink } from 'react-router-dom';
import {
  Home, Server, Wrench, LayoutGrid, MessageSquare, Network,
  Users, Bot, Key, ShieldCheck, Lock,
  Gauge, Database, Boxes, BadgeCheck,
  BarChart3, ScrollText, Activity, HeartPulse,
  Building2, Webhook, Settings, Command as CommandIcon,
} from 'lucide-react';
import { useAuthMe } from '@/lib/use-auth-me';
import { cn } from '@/lib/utils';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';
import type { AuthMe } from '@/types/api';
import type { LucideIcon } from 'lucide-react';

interface Item { to: string; label: string; icon: LucideIcon; gated?: (me: AuthMe | null) => boolean; }
interface Group { id: string; label: string; items: Item[]; defaultOpen?: boolean; }

const groups: Group[] = [
  {
    id: 'routing', label: 'Routing', defaultOpen: true,
    items: [
      { to: '/servers', label: 'Servers', icon: Server },
      { to: '/tools', label: 'Tools', icon: Wrench },
      { to: '/groups', label: 'Tool Groups', icon: LayoutGrid },
      { to: '/prompts', label: 'Prompts', icon: MessageSquare },
      { to: '/proxies', label: 'Proxies', icon: Network },
    ],
  },
  {
    id: 'identity', label: 'Identity', defaultOpen: true,
    items: [
      { to: '/users', label: 'Users', icon: Users, gated: (me) => me?.roles.includes('admin') ?? false },
      { to: '/mcp-clients', label: 'MCP Clients', icon: Bot, gated: (me) => me?.roles.includes('admin') ?? false },
      { to: '/my-tokens', label: 'My Tokens', icon: Key, gated: (me) => me?.type === 'user' },
      { to: '/oidc', label: 'OIDC Providers', icon: ShieldCheck, gated: (me) => me?.roles.includes('admin') ?? false },
      { to: '/policies', label: 'Policies', icon: Lock, gated: (me) => me?.roles.includes('admin') ?? false },
    ],
  },
  {
    id: 'reliability', label: 'Reliability',
    items: [
      { to: '/rate-limit', label: 'Rate Limit', icon: Gauge },
      { to: '/quota', label: 'Quota', icon: Database },
      { to: '/cache', label: 'Cache', icon: Boxes },
      { to: '/approvals', label: 'Approvals', icon: BadgeCheck },
    ],
  },
  {
    id: 'observability', label: 'Observability',
    items: [
      { to: '/usage', label: 'Usage', icon: BarChart3 },
      { to: '/audit', label: 'Audit', icon: ScrollText },
      { to: '/metrics', label: 'Metrics', icon: Activity },
      { to: '/health', label: 'Health', icon: HeartPulse },
    ],
  },
  {
    id: 'system', label: 'System',
    items: [
      { to: '/tenants', label: 'Tenants', icon: Building2 },
      { to: '/webhooks', label: 'Webhooks', icon: Webhook },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const { data: me } = useAuthMe();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          D
        </div>
        <div>
          <div className="text-sm font-bold">MCP Gateway</div>
          <div className="text-xs text-muted-foreground">MCP Proxy</div>
        </div>
      </div>
      <button
        onClick={onOpenCommandPalette}
        className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
      >
        <CommandIcon className="h-3.5 w-3.5" /> <span>Search…</span>
        <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
      </button>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <SidebarItem to="/overview" label="Overview" Icon={Home} />
        <div className="mt-2 space-y-1">
          {groups.map((g) => (
            <SidebarGroup key={g.id} group={g} me={me ?? null} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

function SidebarGroup({ group, me }: { group: Group; me: AuthMe | null }) {
  const [open, setOpen] = useState(group.defaultOpen ?? false);
  const items = group.items.filter((i) => !i.gated || i.gated(me));
  if (items.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <span>{group.label}</span>
        <span className="text-muted-foreground">{open ? '▾' : '▸'}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pt-1">
        {items.map((i) => (
          <SidebarItem key={i.to} to={i.to} label={i.label} Icon={i.icon} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SidebarItem({ to, label, Icon }: { to: string; label: string; Icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  );
}
