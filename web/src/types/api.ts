export interface AuthMe {
  principalId: string;
  type: 'user' | 'service_account' | 'mcp_client';
  email: string | null;
  displayName: string;
  /** Populated by Phase C backend change; empty until then. */
  roles?: string[];
}

export interface AuthProvider {
  id: string;
  name: string;
  icon?: string;
  loginUrl: string;
}

export interface ServerSummary {
  name: string;
  tools: string[];
  session: boolean;
}

export interface ToolSummary {
  name: string;
  server: string;
  originalName: string;
  description?: string;
  enabled: boolean;
}

export interface GroupSummary {
  name: string;
  description?: string;
  tools: string[];
  allowedRoles?: string[];
  includedServers?: string[];
  excludedTools?: string[];
}

export interface UsageBucket {
  key: string;
  total: number;
  success: number;
  denied: number;
  error: number;
}

export interface UsageResponse {
  range: { since?: number; until?: number };
  by: 'tool' | 'principal' | 'server';
  action: string;
  series: UsageBucket[];
}
