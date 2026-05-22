// ============================================================
// Virtual Tool plan types (P10, spec §9).
// ============================================================

export type ErrorPolicy = 'fail_fast' | 'best_effort';
export type OutputFormat = 'merged' | 'select';

export interface PlanStep {
  /** Step id; unique within plan. Must match /^[a-z][a-z0-9_]*$/. */
  id: string;
  /** Canonical tool name (e.g. "srv__searchDocs"). */
  tool: string;
  /** Step arguments — string values may contain {{...}} template expressions. */
  args: Record<string, unknown>;
  /** When true, this step may execute in parallel with adjacent parallel:true peers. */
  parallel?: boolean;
  /** Existence-check template path; step is skipped when path resolves falsy. */
  when?: string;
  /** Per-step timeout (ms). */
  timeoutMs?: number;
}

export interface PlanOutput {
  format: OutputFormat;
  /**
   * For format='merged' shape is Record<string,string> where each value is a
   * template; for format='select' shape is a single template string.
   */
  shape: Record<string, string> | string;
}

export interface VirtualToolPlan {
  name: string;
  description: string;
  /** JSON Schema describing the virtual tool's accepted input arguments. */
  inputSchema: Record<string, unknown>;
  steps: PlanStep[];
  output: PlanOutput;
  errorPolicy: ErrorPolicy;
}

/** Result returned by validatePlan(). */
export type ValidationResult =
  | { ok: true; plan: VirtualToolPlan }
  | { ok: false; errors: string[] };
