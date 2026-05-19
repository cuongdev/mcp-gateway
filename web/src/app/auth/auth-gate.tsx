import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { AuthMe } from '@/types/api';

async function fetchMe(): Promise<AuthMe | null> {
  try {
    return await api<AuthMe>('/auth/me', { silent401: true });
  } catch {
    return null;
  }
}

export function AuthGate() {
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const handler = () => navigate('/login', { replace: true, state: { from: loc } });
    window.addEventListener('mcp:unauth', handler);
    return () => window.removeEventListener('mcp:unauth', handler);
  }, [navigate, loc]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.authMe,
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
