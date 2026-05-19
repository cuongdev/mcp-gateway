import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, Key } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthMe } from '@/lib/use-auth-me';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const { data: me } = useAuthMe();
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!me) return null;
  const initials = (me.displayName ?? me.email ?? me.principalId).slice(0, 2).toUpperCase();

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST', silent401: true });
    } catch { /* ignore */ }
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <Avatar className="h-7 w-7"><AvatarFallback>{initials}</AvatarFallback></Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-medium">{me.displayName}</div>
          <div className="text-xs text-muted-foreground">{me.email ?? me.principalId}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me.type === 'user' && (
          <DropdownMenuItem onClick={() => navigate('/my-tokens')}>
            <Key className="mr-2 h-4 w-4" /> My Tokens
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <UserIcon className="mr-2 h-4 w-4" /> Profile & Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
