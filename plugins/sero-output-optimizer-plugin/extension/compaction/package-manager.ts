import { PROGRESS_LINE, stripAnsi } from './ansi';
import { DIAGNOSTIC_LINE, applyPreservationGuard } from './preservation';

/**
 * Filter package-manager progress.
 *
 * A line is removed only when it matches a known progress pattern AND carries
 * no diagnostic, so errors and warnings always stay in the complete candidate.
 */
export function emitPackageManagerOutput(source: string, emit: (line: string) => void): boolean {
  let dropped = 0;
  for (const raw of source.split('\n')) {
    const line = stripAnsi(raw);
    if (PROGRESS_LINE.test(line) && !DIAGNOSTIC_LINE.test(line)) {
      dropped += 1;
      continue;
    }
    emit(line);
  }
  return dropped > 0;
}

export function compactPackageManagerOutput(source: string): string | null {
  const lines: string[] = [];
  const changed = emitPackageManagerOutput(source, (line) => lines.push(line));
  if (!changed) return null;
  return applyPreservationGuard(source, lines.join('\n'), 'packageManager');
}
