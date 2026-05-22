// Luhn algorithm — checksum validation for credit card numbers.
// https://en.wikipedia.org/wiki/Luhn_algorithm
//
// Accepts a digit-only string (length 13-19 for real cards).
// Strips spaces/dashes that may appear inside groups before validation.

export function isValidLuhn(input: string): boolean {
  if (typeof input !== 'string') return false;
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return false;
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48; // '0' = 48
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
