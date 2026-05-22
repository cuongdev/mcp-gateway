// ============================================================
// VirtualToolExecutor — DAG executor for virtual tools (P10, spec §9.3).
//
// Sequential by default; adjacent steps with `parallel: true` form a
// Promise.allSettled group. Each step renders its `args` through the
// template engine, calls the underlying tool via SessionManager.send(),
// and stores the response under stepResults[step.id].
//
// errorPolicy:
//   - fail_fast (default): first step error aborts the whole plan.
//   - best_effort:         continues; failed steps are recorded as errors
//                          in the step map and the final output renders
//                          against whatever succeeded.
// ============================================================

import { newId } from '../utils/uuid.js';
import type { CapabilityRegistry } from '../capability/registry.js';
import type { SessionManager } from '../session/session.manager.js';
import type { JsonRpcResponse } from '../types/mcp.js';
import { MCP_METHODS } from '../types/mcp.js';
import { renderValue, resolvePath, type TemplateContext } from './template.js';
import type { PlanStep, VirtualToolPlan } from './types.js';

export interface ParentContext {
  tenantId?: string;
  principalId?: string;
}

export interface DryRunStepReport {
  args: unknown;
  result?: unknown;
  error?: string;
  latencyMs: number;
}

export interface DryRunReport {
  steps: Record<string, DryRunStepReport>;
  output: unknown;
}

const DEFAULT_STEP_TIMEOUT_MS = 30_000;

