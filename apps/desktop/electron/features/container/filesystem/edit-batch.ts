/**
 * Batched and fuzzy edit matching for the shared edit tool.
 *
 * Every replacement resolves against one original content view. When any
 * replacement needs fuzzy matching, all replacements run in the fuzzy
 * normalized view and untouched lines are copied back from the original.
 */

import * as Diff from 'diff';

import {
  countFuzzyOccurrences,
  fuzzyFindText,
  normalizeForFuzzyMatch,
  normalizeToLF,
} from './edit-helpers';

// ── Nearest candidate region ────────────────────────────────

const NEAREST_LINE_MAX_CHARS = 120;

function tokenizeLine(line: string): Set<string> {
  return new Set(line.toLowerCase().match(/[a-z0-9_$]+/g) ?? []);
}

function clampLine(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > NEAREST_LINE_MAX_CHARS
    ? `${trimmed.slice(0, NEAREST_LINE_MAX_CHARS)}…`
    : trimmed;
}

/**
 * Name the closest line to a failed match.
 *
 * The score is the share of needle tokens that the candidate line contains.
 * A candidate needs at least half of them to count as "near". The hint is
 * advisory: it never changes the match result.
 */
export function findNearestRegion(
  content: string,
  oldText: string,
  minScore = 0.5,
): { line: number; text: string } | undefined {
  const normalizedOldText = normalizeForFuzzyMatch(oldText);
  const needleLine = normalizedOldText
    .split('\n')
    .find((line) => line.trim().length >= 4);
  if (!needleLine) return undefined;

  const needleTokens = tokenizeLine(needleLine);
  if (needleTokens.size === 0) return undefined;

  const lines = normalizeForFuzzyMatch(content).split('\n');
  let best: { line: number; text: string; score: number } | undefined;
  for (let i = 0; i < lines.length; i += 1) {
    const candidateTokens = tokenizeLine(lines[i]);
    if (candidateTokens.size === 0) continue;
    let shared = 0;
    for (const token of needleTokens) {
      if (candidateTokens.has(token)) shared += 1;
    }
    const score = shared / needleTokens.size;
    if (score >= minScore && (!best || score > best.score)) {
      best = { line: i + 1, text: clampLine(lines[i]), score };
    }
  }

  return best ? { line: best.line, text: best.text } : undefined;
}

// ── Batched edits ───────────────────────────────────────────

export interface EditReplacement {
  oldText: string;
  newText: string;
}

export interface AppliedEdits {
  /** Content the replacements were matched against. */
  baseContent: string;
  /** Content after every replacement. */
  newContent: string;
}

interface MatchedReplacement {
  editIndex: number;
  matchIndex: number;
  matchLength: number;
  newText: string;
}

function applyReplacements(
  content: string,
  replacements: MatchedReplacement[],
  offset = 0,
): string {
  let result = content;
  for (let i = replacements.length - 1; i >= 0; i -= 1) {
    const replacement = replacements[i];
    const matchIndex = replacement.matchIndex - offset;
    result = result.substring(0, matchIndex)
      + replacement.newText
      + result.substring(matchIndex + replacement.matchLength);
  }
  return result;
}

/**
 * Split content into lines that keep their endings. A missing final newline and
 * a whitespace-only final line both stay represented, so the original and the
 * normalized view always line up one to one.
 */
function splitLines(content: string): string[] {
  const parts = content.split('\n');
  return parts.map((text, index) => (index < parts.length - 1 ? `${text}\n` : text));
}

/**
 * Apply replacements matched against `baseContent` to `originalContent` and
 * keep every line the replacement did not actually change.
 *
 * Runs the replacements on the normalized base first, then aligns the base
 * with the result line by line using exact text. Because the base is the
 * matched input view and the result is the requested output, an exact match
 * means the replacement left that line alone. Aligned lines are copied from
 * `originalContent` byte for byte, so their whitespace and Unicode characters
 * survive. Any requested change, including a quote, dash, or trailing-space
 * change, differs exactly and is taken from the result. A whitespace-only
 * final line is kept because both views split the same way.
 */
export function applyReplacementsPreservingUnchangedLines(
  originalContent: string,
  baseContent: string,
  replacements: MatchedReplacement[],
): string {
  const originalLines = splitLines(originalContent);
  if (originalLines.length !== splitLines(baseContent).length) {
    throw new Error('Cannot preserve unchanged lines because the base content has a different line count.');
  }

  const replacedBase = applyReplacements(baseContent, replacements);
  const replacedLines = splitLines(replacedBase);
  const parts = Diff.diffLines(baseContent, replacedBase);

  let baseLineIndex = 0;
  let replacedLineIndex = 0;
  let result = '';
  for (const part of parts) {
    const count = part.count ?? 0;
    if (part.added) {
      result += replacedLines.slice(replacedLineIndex, replacedLineIndex + count).join('');
      replacedLineIndex += count;
      continue;
    }
    if (part.removed) {
      baseLineIndex += count;
      continue;
    }
    result += originalLines.slice(baseLineIndex, baseLineIndex + count).join('');
    baseLineIndex += count;
    replacedLineIndex += count;
  }
  // A final line without a trailing newline is not an aligned part, so append
  // whatever the base view did not cover, including the whitespace-only line.
  result += originalLines.slice(baseLineIndex).join('');
  return result;
}

