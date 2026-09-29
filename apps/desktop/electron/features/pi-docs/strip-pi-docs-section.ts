const SECTION_START = '\n\nPi documentation (read only when';
const SECTION_LAST_BULLET = '- Always read pi .md files completely and follow links to related docs';

/**
 * Remove Pi's "Pi documentation" section from a base system prompt. Sero gives
 * the docs location once, on the `Pi docs:` line of its runtime block, and the
 * `pi-docs` skill holds the topic map.
 *
 * The section is matched by its opening line and its last bullet. A prompt that
 * lacks either marker comes back unchanged, so a Pi upgrade that rewords the
 * section leaves a duplicate pointer instead of cutting the wrong text.
 * `strip-pi-docs-section.test.ts` runs Pi's real prompt through this function.
 */
export function removePiDocsSection(prompt: string): string {
  const start = prompt.indexOf(SECTION_START);
  if (start === -1) return prompt;
  const lastBullet = prompt.indexOf(SECTION_LAST_BULLET, start);
  if (lastBullet === -1) return prompt;
  const lineEnd = prompt.indexOf('\n', lastBullet);
  return prompt.slice(0, start) + (lineEnd === -1 ? '' : prompt.slice(lineEnd));
}
