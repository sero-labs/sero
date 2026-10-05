const SECTION_START = '<docs>\nPi documentation (read only when';
const SECTION_END = '</docs>';

/**
 * Remove Pi's "Pi documentation" section from a base system prompt. Sero gives
 * the docs location once, on the `Pi docs:` line of its runtime block, and the
 * `pi-docs` skill holds the topic map.
 *
 * The section is matched by its opening tag and line, and its closing tag. A
 * prompt that lacks either marker comes back unchanged, so a Pi upgrade that
 * rewords the section leaves a duplicate pointer instead of cutting the wrong text.
 * `pi-docs-section.test.ts` runs Pi's real prompt through this function.
 */
export function removePiDocsSection(prompt: string): string {
  const start = prompt.indexOf(SECTION_START);
  if (start === -1) return prompt;
  const end = prompt.indexOf(SECTION_END, start);
  if (end === -1) return prompt;
  // The section's leading blank line goes with it.
  const head = prompt.slice(0, start).replace(/\n\n$/, '');
  return head + prompt.slice(end + SECTION_END.length);
}
