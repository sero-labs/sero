import type { OutputCategory } from './category';
import { stripAnsi } from './ansi';
import { applyPreservationGuard } from './preservation';
import { compactBuildOutput } from './build';
import { compactGitOutput } from './git';
import { compactLinterOutput } from './lint';
import { compactPackageManagerOutput } from './package-manager';
import { groupSearchOutput } from './search';
import { compactTestOutput } from './test';

/**
 * Run the category rule and keep the result only when it preserves protected
 * content. A `none` category is returned unchanged.
 */

export interface CompactionOutcome {
  candidate: string;
  changed: boolean;
  recognized: boolean;
  /** The rule that produced the candidate, or null when none applied. */
  rule: OutputCategory | null;
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
