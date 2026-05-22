import { describe, it, expect } from 'vitest';
import { renderValue, resolvePath } from '../../../src/virtual-tools/template.js';

describe('renderValue', () => {
  it('exact template preserves type (number)', () => {
    const r = renderValue('{{input.count}}', { input: { count: 42 }, steps: {} });
    expect(r).toBe(42);
  });

  it('exact template preserves type (object)', () => {
    const r = renderValue('{{input.user}}', { input: { user: { id: 1 } }, steps: {} });
    expect(r).toEqual({ id: 1 });
  });

  it('nested path with array index', () => {
    const r = renderValue('{{steps.s1.result.items[0].name}}', {
      input: {},
      steps: { s1: { result: { items: [{ name: 'first' }, { name: 'second' }] } } },
    });
    expect(r).toBe('first');
  });

  it('embedded text substitutes string-coerced values', () => {
    const r = renderValue('hello {{input.name}}!', { input: { name: 'world' }, steps: {} });
    expect(r).toBe('hello world!');
  });

  it('embedded text stringifies objects', () => {
    const r = renderValue('payload={{input.body}}', {
      input: { body: { a: 1 } }, steps: {},
    });
    expect(r).toBe('payload={"a":1}');
  });

  it('missing path resolves to undefined without throwing', () => {
    const r = renderValue('{{input.missing.deep}}', { input: {}, steps: {} });
    expect(r).toBeUndefined();
  });

  it('missing path in embedded form becomes empty string', () => {
    const r = renderValue('a-{{input.x}}-b', { input: {}, steps: {} });
    expect(r).toBe('a--b');
  });

  it('recursively renders nested objects + arrays', () => {
    const r = renderValue(
      { q: '{{input.q}}', filters: [{ field: 'type', value: '{{input.t}}' }] },
      { input: { q: 'hello', t: 'doc' }, steps: {} },
    );
    expect(r).toEqual({ q: 'hello', filters: [{ field: 'type', value: 'doc' }] });
  });

  it('env root resolves when provided', () => {
    const r = renderValue('{{env.key}}', { input: {}, steps: {}, env: { key: 'secret' } });
    expect(r).toBe('secret');
  });

  it('unknown root noops gracefully', () => {
    // Strings that do not match the EXACT template regex pass through verbatim.
    const r = renderValue('{{unknown.x}}', { input: {}, steps: {} });
    expect(r).toBe('{{unknown.x}}');
  });

  it('resolvePath handles bracket index on nested arrays', () => {
    const v = resolvePath({ a: { b: [10, 20, 30] } }, 'a.b[2]');
    expect(v).toBe(30);
  });
});
