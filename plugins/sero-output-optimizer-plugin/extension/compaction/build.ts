import { PROGRESS_LINE, stripAnsi } from './ansi';
import { applyPreservationGuard } from './preservation';

/**
 * Filter build and type-check progress while keeping diagnostics.
 *
 * Only lines that match a known progress pattern are removed. Every other line,
 * including error lines and their indented file/line context, stays.
 */
export function compactBuildOutput(source: string): string | null {
  const lines = source.split('\n');
  const kept = lines.filter((line) => !PROGRESS_LINE.test(line));
  if (kept.length >= lines.length || kept.length === 0) return null;
  return applyPreservationGuard(source, stripAnsi(kept.join('\n')), 'build');
}
