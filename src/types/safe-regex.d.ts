// Ambient module declaration for `safe-regex` (no shipped types upstream).
// Library exports a single default function: (pattern: string|RegExp) => boolean.
declare module 'safe-regex' {
  const safeRegex: (pattern: string | RegExp, opts?: { limit?: number }) => boolean;
  export default safeRegex;
}
