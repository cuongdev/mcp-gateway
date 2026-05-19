import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Providers } from './providers';
import { AuthGate } from './auth/auth-gate';
import { LoginPage } from './auth/login';
import { Shell } from './layout/shell';
import { ComingSoon } from './coming-soon';
import { OverviewPage } from '@/features/overview/page';
import { ServersPage } from '@/features/servers/page';
import { ServerNewSheet } from '@/features/servers/new-sheet';
import { ServerDetailSheet } from '@/features/servers/detail-sheet';
import { ToolsPage } from '@/features/tools/page';
import { ToolDetailSheet } from '@/features/tools/detail-sheet';
import { GroupsPage } from '@/features/groups/page';
import { GroupNewSheet } from '@/features/groups/new-sheet';
import { GroupDetailSheet } from '@/features/groups/detail-sheet';
import { PoliciesPage } from '@/features/policies/page';
import { UsersPage } from '@/features/users/page';
import { UserNewSheet } from '@/features/users/new-sheet';
import { UserDetailSheet } from '@/features/users/detail-sheet';
import { McpClientsPage } from '@/features/mcp-clients/page';
import { McpClientNewSheet } from '@/features/mcp-clients/new-sheet';
import { McpClientDetailSheet } from '@/features/mcp-clients/detail-sheet';

export function App() {
  return (
    <Providers>
      <BrowserRouter basename="/dashboard">
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
              <Route path="/prompts" element={<ComingSoon phase="C" title="Prompts" />} />
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
              <Route path="/my-tokens" element={<ComingSoon phase="C" title="My Tokens" />} />
              <Route path="/oidc" element={<ComingSoon phase="C" title="OIDC Providers" />} />
              <Route path="/policies" element={<PoliciesPage />} />
              {/* RELIABILITY */}
              <Route path="/rate-limit" element={<ComingSoon phase="D" title="Rate Limit" />} />
              <Route path="/quota" element={<ComingSoon phase="D" title="Quota" />} />
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
      </BrowserRouter>
    </Providers>
  );
}
