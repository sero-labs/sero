/** Sortable, collision-resistant ids that are safe as directory names. */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(length: number): string {
  let suffix = '';
  for (let index = 0; index < length; index += 1) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return suffix;
}

export function newId(prefix: string, now: number = Date.now()): string {
  return `${prefix}-${now.toString(36)}-${randomSuffix(6)}`;
}
