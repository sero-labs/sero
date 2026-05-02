/**
 * Edit-tool helpers: fuzzy matching, BOM handling, line ending
 * normalisation, and unified diff generation.
 *
 * Ported from Pi SDK's core/tools/edit-diff.ts for consistent behaviour
 * in container-proxied edits.
 */

import * as Diff from 'diff';

// ── Line ending helpers ─────────────────────────────────────

/** Detect whether the file uses CRLF or LF. */
export function detectLineEnding(content: string): '\r\n' | '\n' {
  const crlfIdx = content.indexOf('\r\n');
  const lfIdx = content.indexOf('\n');
  if (lfIdx === -1) return '\n';
  if (crlfIdx === -1) return '\n';
  return crlfIdx < lfIdx ? '\r\n' : '\n';
}

/** Normalise all line endings to LF. */
export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Restore the original line ending style. */
export function restoreLineEndings(text: string, ending: '\r\n' | '\n'): string {
  return ending === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

// ── BOM helper ──────────────────────────────────────────────

/** Strip a UTF-8 BOM if present — LLMs never include it in oldText. */
export function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith('\uFEFF')
    ? { bom: '\uFEFF', text: content.slice(1) }
    : { bom: '', text: content };
}

// ── Fuzzy matching ──────────────────────────────────────────

/**
 * Normalise text for fuzzy comparison:
 *  - strip trailing whitespace per line
 *  - smart quotes → ASCII
 *  - Unicode dashes → hyphen-minus
 *  - special Unicode spaces → regular space
 */
function normalizeForFuzzyMatch(text: string): string {
  return (
    text
      .split('\n')
      .map((l) => l.trimEnd())
      .join('\n')
      // Smart single quotes → '
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      // Smart double quotes → "
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      // Various dashes → -
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      // Special spaces → regular space
      .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, ' ')
  );
}

export interface FuzzyMatchResult {
  found: boolean;
  index: number;
  matchLength: number;
  usedFuzzyMatch: boolean;
  /**
   * The content string to use for replacement.
   * Exact match → original content; fuzzy match → normalised content.
   */
  contentForReplacement: string;
}

/**
 * Find `oldText` in `content` — tries exact match first, then fuzzy.
 *
 * When fuzzy matching is used the returned `contentForReplacement` is the
 * fuzzy-normalised version of the content (trailing whitespace stripped,
 * Unicode quotes/dashes normalised to ASCII).
 */
export function fuzzyFindText(content: string, oldText: string): FuzzyMatchResult {
  // 1. Exact match
  const exactIdx = content.indexOf(oldText);
  if (exactIdx !== -1) {
    return {
      found: true,
      index: exactIdx,
      matchLength: oldText.length,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    };
  }

  // 2. Fuzzy match
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  const fuzzyIdx = fuzzyContent.indexOf(fuzzyOldText);

  if (fuzzyIdx === -1) {
    return {
      found: false,
      index: -1,
      matchLength: 0,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    };
  }

  return {
    found: true,
    index: fuzzyIdx,
    matchLength: fuzzyOldText.length,
    usedFuzzyMatch: true,
    contentForReplacement: fuzzyContent,
  };
}

/** Count occurrences of `needle` in `haystack` (fuzzy-normalised). */
export function countFuzzyOccurrences(content: string, oldText: string): number {
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  return fuzzyContent.split(fuzzyOldText).length - 1;
}

// ── Diff generation ─────────────────────────────────────────

export interface DiffResult {
  diff: string;
  firstChangedLine?: number;
}

/**
 * Generate a unified diff string with line numbers and context.
 *
 * Context lines default to 4 (matching Pi SDK).
 */
export function generateDiffString(
  oldContent: string,
  newContent: string,
  contextLines = 4,
): DiffResult {
  const parts = Diff.diffLines(oldContent, newContent);
  const output: string[] = [];

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLineNum = Math.max(oldLines.length, newLines.length);
  const lineNumWidth = String(maxLineNum).length;

  let oldLineNum = 1;
  let newLineNum = 1;
  let lastWasChange = false;
  let firstChangedLine: number | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const raw = part.value.split('\n');
    if (raw[raw.length - 1] === '') raw.pop();

    if (part.added || part.removed) {
      if (firstChangedLine === undefined) firstChangedLine = newLineNum;

      for (const line of raw) {
        if (part.added) {
          output.push(`+${String(newLineNum).padStart(lineNumWidth)} ${line}`);
          newLineNum++;
        } else {
          output.push(`-${String(oldLineNum).padStart(lineNumWidth)} ${line}`);
          oldLineNum++;
        }
      }
      lastWasChange = true;
    } else {
      const nextIsChange =
        i < parts.length - 1 && (parts[i + 1].added || parts[i + 1].removed);

      if (lastWasChange || nextIsChange) {
        let linesToShow = raw;
        let skipStart = 0;
        let skipEnd = 0;

        if (!lastWasChange) {
          skipStart = Math.max(0, raw.length - contextLines);
          linesToShow = raw.slice(skipStart);
        }
        if (!nextIsChange && linesToShow.length > contextLines) {
          skipEnd = linesToShow.length - contextLines;
          linesToShow = linesToShow.slice(0, contextLines);
        }

        if (skipStart > 0) {
          output.push(` ${''.padStart(lineNumWidth)} ...`);
          oldLineNum += skipStart;
          newLineNum += skipStart;
        }

        for (const line of linesToShow) {
          output.push(` ${String(oldLineNum).padStart(lineNumWidth)} ${line}`);
          oldLineNum++;
          newLineNum++;
        }

        if (skipEnd > 0) {
          output.push(` ${''.padStart(lineNumWidth)} ...`);
          oldLineNum += skipEnd;
          newLineNum += skipEnd;
        }
      } else {
        oldLineNum += raw.length;
        newLineNum += raw.length;
      }
      lastWasChange = false;
    }
  }

  return { diff: output.join('\n'), firstChangedLine };
}
