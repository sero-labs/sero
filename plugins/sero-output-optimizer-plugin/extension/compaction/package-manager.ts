import { PROGRESS_LINE } from './ansi';
import { applyPreservationGuard } from './preservation';

/**
 * Filter package-manager progress.
 *
 * Only known progress lines are removed. Errors, warnings and every other line
 * stay in the complete candidate, so a non-zero exit keeps its diagnostics.
 */
export function compactPackageManagerOutput(source: string): string | null {
  const lines = source.split('\n');
  const kept = lines.filter((line) => !PROGRESS_LINE.test(line));
  if (kept.length >= lines.length || kept.length === 0) return null;
  return applyPreservationGuard(source, kept.join('\n'), 'packageManager');
}
