/**
 * Reading a palette the user supplies (D17).
 *
 * A measured palette is not always the wanted one, and a fixed set is a
 * legitimate art direction. Palette files come in several shapes — one hex per
 * line, a GIMP `.gpl` table, a comma separated list — and they all reduce to
 * the same thing: the six-digit colours in the file, in the order they appear.
 * Order matters, because entry order is the palette's identity.
 */

const HEX = /#?\b([0-9a-fA-F]{6})\b/g;

/** Every colour in a palette file, deduplicated, in the order it was written. */
export function parsePalette(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(HEX)) {
    const hex = `#${(match[1] ?? '').toLowerCase()}`;
    seen.add(hex);
  }
  return [...seen];
}

/** What to call a loaded set on its chip, so it is not just "fixed". */
export function paletteLabel(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base === '' ? 'Loaded' : base.slice(0, 24);
}
