export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const RED = '\x1b[31m';
export const GREEN = '\x1b[32m';
export const YELLOW = '\x1b[33m';
export const CYAN = '\x1b[36m';
export const DIM = '\x1b[2m';

export function ok(msg: string): void {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

export function info(msg: string): void {
  console.log(`${CYAN}•${RESET} ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`${YELLOW}!${RESET} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${RED}✗${RESET} ${msg}`);
}

export function box(title: string, lines: string[]): void {
  const width = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
  const top = '═'.repeat(width);
  console.log(`\n${BOLD}${top}${RESET}`);
  console.log(`${BOLD}  ${title}${RESET}`);
  console.log(BOLD + '═'.repeat(width) + RESET);
  for (const l of lines) console.log(`  ${l}`);
  console.log(BOLD + '═'.repeat(width) + RESET + '\n');
}

export function exitWith(code: number, message?: string): never {
  if (message) error(message);
  process.exit(code);
}
