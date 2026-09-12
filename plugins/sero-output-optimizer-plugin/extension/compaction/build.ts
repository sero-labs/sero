import { PROGRESS_LINE, stripAnsi } from './ansi';
import { DIAGNOSTIC_LINE, applyPreservationGuard } from './preservation';

/**
 * Filter build and type-check progress while keeping diagnostics.
 *
 * A line is removed only when it matches a known progress pattern AND carries
 * no diagnostic. A progress line that mentions an error or warning stays.
 */
export function emitBuildOutput(source: string, emit: (line: string) => void): boolean {
  let dropped = 0;
  for (const line of source.split('\n')) {
    if (PROGRESS_LINE.test(line) && !DIAGNOSTIC_LINE.test(line)) {
      dropped += 1;
      continue;
    }
    emit(line);
  }
  return dropped > 0;
}

export function compactBuildOutput(source: string): string | null {
  const lines: string[] = [];
  const changed = emitBuildOutput(source, (line) => lines.push(stripAnsi(line)));
  if (!changed) return null;
  return applyPreservationGuard(source, lines.join('\n'), 'build');
}
