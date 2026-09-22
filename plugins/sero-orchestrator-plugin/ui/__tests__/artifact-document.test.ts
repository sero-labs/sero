import { describe, expect, it } from 'vitest';
import { decodeEscapedLineBreaks } from '../../shared/artifact-content';
import {
  inlineSpans,
  isBlankLine,
  splitArtifactDocument,
  toArtifactLine,
  type ArtifactDocument,
} from '../lib/artifact-document';

/** Content as the command surface stored it: one line, with `\n` for every break. */
const asPublished = (...lines: string[]): string => lines.join('\\n');

const HEADING = /^(#{1,6})[ \t]+(.*)$/;

/** Every line the model kept, headings excluded. */
function keptLines(doc: ArtifactDocument): string[] {
  return [...doc.intro, ...doc.sections.flatMap((section) => section.lines)];
}

/**
 * The three artifacts a finished Room really published. Their shapes differ —
 * with a title and sections, with sections only, and with neither — and the one
 * rule has to hold for all three, so all three are the cases here.
 */
const PLAN = asPublished(
  '# Frogger: Neon Crossing — product and implementation direction',
  '',
  '## Decision',
  'Build **Signal Wake Crossing**: a one-screen, deterministic crossing.',
  '',
  '## Observed workspace facts',
  'The root exposes only `.git/` and `.sero/`.',
  '',
  '## Recommended game',
  '',
  '## Presentation, sound, and access',
  '',
  '## Conditional typed Canvas architecture (new recommendation, not observed code)',
  '',
  '## Verification gates',
  '',
  '## Buildable milestone slices',
  '',
  '## Rejected alternatives',
  '',
  '## Risks and mitigations',
  '',
  '## Assumptions and unresolved user decisions',
);

const REPORT = asPublished(
  '## Evidence boundary',
  'No product source is present to inspect.',
  '',
  '## Hook comparison',
  '| Hook | Reads as | Cost |',
  '| --- | --- | --- |',
  '| Wake | clear | low |',
  '',
  '## Recommended moment-to-moment rules',
  '1. Keep one screen.',
  '2. Never rescue the player.',
);

const NO_HEADINGS = asPublished(
  'OBSERVED WORKSPACE (2026-09-16 audit)',
  '- The workspace root contains only .git/, .sero/, and .sero-workspace.json.',
  '- No package.json, lockfile or src/ is present.',
  'Nothing below is an assertion about existing implementation.',
);

describe('splitArtifactDocument', () => {
  it('reads a plan whose first heading is the document title', () => {
    const doc = splitArtifactDocument(PLAN);
    expect(doc.title).toBe('Frogger: Neon Crossing — product and implementation direction');
    expect(doc.sections).toHaveLength(10);
    expect(doc.sections[0].heading).toBe('Decision');
    expect(doc.sections.at(-1)?.heading).toBe('Assumptions and unresolved user decisions');
    expect(doc.sections[0].lines).toContain('Build **Signal Wake Crossing**: a one-screen, deterministic crossing.');
  });

  it('reads a report that has sections and no document heading', () => {
    const doc = splitArtifactDocument(REPORT);
    expect(doc.title).toBeUndefined();
    expect(doc.sections.map((section) => section.heading)).toEqual([
      'Evidence boundary',
      'Hook comparison',
      'Recommended moment-to-moment rules',
    ]);
  });

  it('keeps markup it does not understand as the text it is', () => {
    // A table is not a construct this renders. Dropping its rows would quietly
    // remove evidence from a document the user is reading.
    const table = splitArtifactDocument(REPORT).sections[1].lines;
    expect(table).toContain('| Hook | Reads as | Cost |');
    expect(table).toContain('| Wake | clear | low |');
  });

  it('shows a document with no heading at all in full', () => {
    const doc = splitArtifactDocument(NO_HEADINGS);
    expect(doc.title).toBeUndefined();
    expect(doc.sections).toEqual([]);
    expect(doc.intro).toEqual(decodeEscapedLineBreaks(NO_HEADINGS).split('\n'));
  });

  it('loses no line of any of the three shapes', () => {
    for (const raw of [PLAN, REPORT, NO_HEADINGS]) {
      const source = decodeEscapedLineBreaks(raw).split('\n');
      const doc = splitArtifactDocument(raw);
      const headings = source.filter((line) => HEADING.test(line)).length;
      // Every source line is either kept verbatim or became a heading.
      expect(keptLines(doc).length + headings).toBe(source.length);
    }
  });

  it('treats a later first-level heading as a section, so no line is swallowed', () => {
    const doc = splitArtifactDocument(asPublished('# Title', 'body', '# Second', 'more'));
    expect(doc.title).toBe('Title');
    expect(doc.sections.map((section) => section.heading)).toEqual(['Second']);
    expect(keptLines(doc)).toEqual(['body', 'more']);
  });

  it('keeps text that comes before the first heading', () => {
    const doc = splitArtifactDocument(asPublished('An opening line.', '', '## A heading', 'under it'));
    expect(doc.title).toBeUndefined();
    expect(doc.intro).toEqual(['An opening line.', '']);
    expect(doc.sections[0].lines).toEqual(['under it']);
  });

  it('renders structure from content stored before the decode existed', () => {
    // Stored escaped, never rewritten: decoding on the way in is what makes the
    // headings in a file written months ago visible today.
    const doc = splitArtifactDocument(asPublished('## Only a section', 'its body'));
    expect(doc.sections).toEqual([{ heading: 'Only a section', level: 2, lines: ['its body'] }]);
  });
});

describe('inlineSpans', () => {
  it('separates bold text without dropping the markers', () => {
    expect(inlineSpans('Build **Signal Wake** now')).toEqual([
      { text: 'Build ', bold: false },
      { text: 'Signal Wake', bold: true },
      { text: ' now', bold: false },
    ]);
  });

  it('keeps an unclosed marker as literal text rather than vanishing', () => {
    expect(inlineSpans('**unclosed')).toEqual([{ text: '**unclosed', bold: false }]);
  });
});

describe('toArtifactLine', () => {
  it('reads a bullet and strips its marker', () => {
    expect(toArtifactLine('- one thing')).toEqual({
      kind: 'bullet',
      spans: [{ text: 'one thing', bold: false }],
    });
  });

  it('keeps the ordinal its author wrote', () => {
    expect(toArtifactLine('3. third')).toMatchObject({ kind: 'number', ordinal: 3 });
  });

  it('reads an indented bullet as a bullet', () => {
    expect(toArtifactLine('  - nested').kind).toBe('bullet');
  });

  it('reads anything else as a paragraph', () => {
    expect(toArtifactLine('| Hook | Reads as |').kind).toBe('paragraph');
    expect(toArtifactLine('plain sentence').kind).toBe('paragraph');
  });
});

describe('isBlankLine', () => {
  it('treats a blank line as a gap rather than content', () => {
    expect(isBlankLine(toArtifactLine(''))).toBe(true);
    expect(isBlankLine(toArtifactLine('   '))).toBe(true);
    expect(isBlankLine(toArtifactLine('text'))).toBe(false);
  });
});
