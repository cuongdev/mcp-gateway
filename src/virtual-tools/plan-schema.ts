// ============================================================
// Plan schema + validator (P10, spec §9.1).
//
// AJV-strict for structural shape; hand-written checks layered
// on top for plan-wide invariants (size cap, step-id uniqueness,
// template-expression whitelist).
//
// The template-expression whitelist is the security boundary:
// any string containing "{{...}}" that doesn't match
// EXACT_TEMPLATE_RE is rejected at validation time. This is the
// only place where attacker-supplied expressions can be turned
// away — the runtime template renderer is intentionally
// permissive (treats unknown paths as undefined) so a compromised
// validator must not be the only line of defence.
// ============================================================

import Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv';
import type {
  ErrorPolicy, OutputFormat, PlanOutput, PlanStep,
  ValidationResult, VirtualToolPlan,
} from './types.js';

const MAX_STEPS = 50;
const MAX_PLAN_BYTES = 16 * 1024;          // 16 KB
const MAX_TEMPLATE_LEN = 256;
const STEP_ID_RE = /^[a-z][a-z0-9_]*$/;

/**
 * A *fully-templated* string is exactly one {{...}} expression with no
 * surrounding text. Path body is `[a-z0-9_.]+(?:\[\d+\])?` —
 * lowercase identifiers separated by dots, with optional array index.
 */
const EXACT_TEMPLATE_RE = /^\{\{[a-z0-9_.]+(?:\[[0-9]+\])?\}\}$/;

/**
 * Embedded text containing one or more {{...}} substitutions. Each
 * substitution still uses the same restricted path body, so injection
 * attempts (`{{constructor.constructor('x')()}}`, quotes, semicolons, etc.)
 * are rejected.
 */
const EMBEDDED_TEMPLATE_RE = /\{\{([^}]*)\}\}/g;
const PATH_BODY_RE = /^[a-z0-9_.]+(?:\[[0-9]+\])?$/;

interface RawPlan {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  steps: PlanStep[];
  output: PlanOutput;
  errorPolicy: ErrorPolicy;
}

const ajv = new Ajv({ allErrors: true, strict: false });

const planJsonSchema: JSONSchemaType<RawPlan> = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'inputSchema', 'steps', 'output', 'errorPolicy'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    description: { type: 'string', nullable: true, maxLength: 1024 },
    inputSchema: { type: 'object', additionalProperties: true } as never,
    errorPolicy: { type: 'string', enum: ['fail_fast', 'best_effort'] as ErrorPolicy[] },
    steps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'tool', 'args'],
        properties: {
          id: { type: 'string', pattern: STEP_ID_RE.source },
          tool: { type: 'string', minLength: 1, maxLength: 256 },
          args: { type: 'object', additionalProperties: true } as never,
          parallel: { type: 'boolean', nullable: true },
          when: { type: 'string', nullable: true, maxLength: MAX_TEMPLATE_LEN },
          timeoutMs: { type: 'integer', nullable: true, minimum: 1, maximum: 600_000 },
        },
      },
    },
    output: {
      type: 'object',
      additionalProperties: false,
      required: ['format', 'shape'],
      properties: {
        format: { type: 'string', enum: ['merged', 'select'] as OutputFormat[] },
        // shape may be string OR object — AJV lacks union typing without anyOf
        shape: {} as never,
      },
    },
  },
};

const validateRaw: ValidateFunction<RawPlan> = ajv.compile(planJsonSchema);

/**
 * Validate a candidate plan. Returns a discriminated union so callers can
 * surface user-friendly messages without throwing.
 */
