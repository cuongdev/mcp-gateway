import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const NAV = [
  { label: 'Overview', to: '/overview', group: 'Navigation' },
  { label: 'Servers', to: '/servers', group: 'Navigation' },
  { label: 'Tools', to: '/tools', group: 'Navigation' },
  { label: 'Tool Groups', to: '/groups', group: 'Navigation' },
  { label: 'Prompts', to: '/prompts', group: 'Navigation' },
  { label: 'Proxies', to: '/proxies', group: 'Navigation' },
  { label: 'Users', to: '/users', group: 'Navigation' },
  { label: 'MCP Clients', to: '/mcp-clients', group: 'Navigation' },
  { label: 'My Tokens', to: '/my-tokens', group: 'Navigation' },
  { label: 'OIDC Providers', to: '/oidc', group: 'Navigation' },
  { label: 'Policies', to: '/policies', group: 'Navigation' },
  { label: 'Rate Limit', to: '/rate-limit', group: 'Navigation' },
  { label: 'Quota', to: '/quota', group: 'Navigation' },
  { label: 'Cache', to: '/cache', group: 'Navigation' },
  { label: 'Approvals', to: '/approvals', group: 'Navigation' },
  { label: 'Usage', to: '/usage', group: 'Navigation' },
  { label: 'Audit', to: '/audit', group: 'Navigation' },
  { label: 'Metrics', to: '/metrics', group: 'Navigation' },
  { label: 'Health', to: '/health', group: 'Navigation' },
  { label: 'Tenants', to: '/tenants', group: 'Navigation' },
  { label: 'Webhooks', to: '/webhooks', group: 'Navigation' },
  { label: 'Settings', to: '/settings', group: 'Navigation' },
];

const ACTIONS = [
  { label: 'Register Server…', to: '/servers/new' },
  { label: 'Create Tool Group…', to: '/groups/new' },
  { label: 'Create MCP Client…', to: '/mcp-clients/new' },
  { label: 'Create User…', to: '/users/new' },
  { label: 'Create Proxy…', to: '/proxies/new' },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const go = (to: string) => { onOpenChange(false); navigate(to); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-lg">
        <Command>
          <CommandInput placeholder="Type a command or search…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Navigation">
              {NAV.map((item) => (
                <CommandItem key={item.to} onSelect={() => go(item.to)}>{item.label}</CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Quick actions">
              {ACTIONS.map((item) => (
                <CommandItem key={item.to} onSelect={() => go(item.to)}>{item.label}</CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
