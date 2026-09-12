import type { PreviewResult } from '../preview';
import type { OutputCategory } from './category';
import { stripAnsi } from './ansi';
import { BoundedPreviewEmitter } from './emitter';
import { applyPreservationGuard } from './preservation';
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
  const emitter = new BoundedPreviewEmitter(limits.maxLines, limits.maxBytes);

  if (category === 'none') {
    for (const line of source.split('\n')) emitter.emit(line);
    return {
      candidateBytes: emitter.bytes(),
      changed: false,
      recognized: false,
      rule: null,
      preview: emitter.result(),
    };
  }

  let ansiChanged = false;
  const emit = (line: string): void => {
    const stripped = stripAnsi(line);
    if (stripped !== line) ansiChanged = true;
    emitter.emit(stripped);
  };

  const transformed = emitRule(source, category, emit);
  const changed = ansiChanged || transformed;

  return {
    candidateBytes: emitter.bytes(),
    changed,
    recognized: true,
    rule: changed ? category : null,
    preview: emitter.result(),
  };
}
