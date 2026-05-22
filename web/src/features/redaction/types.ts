export type RedactionMode = 'redact' | 'block' | 'warn';

export interface RedactionRule {
  id: string;
  name: string;
  kind: string;
  pattern: string;
  mode: RedactionMode;
  replacement: string | null;
  enabled: boolean;
  builtIn: boolean;
  priority: number;
  scopeRequest: boolean;
  scopeResponse: boolean;
}

export interface RedactionFinding {
  id: string;
  ruleId: string;
  ruleName?: string;
  requestId: string;
  capabilityName: string | null;
  capabilityKind: string | null;
  serverName: string | null;
  scope: 'request' | 'response';
  mode: RedactionMode;
  matchCount: number;
  occurredAt: number;
  principalId: string | null;
}

export interface RedactionFindingPreview {
  ruleId: string;
  ruleName: string;
  kind: string;
  mode: RedactionMode;
  count: number;
  offsets: Array<{ start: number; end: number }>;
}

export interface RedactionTestResult {
  findings: RedactionFindingPreview[];
  redacted: unknown;
  blocked: boolean;
  blockedBy: { ruleId: string; ruleName: string; count: number } | null;
}

export interface RedactionStats {
  byRule: Array<{ ruleId: string; ruleName: string; count: number }>;
  byServer: Array<{ serverName: string; count: number }>;
  totalLast24h: number;
}
