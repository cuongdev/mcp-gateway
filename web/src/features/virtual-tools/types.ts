export interface VirtualToolPlan {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  steps: PlanStep[];
  output: { format: 'merged' | 'select'; shape: Record<string, string> | string };
  errorPolicy: 'fail_fast' | 'best_effort';
}

export interface PlanStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  parallel?: boolean;
  when?: string;
  timeoutMs?: number;
}

export interface VirtualToolSummary {
  canonicalName: string;
  description: string;
  enabled: boolean;
  errorPolicy: 'fail_fast' | 'best_effort';
  stepCount: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
}

export interface TestResult {
  steps: Record<string, { args: unknown; result?: unknown; error?: string; latencyMs: number }>;
  output: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}
