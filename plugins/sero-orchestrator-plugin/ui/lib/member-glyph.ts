/**
 * The one-or-two-glyph face label for a member (prototype: ◎ C R 1 2 T M).
 * A trailing number wins ("Implementer 2" → 2); otherwise the initial of the
 * last word ("Security reviewer" → R). The Conductor is always ◎.
 */
export function memberGlyph(name: string, isConductor?: boolean): string {
  if (isConductor) return '◎';
  const trimmed = name.trim();
  const number = /(\d+)\s*$/.exec(trimmed)?.[1];
  if (number) return number.slice(-2);
  const words = trimmed.split(/\s+/);
  return (words[words.length - 1]?.[0] ?? '?').toUpperCase();
}