export class VirtualToolExecutor {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly sessionManager: SessionManager,
  ) {}

  /** Run the plan for real (commits side effects). */
  async execute(plan: VirtualToolPlan, input: unknown, _parentCtx?: ParentContext): Promise<unknown> {
    const { stepResults, output } = await this.run(plan, input, false);
    void stepResults;
    return output;
  }

  /** Identical control flow to execute() but used by /test endpoint. */
  async dryRun(plan: VirtualToolPlan, input: unknown, _parentCtx?: ParentContext): Promise<DryRunReport> {
    const { stepResults, output, stepReports } = await this.run(plan, input, true);
    void stepResults;
    return { steps: stepReports, output };
  }

  // ── internals ─────────────────────────────────────────

  private async run(
    plan: VirtualToolPlan,
    input: unknown,
    capture: boolean,
  ): Promise<{ stepResults: Record<string, unknown>; output: unknown; stepReports: Record<string, DryRunStepReport> }> {
    const stepResults: Record<string, unknown> = {};
    const stepReports: Record<string, DryRunStepReport> = {};
    const ctx: TemplateContext = { input, steps: stepResults };
    const groups = groupSteps(plan.steps);

    for (const group of groups) {
      if (group.length === 1) {
        // Sequential step — run inline so fail_fast can abort cleanly.
        const step = group[0];
        const r = await this.runStep(step, ctx);
        if (capture) stepReports[step.id] = r.report;
        if (r.skipped) continue;
        if (r.error !== undefined) {
          if (plan.errorPolicy === 'fail_fast') throw new Error(`step ${step.id} failed: ${r.error}`);
          // best_effort: record + continue
          stepResults[step.id] = { error: r.error };
        } else {
          stepResults[step.id] = r.result;
        }
      } else {
        // Parallel group — settle all then apply errorPolicy as a group.
        const settled = await Promise.allSettled(group.map((s) => this.runStep(s, ctx)));
        let groupFailed = false;
        settled.forEach((s, i) => {
          const step = group[i];
          if (s.status === 'fulfilled') {
            const r = s.value;
            if (capture) stepReports[step.id] = r.report;
            if (r.skipped) return;
            if (r.error !== undefined) {
              groupFailed = true;
              if (plan.errorPolicy === 'fail_fast') return; // throw after loop
              stepResults[step.id] = { error: r.error };
            } else {
              stepResults[step.id] = r.result;
            }
          } else {
            groupFailed = true;
            const msg = (s.reason as Error)?.message ?? String(s.reason);
            if (capture) {
              stepReports[step.id] = { args: undefined, error: msg, latencyMs: 0 };
            }
            if (plan.errorPolicy !== 'fail_fast') {
              stepResults[step.id] = { error: msg };
            }
          }
        });
        if (groupFailed && plan.errorPolicy === 'fail_fast') {
          const firstErr = settled.find(
            (s) =>
              s.status === 'rejected' ||
              (s.status === 'fulfilled' && s.value.error !== undefined),
          );
          const msg = firstErr && firstErr.status === 'rejected'
            ? (firstErr.reason as Error)?.message ?? String(firstErr.reason)
            : firstErr && firstErr.status === 'fulfilled'
              ? firstErr.value.error
              : 'unknown';
          throw new Error(`parallel group failed: ${msg}`);
        }
      }
    }

    const output = this.renderOutput(plan, ctx);
    return { stepResults, output, stepReports };
  }

  private async runStep(
    step: PlanStep,
    ctx: TemplateContext,
  ): Promise<{ skipped: boolean; result?: unknown; error?: string; report: DryRunStepReport }> {
    const started = Date.now();

    // `when`: existence-check path. Skip when undefined / null / false / 0 / "".
    if (step.when) {
      const path = step.when.replace(/^\{\{|\}\}$/g, '');
      // path may start with input./steps./env. — feed to resolvePath via root selection
      const exists = resolvePathFromContext(path, ctx);
      if (!exists) {
        return { skipped: true, report: { args: undefined, latencyMs: Date.now() - started } };
      }
    }

    const renderedArgs = renderValue(step.args, ctx) as Record<string, unknown>;
    const tool = this.registry.tools().get(step.tool);
    if (!tool) {
      return {
        skipped: false,
        error: `unknown tool: ${step.tool}`,
        report: { args: renderedArgs, error: `unknown tool: ${step.tool}`, latencyMs: Date.now() - started },
      };
    }

    const timeoutMs = step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
    try {
      const response = await raceWithTimeout(
        this.sessionManager.send(tool.serverName, {
          jsonrpc: '2.0',
          id: newId(),
          method: MCP_METHODS.TOOLS_CALL,
          params: { name: tool.originalName, arguments: renderedArgs },
        }),
        timeoutMs,
        step.id,
      );
      if ((response as JsonRpcResponse).error) {
        const msg = (response as JsonRpcResponse).error?.message ?? 'upstream error';
        return {
          skipped: false,
          error: msg,
          report: { args: renderedArgs, error: msg, latencyMs: Date.now() - started },
        };
      }
      const result = (response as JsonRpcResponse).result;
      return {
        skipped: false,
        result,
        report: { args: renderedArgs, result, latencyMs: Date.now() - started },
      };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      return {
        skipped: false,
        error: msg,
        report: { args: renderedArgs, error: msg, latencyMs: Date.now() - started },
      };
    }
  }

  private renderOutput(plan: VirtualToolPlan, ctx: TemplateContext): unknown {
    const shape = plan.output.shape;
    if (plan.output.format === 'select') {
      return renderValue(shape as string, ctx);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(shape as Record<string, string>)) {
      out[k] = renderValue(v, ctx);
    }
    return out;
  }
}

/**
 * Group adjacent steps marked parallel:true so they run via Promise.allSettled.
 * Non-parallel steps are emitted as singleton groups.
 */
function groupSteps(steps: PlanStep[]): PlanStep[][] {
  const groups: PlanStep[][] = [];
  let cur: PlanStep[] = [];
  for (const s of steps) {
    if (s.parallel) {
      cur.push(s);
    } else {
      if (cur.length > 0) { groups.push(cur); cur = []; }
      groups.push([s]);
    }
  }
  if (cur.length > 0) groups.push(cur);
  return groups;
}

function resolvePathFromContext(path: string, ctx: TemplateContext): unknown {
  const dot = path.indexOf('.');
  if (dot === -1) return undefined;
  const root = path.slice(0, dot);
  const rest = path.slice(dot + 1);
  if (root === 'input') return resolvePath(ctx.input, rest);
  if (root === 'steps') return resolvePath(ctx.steps, rest);
  if (root === 'env') return resolvePath(ctx.env ?? {}, rest);
  return undefined;
}

function raceWithTimeout<T>(p: Promise<T>, timeoutMs: number, stepId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`step ${stepId} timed out after ${timeoutMs}ms`)), timeoutMs);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
