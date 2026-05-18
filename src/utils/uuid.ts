import { uuidv7 } from 'uuidv7';

const V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newId(): string {
  return uuidv7();
}

export function isValidUuidV7(value: string): boolean {
  return typeof value === 'string' && V7_REGEX.test(value);
}
