import { describe, it, expect } from 'vitest';
import { resolveProxyName } from '../../../src/proxy/resolver.js';

describe('resolveProxyName', () => {
  it('server wins over group', () => {
    expect(resolveProxyName({
      serverProxyName: 's', groupProxyName: 'g', globalDefaultName: 'd',
    })).toBe('s');
  });

  it('group fallback when server unset', () => {
    expect(resolveProxyName({
      serverProxyName: null, groupProxyName: 'g', globalDefaultName: 'd',
    })).toBe('g');
  });

  it('global default fallback when both unset', () => {
    expect(resolveProxyName({
      serverProxyName: null, groupProxyName: null, globalDefaultName: 'd',
    })).toBe('d');
  });

  it('returns null when all unset', () => {
    expect(resolveProxyName({
      serverProxyName: null, groupProxyName: null, globalDefaultName: null,
    })).toBeNull();
  });

  it('treats undefined same as null', () => {
    expect(resolveProxyName({})).toBeNull();
  });
});
