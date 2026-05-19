import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthMe } from '@/lib/use-auth-me';

export function AuthGate() {
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const handler = () => navigate('/login', { replace: true, state: { from: loc } });
    window.addEventListener('mcp:unauth', handler);
    return () => window.removeEventListener('mcp:unauth', handler);
  }, [navigate, loc]);

  const { data, isLoading } = useAuthMe();

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
