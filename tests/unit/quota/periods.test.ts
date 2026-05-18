import { describe, it, expect } from 'vitest';
import { dayScope, monthScope, nextDayResetMs, nextMonthResetMs } from '../../../src/quota/periods.js';

describe('quota periods', () => {
  it('dayScope formats YYYY-MM-DD', () => {
    expect(dayScope(new Date('2026-05-19T12:34:00Z'))).toBe('day:2026-05-19');
  });
  it('monthScope formats YYYY-MM', () => {
    expect(monthScope(new Date('2026-05-19T12:34:00Z'))).toBe('month:2026-05');
  });
  it('nextDayResetMs is midnight UTC of the next day', () => {
    const d = new Date('2026-05-19T23:00:00Z');
    expect(nextDayResetMs(d)).toBe(new Date('2026-05-20T00:00:00Z').getTime());
  });
  it('nextMonthResetMs is first of next month UTC', () => {
    const d = new Date('2026-05-31T23:00:00Z');
    expect(nextMonthResetMs(d)).toBe(new Date('2026-06-01T00:00:00Z').getTime());
  });
});
