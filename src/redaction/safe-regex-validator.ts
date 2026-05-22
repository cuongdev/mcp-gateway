// Wraps `safe-regex` (a static-analysis ReDoS detector) so we can validate
// patterns before compiling them into the engine. Custom rules that fail
// the check are skipped at compile time with a warn log; built-in rules
// are vetted in code review.

import safeRegex from 'safe-regex';

/**
 * Returns true if the pattern appears safe (no obvious catastrophic
 * backtracking) per the `safe-regex` heuristic. Returns false on unsafe
 * or unparseable patterns.
 */
export function isSafeRegex(pattern: string): boolean {
  try {
    return safeRegex(pattern);
  } catch {
    return false;
  }
}