export function validatePlan(input: unknown): ValidationResult {
  const errors: string[] = [];

  // Plan-JSON size cap — applies to the stringified plan, not the JS object.
  const serialised = (() => {
    try { return JSON.stringify(input); } catch { return ''; }
  })();
  if (!serialised) {
    return { ok: false, errors: ['plan is not JSON-serialisable'] };
  }
  if (Buffer.byteLength(serialised, 'utf8') > MAX_PLAN_BYTES) {
    return { ok: false, errors: [`plan exceeds ${MAX_PLAN_BYTES} bytes`] };
  }

  if (!validateRaw(input)) {
    for (const e of validateRaw.errors ?? []) {
      errors.push(`${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
    }
    return { ok: false, errors };
  }
  const plan = input as RawPlan;

  if (plan.steps.length > MAX_STEPS) {
    errors.push(`steps exceeds ${MAX_STEPS}`);
  }

  // Unique step ids
  const seen = new Set<string>();
  for (const s of plan.steps) {
    if (seen.has(s.id)) errors.push(`duplicate step id: ${s.id}`);
    seen.add(s.id);
    if (!STEP_ID_RE.test(s.id)) errors.push(`invalid step id: ${s.id}`);
  }

  // Template-expression whitelist for every string in step.args and output.shape
  for (const s of plan.steps) {
    walkStrings(s.args, (str, path) => {
      const tErrs = checkTemplateString(str, `steps.${s.id}.args.${path}`);
      errors.push(...tErrs);
    });
    if (s.when !== undefined && s.when !== null) {
      // when clauses must be a single existence path (template form acceptable)
      const w = s.when as string;
      if (w.length > MAX_TEMPLATE_LEN) errors.push(`steps.${s.id}.when exceeds ${MAX_TEMPLATE_LEN} chars`);
      if (w.includes('{{')) {
        if (!EXACT_TEMPLATE_RE.test(w)) errors.push(`steps.${s.id}.when contains unsupported template expression`);
      } else if (!PATH_BODY_RE.test(w)) {
        errors.push(`steps.${s.id}.when must be a path or {{path}} template`);
      }
    }
  }

  // Output shape
  if (plan.output.format === 'merged') {
    if (!plan.output.shape || typeof plan.output.shape !== 'object' || Array.isArray(plan.output.shape)) {
      errors.push('output.shape must be an object when format=merged');
    } else {
      for (const [k, v] of Object.entries(plan.output.shape)) {
        if (typeof v !== 'string') {
          errors.push(`output.shape.${k} must be a string template`);
          continue;
        }
        errors.push(...checkTemplateString(v, `output.shape.${k}`));
      }
    }
  } else if (plan.output.format === 'select') {
    if (typeof plan.output.shape !== 'string') {
      errors.push('output.shape must be a string template when format=select');
    } else {
      errors.push(...checkTemplateString(plan.output.shape, 'output.shape'));
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: plan as VirtualToolPlan };
}

/**
 * Validate a template-bearing string. Allows:
 *   - plain literals with no {{...}}
 *   - an exact template ({{path}}) of length ≤ 256
 *   - embedded text where every {{...}} body matches PATH_BODY_RE
 * Anything else (eval-like expressions, quotes, semicolons, JS operators)
 * is rejected.
 */
function checkTemplateString(str: string, path: string): string[] {
  const errs: string[] = [];
  if (str.length > MAX_TEMPLATE_LEN) {
    errs.push(`${path} exceeds ${MAX_TEMPLATE_LEN} chars`);
  }
  if (!str.includes('{{')) return errs;
  if (EXACT_TEMPLATE_RE.test(str)) return errs;

  // Embedded form. Every {{...}} body must be a clean path.
  let m: RegExpExecArray | null;
  const re = new RegExp(EMBEDDED_TEMPLATE_RE.source, 'g');
  let found = false;
  while ((m = re.exec(str)) !== null) {
    found = true;
    const body = m[1] ?? '';
    if (!PATH_BODY_RE.test(body)) {
      errs.push(`${path} contains unsupported template expression: "${body.slice(0, 64)}"`);
    }
    if (body.length > MAX_TEMPLATE_LEN) {
      errs.push(`${path} template body exceeds ${MAX_TEMPLATE_LEN} chars`);
    }
  }
  if (!found) {
    // Has '{{' but no matching pair — malformed
    errs.push(`${path} has malformed template syntax`);
  }
  return errs;
}

/** Recursively visit every string value in a plain JSON tree. */
function walkStrings(node: unknown, visit: (s: string, path: string) => void, path = ''): void {
  if (typeof node === 'string') { visit(node, path); return; }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkStrings(v, visit, path ? `${path}[${i}]` : `[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      walkStrings(v, visit, path ? `${path}.${k}` : k);
    }
  }
}

export const _testing = { checkTemplateString, walkStrings, MAX_STEPS, MAX_PLAN_BYTES };
