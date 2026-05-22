// ============================================================
// Virtual Tool template renderer (P10, spec §9.2).
//
// Hand-written path resolver — no jsonpath / jq dependency.
// Grammar accepted at runtime mirrors plan-schema.ts (whitelist).
//
// renderValue() semantics:
//   - string === EXACT_TEMPLATE   → returns resolved value with TYPE
//     preserved (number stays number, object stays object).
//   - string with embedded {{...}} → string substitution with
//     stringified replacements.
//   - object/array                 → recursed.
//   - missing path                 → undefined (NEVER throws).
//
// The validator (plan-schema.ts) is the security boundary; this
// renderer is intentionally permissive so a stripped plan can
// never crash the executor.
// ============================================================

export interface TemplateContext {
  input: unknown;
  steps: Record<string, unknown>;
  env?: Record<string, string>;
}

const EXACT_TEMPLATE_RE = /^\{\{(input|steps|env)\.([a-z0-9_.[\]]+)\}\}$/;
const EMBEDDED_TEMPLATE_RE = /\{\{(input|steps|env)\.([a-z0-9_.[\]]+)\}\}/g;

/** Render any plan value against the runtime context. */
export function renderValue(value: unknown, ctx: TemplateContext): unknown {
  if (typeof value === 'string') return renderString(value, ctx);
  if (Array.isArray(value)) return value.map((v) => renderValue(v, ctx));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = renderValue(v, ctx);
    return out;
  }
  return value;
}

function renderString(str: string, ctx: TemplateContext): unknown {
  // Exact template: preserve original type.
  const exact = EXACT_TEMPLATE_RE.exec(str);
  if (exact) {
    const root = exact[1] as 'input' | 'steps' | 'env';
    const path = exact[2];
    return resolvePath(rootOf(root, ctx), path);
  }

  if (!str.includes('{{')) return str;

  // Embedded substitution; missing values become empty string.
  return str.replace(EMBEDDED_TEMPLATE_RE, (_match, root: string, path: string) => {
    const resolved = resolvePath(rootOf(root as 'input' | 'steps' | 'env', ctx), path);
    if (resolved === undefined || resolved === null) return '';
    return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
  });
}

function rootOf(name: 'input' | 'steps' | 'env', ctx: TemplateContext): unknown {
  if (name === 'input') return ctx.input;
  if (name === 'steps') return ctx.steps;
  return ctx.env ?? {};
}

/**
 * Resolve a dot-and-bracket path against a root value.
 * Accepts:   foo.bar.baz, foo.items[0].name, items[2]
 * Returns undefined on any missing/invalid segment — never throws.
 */
export function resolvePath(root: unknown, path: string): unknown {
  if (root === undefined || root === null) return undefined;
  let cur: unknown = root;
  // Split on dots OR bracket starts; the bracket form is converted in-place.
  // Simpler: tokenise once using a regex that captures either a key or a [N] index.
  const tokens: Array<{ kind: 'key' | 'index'; v: string }> = [];
  const tokenRe = /([a-z0-9_]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(path)) !== null) {
    if (m[1] !== undefined) tokens.push({ kind: 'key', v: m[1] });
    else tokens.push({ kind: 'index', v: m[2]! });
  }
  for (const t of tokens) {
    if (cur === undefined || cur === null) return undefined;
    if (t.kind === 'key') {
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[t.v];
    } else {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[Number(t.v)];
    }
  }
  return cur;
}
