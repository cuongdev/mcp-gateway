import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Providers } from './providers';
import { AuthGate } from './auth/auth-gate';
import { LoginPage } from './auth/login';
import { Shell } from './layout/shell';

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
const CachePage = lazy(() => import('@/features/cache/page').then((m) => ({ default: m.CachePage })));
const ApprovalsPage = lazy(() => import('@/features/approvals/page').then((m) => ({ default: m.ApprovalsPage })));
const UsagePage = lazy(() => import('@/features/usage/page').then((m) => ({ default: m.UsagePage })));
const AuditPage = lazy(() => import('@/features/audit/page').then((m) => ({ default: m.AuditPage })));
const WebhooksPage = lazy(() => import('@/features/webhooks/page').then((m) => ({ default: m.WebhooksPage })));
const WebhookNewSheet = lazy(() => import('@/features/webhooks/new-sheet').then((m) => ({ default: m.WebhookNewSheet })));
const HealthPage = lazy(() => import('@/features/health/page').then((m) => ({ default: m.HealthPage })));
const SettingsPage = lazy(() => import('@/features/settings/page').then((m) => ({ default: m.SettingsPage })));
const MetricsPage = lazy(() => import('@/features/metrics/page').then((m) => ({ default: m.MetricsPage })));

const TenantsPage = lazy(() => import('@/features/tenants/page').then((m) => ({ default: m.TenantsPage })));
const TenantNewSheet = lazy(() => import('@/features/tenants/new-sheet').then((m) => ({ default: m.TenantNewSheet })));
const TenantDetailSheet = lazy(() => import('@/features/tenants/detail-sheet').then((m) => ({ default: m.TenantDetailSheet })));

const ProxiesPage = lazy(() => import('@/features/proxies/page').then((m) => ({ default: m.ProxiesPage })));
const ProxyNewSheet = lazy(() => import('@/features/proxies/new-sheet').then((m) => ({ default: m.ProxyNewSheet })));
const ProxyDetailSheet = lazy(() => import('@/features/proxies/detail-sheet').then((m) => ({ default: m.ProxyDetailSheet })));

const CircuitsPage = lazy(() => import('@/features/circuits/page').then((m) => ({ default: m.CircuitsPage })));
const CircuitDetailSheet = lazy(() => import('@/features/circuits/detail-sheet').then((m) => ({ default: m.CircuitDetailSheet })));

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
                <Route path="/proxies" element={<ProxiesPage />}>
                  <Route path="new" element={<ProxyNewSheet />} />
                  <Route path=":id" element={<ProxyDetailSheet />} />
                </Route>
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
                <Route path="/cache" element={<CachePage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                {/* OBSERVABILITY */}
                <Route path="/usage" element={<UsagePage />} />
                <Route path="/audit" element={<AuditPage />} />
                <Route path="/metrics" element={<MetricsPage />} />
                <Route path="/health" element={<HealthPage />} />
                {/* SYSTEM */}
                <Route path="/tenants" element={<TenantsPage />}>
                  <Route path="new" element={<TenantNewSheet />} />
                  <Route path=":id" element={<TenantDetailSheet />} />
                </Route>
                <Route path="/webhooks" element={<WebhooksPage />}>
                  <Route path="new" element={<WebhookNewSheet />} />
                </Route>
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/overview" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </Providers>
  );
}
