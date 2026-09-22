import { describe, expect, it } from 'vitest';
import { decodeEscapedLineBreaks } from '../artifact-content';

describe('decodeEscapedLineBreaks', () => {
  it('turns the escaped breaks a command line carries back into line breaks', () => {
    expect(decodeEscapedLineBreaks('## A\\n\\n## B')).toBe('## A\n\n## B');
  });

  it('leaves content that already has a real line break byte-for-byte alone', () => {
    // Text that carries a real break was not escaped by the command surface, so
    // a `\n` in it is a character its author wrote and quotes on purpose.
    const written = 'The parser writes "\\n" between rules.\nIt says so in the docs.';
    expect(decodeEscapedLineBreaks(written)).toBe(written);
  });

  it('is idempotent, because its own output carries real line breaks', () => {
    const once = decodeEscapedLineBreaks('line one\\nline two');
    expect(decodeEscapedLineBreaks(once)).toBe(once);
  });

  it('leaves content with no escape untouched', () => {
    expect(decodeEscapedLineBreaks('one plain sentence')).toBe('one plain sentence');
  });

  it('decodes every break, not only the first', () => {
    expect(decodeEscapedLineBreaks('a\\nb\\nc\\nd')).toBe('a\nb\nc\nd');
  });

  it('does not touch a literal backslash-n inside a line that has real breaks', () => {
    const mixed = '# Title\nThe escape is \\n here.\nSecond line.';
    expect(decodeEscapedLineBreaks(mixed)).toBe(mixed);
  });
});
