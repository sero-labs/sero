/**
 * Artifact content as its author wrote it.
 *
 * The Room command surface carries a member's argument as one CLI string, and
 * the CLI tokenizer keeps a backslash for the handler to interpret (see
 * `tokenizeCliInput`). Content published that way therefore arrives with a
 * literal `\n` where the author wrote a new line.
 *
 * Decoding belongs at that boundary, where the escape is known to be an
 * encoding rather than text: a caller that hands over ordinary text does not
 * pass through the command surface and is stored exactly as given.
 *
 * The same rule runs on the way back out. Artifacts published before the
 * boundary decoded are already stored escaped, and they have to render their
 * headings and paragraphs without the stored file being rewritten.
 */

/** A backslash followed by `n` — the escape the Room command surface produces. */
const ESCAPED_BREAK = /\\n/g;

/**
 * Turns escaped line breaks into real ones.
 *
 * Only content that carries no real line break of its own is decoded. Content
 * that already has one was not escaped by the command surface — it may simply
 * be text that quotes the escape — so it is left alone.
 *
 * That guard also makes this idempotent: the result always carries real line
 * breaks, so a second pass finds nothing to do.
 */
export function decodeEscapedLineBreaks(content: string): string {
  if (content.includes('\n')) return content;
  return content.replace(ESCAPED_BREAK, '\n');
}
