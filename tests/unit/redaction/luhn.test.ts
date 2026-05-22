import { describe, it, expect } from 'vitest';
import { isValidLuhn } from '../../../src/redaction/luhn.js';

describe('Luhn', () => {
  it('validates real card numbers', () => {
    // Well-known test vectors (Stripe/MC/Visa test PANs)
    expect(isValidLuhn('4242424242424242')).toBe(true);   // Visa test
    expect(isValidLuhn('5555555555554444')).toBe(true);   // Mastercard test
    expect(isValidLuhn('378282246310005')).toBe(true);    // Amex test
    expect(isValidLuhn('6011111111111117')).toBe(true);   // Discover test
    expect(isValidLuhn('30569309025904')).toBe(true);     // Diners test (14 digits)
  });

  it('accepts spaces and dashes', () => {
    expect(isValidLuhn('4242 4242 4242 4242')).toBe(true);
    expect(isValidLuhn('4242-4242-4242-4242')).toBe(true);
  });

  it('rejects bad checksums', () => {
    expect(isValidLuhn('4242424242424243')).toBe(false);
    expect(isValidLuhn('1234567890123456')).toBe(false);
  });

  it('rejects non-digit / too short / too long', () => {
    expect(isValidLuhn('abc')).toBe(false);
    expect(isValidLuhn('123')).toBe(false);                       // too short
    expect(isValidLuhn('12345678901234567890')).toBe(false);      // 20 digits, too long
    expect(isValidLuhn('')).toBe(false);
  });
});
