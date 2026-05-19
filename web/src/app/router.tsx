import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Providers } from './providers';
import { AuthGate } from './auth/auth-gate';
import { LoginPage } from './auth/login';
import { Shell } from './layout/shell';
import { ComingSoon } from './coming-soon';

// Lazy feature pages
const OverviewPage = lazy(() => import('@/features/overview/page').then((m) => ({ default: m.OverviewPage })));

const ServersPage = lazy(() => import('@/features/servers/page').then((m) => ({ default: m.ServersPage })));
const ServerNewSheet = lazy(() => import('@/features/servers/new-sheet').then((m) => ({ default: m.ServerNewSheet })));
const ServerDetailSheet = lazy(() => import('@/features/servers/detail-sheet').then((m) => ({ default: m.ServerDetailSheet })));

const ToolsPage = lazy(() => import('@/features/tools/page').then((m) => ({ default: m.ToolsPage })));
const ToolDetailSheet = lazy(() => import('@/features/tools/detail-sheet').then((m) => ({ default: m.ToolDetailSheet })));

const GroupsPage = lazy(() => import('@/features/groups/page').then((m) => ({ default: m.GroupsPage })));
const GroupNewSheet = lazy(() => import('@/features/groups/new-sheet').then((m) => ({ default: m.GroupNewSheet })));
const GroupDetailSheet = lazy(() => import('@/features/groups/detail-sheet').then((m) => ({ default: m.GroupDetailSheet })));

const PoliciesPage = lazy(() => import('@/features/policies/page').then((m) => ({ default: m.PoliciesPage })));

const UsersPage = lazy(() => import('@/features/users/page').then((m) => ({ default: m.UsersPage })));
const UserNewSheet = lazy(() => import('@/features/users/new-sheet').then((m) => ({ default: m.UserNewSheet })));
const UserDetailSheet = lazy(() => import('@/features/users/detail-sheet').then((m) => ({ default: m.UserDetailSheet })));

const McpClientsPage = lazy(() => import('@/features/mcp-clients/page').then((m) => ({ default: m.McpClientsPage })));
const McpClientNewSheet = lazy(() => import('@/features/mcp-clients/new-sheet').then((m) => ({ default: m.McpClientNewSheet })));
const McpClientDetailSheet = lazy(() => import('@/features/mcp-clients/detail-sheet').then((m) => ({ default: m.McpClientDetailSheet })));

const MyTokensPage = lazy(() => import('@/features/my-tokens/page').then((m) => ({ default: m.MyTokensPage })));
const MyTokenNewSheet = lazy(() => import('@/features/my-tokens/new-sheet').then((m) => ({ default: m.MyTokenNewSheet })));

const PromptsPage = lazy(() => import('@/features/prompts/page').then((m) => ({ default: m.PromptsPage })));
const OidcProvidersPage = lazy(() => import('@/features/oidc/page').then((m) => ({ default: m.OidcProvidersPage })));
const RateLimitPage = lazy(() => import('@/features/rate-limit/page').then((m) => ({ default: m.RateLimitPage })));
const QuotaPage = lazy(() => import('@/features/quota/page').then((m) => ({ default: m.QuotaPage })));

function RouteSuspenseFallback() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function App() {
  return (
    <Providers>
      <BrowserRouter basename="/dashboard">
        <Suspense fallback={<RouteSuspenseFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AuthGate />}>
              <Route element={<Shell />}>
                <Route index element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<OverviewPage />} />
                {/* ROUTING */}
                <Route path="/servers" element={<ServersPage />}>
                  <Route path="new" element={<ServerNewSheet />} />
                  <Route path=":name" element={<ServerDetailSheet />} />
                </Route>
                <Route path="/tools" element={<ToolsPage />}>
                  <Route path=":canonicalName" element={<ToolDetailSheet />} />
                </Route>
                <Route path="/groups" element={<GroupsPage />}>
                  <Route path="new" element={<GroupNewSheet />} />
                  <Route path=":name" element={<GroupDetailSheet />} />
                </Route>
                <Route path="/prompts" element={<PromptsPage />} />
                <Route path="/proxies/*" element={<ComingSoon phase="E" title="Outbound Proxies" />} />
                {/* IDENTITY */}
                <Route path="/users" element={<UsersPage />}>
                  <Route path="new" element={<UserNewSheet />} />
                  <Route path=":id" element={<UserDetailSheet />} />
                </Route>
                <Route path="/mcp-clients" element={<McpClientsPage />}>
                  <Route path="new" element={<McpClientNewSheet />} />
                  <Route path=":id" element={<McpClientDetailSheet />} />
                </Route>
                <Route path="/my-tokens" element={<MyTokensPage />}>
                  <Route path="new" element={<MyTokenNewSheet />} />
                </Route>
                <Route path="/oidc" element={<OidcProvidersPage />} />
                <Route path="/policies" element={<PoliciesPage />} />
                {/* RELIABILITY */}
                <Route path="/rate-limit" element={<RateLimitPage />} />
                <Route path="/quota" element={<QuotaPage />} />
                <Route path="/cache" element={<ComingSoon phase="D" title="Cache" />} />
                <Route path="/approvals" element={<ComingSoon phase="D" title="Approvals" />} />
                {/* OBSERVABILITY */}
                <Route path="/usage" element={<ComingSoon phase="D" title="Usage" />} />
                <Route path="/audit" element={<ComingSoon phase="D" title="Audit Logs" />} />
                <Route path="/metrics" element={<ComingSoon phase="E" title="Metrics" />} />
                <Route path="/health" element={<ComingSoon phase="E" title="Health" />} />
                {/* SYSTEM */}
                <Route path="/tenants/*" element={<ComingSoon phase="E" title="Tenants" />} />
                <Route path="/webhooks" element={<ComingSoon phase="D" title="Webhooks" />} />
                <Route path="/settings" element={<ComingSoon phase="E" title="Settings" />} />
                <Route path="*" element={<Navigate to="/overview" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </Providers>
  );
}