function editLabel(editIndex: number, totalEdits: number): string {
  return totalEdits === 1 ? 'the replacement' : `edits[${editIndex}]`;
}

export class EditMatchError extends Error {}

function notFoundMessage(
  path: string,
  editIndex: number,
  totalEdits: number,
  baseContent: string,
  oldText: string,
): string {
  const label = editLabel(editIndex, totalEdits);
  const nearest = findNearestRegion(baseContent, oldText);
  const hint = nearest
    ? ` Nearest candidate region: line ${nearest.line}: \`${nearest.text}\`.`
    : ' No similar region was found in the file.';
  return `Could not match ${label} in ${path}. The matcher tolerates trailing whitespace per line and normalizes smart quotes, dashes, and special spaces.${hint}`;
}

function duplicateMessage(path: string, editIndex: number, totalEdits: number, occurrences: number): string {
  return `Found ${occurrences} matches for ${editLabel(editIndex, totalEdits)} in ${path}. Provide more context so the match is unique.`;
}

function noOpMessage(path: string, editIndex: number, totalEdits: number): string {
  return `${editLabel(editIndex, totalEdits)} in ${path} would replace text with identical text. The whole call stopped and the file was not written.`;
}

/**
 * Apply one or more exact-text replacements to LF-normalized content.
 *
 * Every replacement resolves against the same original content, never against
 * the result of an earlier replacement. If any replacement needs fuzzy
 * matching, all replacements run in one fuzzy-normalized view and the touched
 * line regions are written back over the original content. The call is
 * all-or-nothing: any miss, ambiguity, overlap, or no-op throws before a
 * replacement is returned.
 */
export function applyEditsToNormalizedContent(
  normalizedContent: string,
  edits: EditReplacement[],
  path: string,
): AppliedEdits {
  if (edits.length === 0) {
    throw new EditMatchError(`No replacements were provided for ${path}.`);
  }

  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeToLF(edit.oldText),
    newText: normalizeToLF(edit.newText),
  }));

  for (let i = 0; i < normalizedEdits.length; i += 1) {
    if (normalizedEdits[i].oldText.length === 0) {
      throw new EditMatchError(
        normalizedEdits.length === 1
          ? `oldText must not be empty in ${path}.`
          : `edits[${i}].oldText must not be empty in ${path}.`,
      );
    }
  }

  const initialMatches = normalizedEdits.map((edit) => fuzzyFindText(normalizedContent, edit.oldText));
  const usedFuzzyMatch = initialMatches.some((match) => match.usedFuzzyMatch);
  const replacementBaseContent = usedFuzzyMatch
    ? normalizeForFuzzyMatch(normalizedContent)
    : normalizedContent;

  const matchedEdits: MatchedReplacement[] = [];
  for (let i = 0; i < normalizedEdits.length; i += 1) {
    const edit = normalizedEdits[i];
    const matchResult = fuzzyFindText(replacementBaseContent, edit.oldText);
    if (!matchResult.found) {
      throw new EditMatchError(
        notFoundMessage(path, i, normalizedEdits.length, replacementBaseContent, edit.oldText),
      );
    }

    const occurrences = countFuzzyOccurrences(replacementBaseContent, edit.oldText);
    if (occurrences > 1) {
      throw new EditMatchError(
        duplicateMessage(path, i, normalizedEdits.length, occurrences),
      );
    }

    matchedEdits.push({
      editIndex: i,
      matchIndex: matchResult.index,
      matchLength: matchResult.matchLength,
      newText: edit.newText,
    });
  }

  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
  for (let i = 1; i < matchedEdits.length; i += 1) {
    const previous = matchedEdits[i - 1];
    const current = matchedEdits[i];
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new EditMatchError(
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${path}. Merge them into one replacement or target disjoint regions.`,
      );
    }
  }

  for (const replacement of matchedEdits) {
    const matchedText = replacementBaseContent.slice(
      replacement.matchIndex,
      replacement.matchIndex + replacement.matchLength,
    );
    if (matchedText === replacement.newText) {
      throw new EditMatchError(
        noOpMessage(path, replacement.editIndex, normalizedEdits.length),
      );
    }
  }

  const newContent = usedFuzzyMatch
    ? applyReplacementsPreservingUnchangedLines(normalizedContent, replacementBaseContent, matchedEdits)
    : applyReplacements(replacementBaseContent, matchedEdits);

  if (normalizedContent === newContent) {
    throw new EditMatchError(
      normalizedEdits.length === 1
        ? `No change was made to ${path}. The replacement produced identical content.`
        : `No change was made to ${path}. The replacements produced identical content.`,
    );
  }

  return { baseContent: normalizedContent, newContent };
}

