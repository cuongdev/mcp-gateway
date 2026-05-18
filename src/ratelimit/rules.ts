export interface Rule {
  principalType?: 'user' | 'service_account' | 'mcp_client';
  principalId?: string;
  tool?: string;       // supports wildcards via fnmatch-style `*`
  limit: string;       // "N/(sec|min|hour|day)"
}

export interface ParsedLimit {
  count: number;
  windowSec: number;
}

const UNITS: Record<string, number> = {
  sec: 1, second: 1,
  min: 60, minute: 60,
  hour: 3600, hr: 3600,
  day: 86400, d: 86400,
};

export function parseLimit(s: string): ParsedLimit {
  const m = /^(\d+)\/(\w+)$/.exec(s);
  if (!m) throw new Error(`Invalid rate-limit spec: ${s}`);
  const count = parseInt(m[1], 10);
  const unit = UNITS[m[2].toLowerCase()];
  if (!unit) throw new Error(`Unknown unit '${m[2]}' in rate-limit spec`);
  return { count, windowSec: unit };
}

export interface RuleContext {
  principalType: string;
  principalId: string;
  tool?: string;
}

function globToRegex(g: string): RegExp {
  // Escape regex metachars except *, then * → .*
  const re = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${re}$`);
}

function ruleMatches(rule: Rule, ctx: RuleContext): boolean {
  if (rule.principalId && rule.principalId !== ctx.principalId) return false;
  if (rule.principalType && rule.principalType !== ctx.principalType) return false;
  if (rule.tool && ctx.tool && !globToRegex(rule.tool).test(ctx.tool)) return false;
  if (rule.tool && !ctx.tool) return false;
  return true;
}

function specificity(rule: Rule): number {
  let n = 0;
  if (rule.principalId) n += 4;       // most specific
  if (rule.principalType) n += 1;
  if (rule.tool) n += 1;
  return n;
}

export function matchRule(rules: Rule[], ctx: RuleContext): Rule | null {
  const matched = rules.filter((r) => ruleMatches(r, ctx));
  if (matched.length === 0) return null;
  // Highest specificity wins; ties broken by first occurrence (preserves order).
  let best = matched[0];
  let bestScore = specificity(best);
  for (let i = 1; i < matched.length; i++) {
    const s = specificity(matched[i]);
    if (s > bestScore) {
      best = matched[i];
      bestScore = s;
    }
  }
  return best;
}
