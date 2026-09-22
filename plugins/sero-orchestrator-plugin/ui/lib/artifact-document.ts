/**
 * An artifact's content as a document, so a heading reads as a heading and a
 * paragraph as a paragraph.
 *
 * ONE rule, and it loses nothing: the document's own `#` title is its title, a
 * `##` heading opens a section, text before the first heading is shown above
 * them, and a document with no heading at all is shown in full. Markup this
 * does not understand — a table row, a fence, a stray marker — is shown as the
 * text it is rather than silently dropped, because a plan the user is reading
 * is not the place to discover that a line went missing.
 *
 * Line breaks are decoded on the way in. Artifacts published before the command
 * surface decoded them are already stored escaped, and rendering one without
 * this would show a single long line with literal `\n` in it.
 */

import { decodeEscapedLineBreaks } from '../../shared/artifact-content';

/** A run of text, bold or not. `**bold**` becomes a styled span, not lost markers. */
export interface ArtifactSpan {
  text: string;
  bold: boolean;
}

export interface ArtifactLine {
  kind: 'paragraph' | 'bullet' | 'number';
  /** For `number`: the ordinal the author wrote, so the rendered list keeps their numbering. */
  ordinal?: number;
  spans: ArtifactSpan[];
}

export interface ArtifactSection {
  heading: string;
  /** Heading depth — 2 for `##`. Kept so a deeper heading can read as a sub-heading. */
  level: number;
  /** Every line under this heading, verbatim. */
  lines: string[];
}

export interface ArtifactDocument {
  /** The document's own `#` title, when it has one at the top. */
  title?: string;
  /** Lines before the first heading — usually the opening paragraph. */
  intro: string[];
  sections: ArtifactSection[];
}

const HEADING = /^(#{1,6})[ \t]+(.*)$/;
const BULLET = /^[ \t]*[-*][ \t]+(.*)$/;
const NUMBERED = /^[ \t]*(\d+)[.)][ \t]+(.*)$/;
const BOLD = /\*\*([^*]+)\*\*/g;

/**
 * Splits one artifact into its title, its opening lines and its sections.
 *
 * Only a `#` that comes before any other heading is the document's title; a
 * later one opens a section like any other heading, so the distinction can
 * never swallow a line.
 */
export function splitArtifactDocument(raw: string): ArtifactDocument {
  const intro: string[] = [];
  const sections: ArtifactSection[] = [];
  let title: string | undefined;
  let current: ArtifactSection | null = null;

  for (const line of decodeEscapedLineBreaks(raw).split('\n')) {
    const heading = HEADING.exec(line);
    if (!heading) {
      (current?.lines ?? intro).push(line);
      continue;
    }
    const level = heading[1].length;
    const text = heading[2].trim();
    if (level === 1 && title === undefined && sections.length === 0) {
      title = text;
      continue;
    }
    current = { heading: text, level, lines: [] };
    sections.push(current);
  }
  return { title, intro, sections };
}

/** Splits `**bold**` into spans. An unclosed marker stays literal text rather than vanishing. */
export function inlineSpans(line: string): ArtifactSpan[] {
  const spans: ArtifactSpan[] = [];
  let at = 0;
  for (const match of line.matchAll(BOLD)) {
    const start = match.index;
    if (start > at) spans.push({ text: line.slice(at, start), bold: false });
    spans.push({ text: match[1], bold: true });
    at = start + match[0].length;
  }
  if (at < line.length) spans.push({ text: line.slice(at), bold: false });
  return spans;
}

/** One line as the renderer needs it: what kind of line it is, and its text. */
export function toArtifactLine(raw: string): ArtifactLine {
  const bullet = BULLET.exec(raw);
  if (bullet) return { kind: 'bullet', spans: inlineSpans(bullet[1]) };
  const numbered = NUMBERED.exec(raw);
  if (numbered) return { kind: 'number', ordinal: Number(numbered[1]), spans: inlineSpans(numbered[2]) };
  return { kind: 'paragraph', spans: inlineSpans(raw) };
}

/** Whether a line would draw anything. A blank line is a paragraph gap, not content. */
export function isBlankLine(line: ArtifactLine): boolean {
  return line.spans.every((span) => span.text.trim().length === 0);
}

/**
 * A stable React key for each named part of a document, in order.
 *
 * A document repeats things — a horizontal rule, a repeated bullet, two
 * sections that happen to share a heading — so a part's own text is not unique.
 * Naming it by its text plus how many identical ones came before keeps the key
 * attached to the part rather than to its position, which an index does not:
 * inserting one line would re-key every line after it.
 */
export function partKeys(texts: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const nth = seen.get(text) ?? 0;
    seen.set(text, nth + 1);
    return nth === 0 ? text : `${text}#${nth}`;
  });
}
