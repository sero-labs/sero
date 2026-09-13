import type { PreviewResult } from '../preview';
import type { OutputCategory } from './category';
import { stripAnsi } from './ansi';
import { BoundedPreviewEmitter } from './emitter';
import { applyPreservationGuard, protectedFragments } from './preservation';
import { compactBuildOutput, emitBuildOutput } from './build';
import { compactGitOutput, emitGitOutput } from './git';
import { compactLinterOutput, emitLinterOutput } from './lint';
import { compactPackageManagerOutput, emitPackageManagerOutput } from './package-manager';
import { emitSearchOutput, groupSearchOutput } from './search';
import { compactTestOutput, emitTestOutput } from './test';

/**
 * Run the category rule and, in the string form, keep the result only when it
 * preserves protected content. The stream form emits the candidate line by line
 * so the plugin never holds a second full candidate.
 */

export interface CompactionOutcome {
  candidate: string;
  changed: boolean;
  recognized: boolean;
  /** The rule that produced the candidate, or null when none applied. */
  rule: OutputCategory | null;
}

export interface StreamOutcome {
  /** Complete candidate size in UTF-8 bytes, before presentation limits. */
  candidateBytes: number;
  changed: boolean;
  recognized: boolean;
  rule: OutputCategory | null;
  preview: PreviewResult;
}

export interface StreamLimits {
  maxLines?: number;
  maxBytes?: number;
}

function runRule(source: string, category: OutputCategory): string | null {
  switch (category) {
    case 'test':
      return compactTestOutput(source);
    case 'build':
      return compactBuildOutput(source);
    case 'lint':
      return compactLinterOutput(source);
    case 'git':
      return compactGitOutput(source);
    case 'packageManager':
      return compactPackageManagerOutput(source);
    case 'search':
      return groupSearchOutput(source);
    default:
      return null;
  }
}

export function compactCapture(source: string, category: OutputCategory): CompactionOutcome {
  if (category === 'none') {
    return { candidate: source, changed: false, recognized: false, rule: null };
  }

  const stripped = stripAnsi(source);
  const ruleOutput = runRule(stripped, category);
  const candidate = applyPreservationGuard(stripped, ruleOutput, category);
  const changed = candidate !== source;
  return {
    candidate,
    changed,
    recognized: true,
    rule: changed ? category : null,
  };
}

function emitRule(source: string, category: OutputCategory, emit: (line: string) => void): boolean {
  switch (category) {
    case 'test':
      return emitTestOutput(source, emit);
    case 'build':
      return emitBuildOutput(source, emit);
    case 'lint':
      return emitLinterOutput(source, emit);
    case 'git':
      return emitGitOutput(source, emit);
    case 'packageManager':
      return emitPackageManagerOutput(source, emit);
    case 'search':
      return emitSearchOutput(source, emit);
    default:
      return false;
  }
}

/** Compact a capture without materializing the complete candidate. */
export function compactStream(
  source: string,
  category: OutputCategory,
  limits: StreamLimits = {},
): StreamOutcome {
  if (category === 'none') {
    const emitter = new BoundedPreviewEmitter(limits.maxLines, limits.maxBytes);
    for (const line of source.split('\n')) emitter.emit(line);
    return {
      candidateBytes: emitter.bytes(),
      changed: false,
      recognized: false,
      rule: null,
      preview: emitter.result(),
    };
  }

  const emitter = new BoundedPreviewEmitter(limits.maxLines, limits.maxBytes);
  const missing = new Set(protectedFragments(source, category));
  let ansiChanged = false;
  let sawContent = false;

  const emit = (line: string): void => {
    const stripped = stripAnsi(line);
    if (stripped !== line) ansiChanged = true;
    if (stripped.trim()) sawContent = true;
    emitter.emit(stripped);
  };

  // Track protected fragments while the rule streams, so the guard still costs
  // no second candidate. An emitted line usually equals its own fragment; the
  // scan only runs when a rule reformats one, such as lint grouping.
  const trackedEmit = (line: string): void => {
    if (missing.size > 0) {
      const trimmed = line.trim();
      if (!missing.delete(trimmed)) {
        for (const fragment of missing) {
          if (line.includes(fragment)) missing.delete(fragment);
        }
      }
    }
    emit(line);
  };

  const transformed = emitRule(source, category, trackedEmit);

  if (missing.size > 0 || (source.trim().length > 0 && !sawContent)) {
    // The rule dropped protected content, or emptied a source that had some.
    // Emit the stripped source instead, so nothing is lost.
    const fallback = new BoundedPreviewEmitter(limits.maxLines, limits.maxBytes);
    for (const line of source.split('\n')) fallback.emit(stripAnsi(line));
    return {
      candidateBytes: fallback.bytes(),
      changed: ansiChanged,
      recognized: true,
      rule: ansiChanged ? category : null,
      preview: fallback.result(),
    };
  }

  const changed = ansiChanged || transformed;
  return {
    candidateBytes: emitter.bytes(),
    changed,
    recognized: true,
    rule: changed ? category : null,
    preview: emitter.result(),
  };
}
