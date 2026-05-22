import { describe, it, expect } from 'vitest';
import { validatePlan } from '../../../src/virtual-tools/plan-schema.js';

function basePlan() {
  return {
    name: 'vt_search',
    description: 'composite search',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    errorPolicy: 'fail_fast' as const,
    steps: [
      { id: 's1', tool: 'srv__search', args: { q: '{{input.q}}' } },
      { id: 's2', tool: 'srv__rank', args: { items: '{{steps.s1.result.items}}' } },
    ],
    output: { format: 'merged' as const, shape: { items: '{{steps.s2.result}}' } },
  };
}

describe('validatePlan', () => {
  it('accepts a valid plan', () => {
    const r = validatePlan(basePlan());
    expect(r.ok).toBe(true);
  });

  it('rejects > 50 steps', () => {
    const p = basePlan();
    p.steps = Array.from({ length: 51 }, (_, i) => ({
      id: `s${i}`, tool: 'srv__t', args: {},
    }));
    const r = validatePlan(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/exceeds 50/);
  });

  it('rejects duplicate step ids', () => {
    const p = basePlan();
    p.steps = [
      { id: 'dup', tool: 'srv__a', args: {} },
      { id: 'dup', tool: 'srv__b', args: {} },
    ];
    const r = validatePlan(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/duplicate step id/);
  });

  it('rejects bad step ids (uppercase, digit-first)', () => {
    for (const bad of ['BadId', '1step', 'has-dash']) {
      const p = basePlan();
      p.steps = [{ id: bad, tool: 'srv__a', args: {} }];
      const r = validatePlan(p);
      expect(r.ok, `expected reject of "${bad}"`).toBe(false);
    }
  });

  it('rejects eval-style templates', () => {
    const p = basePlan();
    p.steps = [{ id: 's1', tool: 'srv__a', args: { x: "{{constructor.constructor('x')()}}" } }];
    const r = validatePlan(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/unsupported template/);
  });

  it('rejects templates with semicolons or quotes', () => {
    const inputs = [
      `{{a;b}}`,
      `{{a"b}}`,
      `{{a'b}}`,
      `{{a + b}}`,
    ];
    for (const t of inputs) {
      const p = basePlan();
      p.steps = [{ id: 's1', tool: 'srv__a', args: { x: t } }];
      const r = validatePlan(p);
      expect(r.ok, `expected reject for ${t}`).toBe(false);
    }
  });

  it('rejects plan larger than 16KB', () => {
    const p = basePlan();
    // pad description with allowed lowercase content; size cap is on the serialised plan
    p.description = 'x'.repeat(20 * 1024);
    const r = validatePlan(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/16384/);
  });

  it('rejects unknown errorPolicy', () => {
    const p = basePlan() as unknown as { errorPolicy: string };
    p.errorPolicy = 'silly';
    const r = validatePlan(p);
    expect(r.ok).toBe(false);
  });

  it('accepts format=select with single string shape', () => {
    const p = basePlan();
    p.output = { format: 'select', shape: '{{steps.s1.result}}' } as never;
    const r = validatePlan(p);
    expect(r.ok).toBe(true);
  });

  it('rejects format=merged with non-object shape', () => {
    const p = basePlan() as unknown as { output: { format: string; shape: unknown } };
    p.output = { format: 'merged', shape: 'not-an-object' };
    const r = validatePlan(p);
    expect(r.ok).toBe(false);
  });
});
