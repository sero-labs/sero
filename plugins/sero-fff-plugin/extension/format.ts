/**
 * Output formatting shared by the three search tools.
 *
 * Adapted from `@ff-labs/pi-fff` (MIT, © Dmitry Kovalenko) — see NOTICE.md.
 *
 * Two rules hold everywhere here: results are never re-sorted (the engine's
 * frecency order is the ranking, and re-sorting it only confuses the model),
 * and output is bounded so a single call cannot flood the context window.
 */

import type { GrepResult, SearchResult } from '@ff-labs/fff-node';

export const GREP_MAX_LINE_LENGTH = 500;
export const GREP_CONTEXT_MAX = 20;

const HOT_FRECENCY = 25;
const WARM_FRECENCY = 20;

/** Results below this share of a perfect score are scattered fuzzy noise. */
const WEAK_SCORE_RATIO = 0.5;
const PERFECT_SCORE_PER_CHAR = 12;
const WEAK_SAMPLE_SIZE = 5;

export function truncateLine(line: string, max = GREP_MAX_LINE_LENGTH): string {
  const trimmed = line.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}...`;
}

/** Clamps caller-supplied context so a large value cannot multiply output size. */
export function clampContext(context: number | undefined): number {
  if (!context || context < 0) return 0;
  return Math.min(Math.floor(context), GREP_CONTEXT_MAX);
}

/**
 * At most one tag per file, so output stays scannable. A dirty git state beats
 * frecency because it says the file is changing right now.
 */
export function fileAnnotation(item: {
  gitStatus?: string;
  totalFrecencyScore?: number;
  accessFrecencyScore?: number;
}): string {
  const git = item.gitStatus;
  if (git && git !== 'clean' && git !== 'unknown' && git !== '') return `  [${git} in git]`;

  const frecency = item.totalFrecencyScore ?? item.accessFrecencyScore ?? 0;
  if (frecency >= HOT_FRECENCY) return '  [very often touched file]';
  if (frecency >= WARM_FRECENCY) return '  [often touched file]';
  return '';
}

/** Groups matches under their file in the order the engine returned them. */
export function formatGrepOutput(result: GrepResult): string {
  if (result.items.length === 0) return 'No matches found';

  const lines: string[] = [];
  let currentFile = '';

  for (const match of result.items) {
    if (match.relativePath !== currentFile) {
      if (lines.length > 0) lines.push('');
      currentFile = match.relativePath;
      lines.push(`${currentFile}${fileAnnotation(match)}`);
    }

    const before = match.contextBefore ?? [];
    before.forEach((line, index) => {
      lines.push(` ${match.lineNumber - before.length + index}- ${truncateLine(line)}`);
    });

    lines.push(` ${match.lineNumber}: ${truncateLine(match.lineContent)}`);

    (match.contextAfter ?? []).forEach((line, index) => {
      lines.push(` ${match.lineNumber + 1 + index}- ${truncateLine(line)}`);
    });
  }

  return lines.join('\n');
}

export function weakScoreThreshold(pattern: string): number {
  return Math.floor(pattern.length * PERFECT_SCORE_PER_CHAR * WEAK_SCORE_RATIO);
}

export interface FormattedFind {
  output: string;
  weak: boolean;
  shownCount: number;
}

/**
 * Renders a file list. When the top score says the whole page is weak fuzzy
 * noise, only a small sample is shown — a full page of near-misses costs
 * context and tells the model nothing.
 */
export function formatFindOutput(
  result: SearchResult,
  limit: number,
  pattern: string,
): FormattedFind {
  if (result.items.length === 0) {
    return { output: 'No files found matching pattern', weak: false, shownCount: 0 };
  }

  const topScore = result.scores[0]?.total ?? 0;
  const weak = topScore < weakScoreThreshold(pattern);
  const shown = result.items.slice(0, weak ? Math.min(WEAK_SAMPLE_SIZE, limit) : limit);

  return {
    output: shown.map((item) => `${item.relativePath}${fileAnnotation(item)}`).join('\n'),
    weak,
    shownCount: shown.length,
  };
}

/** Appends bracketed notices (cursor, fallback warnings) to a tool output block. */
export function withNotices(output: string, notices: string[]): string {
  return notices.length > 0 ? `${output}\n\n[${notices.join('. ')}]` : output;
}
