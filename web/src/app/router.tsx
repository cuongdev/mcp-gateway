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
              <Route path="/tools/*" element={<ComingSoon phase="B" title="Tools" />} />
              <Route path="/groups/*" element={<ComingSoon phase="B" title="Tool Groups" />} />
              <Route path="/prompts" element={<ComingSoon phase="C" title="Prompts" />} />
              <Route path="/proxies/*" element={<ComingSoon phase="E" title="Outbound Proxies" />} />
              {/* IDENTITY */}
              <Route path="/users/*" element={<ComingSoon phase="C" title="Users" />} />
              <Route path="/mcp-clients/*" element={<ComingSoon phase="C" title="MCP Clients" />} />
              <Route path="/my-tokens" element={<ComingSoon phase="C" title="My Tokens" />} />
              <Route path="/oidc" element={<ComingSoon phase="C" title="OIDC Providers" />} />
              <Route path="/policies" element={<ComingSoon phase="B" title="Access Control" />} />
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
