import { PROGRESS_LINE, stripAnsi } from './ansi';
import {
  applyPreservationGuard,
  isDiagnosticLine,
  isFailureLine,
  isFileReferenceLine,
  isSeparatorLine,
  isSummaryLine,
} from './preservation';

/**
 * Compact test-runner output.
 *
 * Failure blocks, the run summary, every diagnostic line and every file/line
 * context line are kept; passing and progress lines are dropped. A failure
 * block keeps every line until a passing line, a section separator or an
 * unindented progress line: assertion details such as `AssertionError`, the
 * expected/received diff and the source excerpt are not indented, so an
 * indentation test would cut the block at its first useful line.
 */

const PASSING_LINE = /^\s*[✓✔]/;

function isProtectedLine(line: string): boolean {
  return isFailureLine(line) || isSummaryLine(line) || isDiagnosticLine(line) || isFileReferenceLine(line);
}

function endsFailureBlock(line: string): boolean {
  if (isSeparatorLine(line)) return true;
  if (PASSING_LINE.test(line)) return true;
  // An indented progress-looking line can still be failure detail.
  return PROGRESS_LINE.test(line) && !/^\s/.test(line);
}

export function emitTestOutput(source: string, emit: (line: string) => void): boolean {
  const lines = source.split('\n').map(stripAnsi);
  // Without a failure, summary, diagnostic or file/line there is nothing safe
  // to compact; keep the source so it is never emptied.
  if (!lines.some(isProtectedLine)) {
    for (const line of lines) emit(line);
    return false;
  }

  let inFailure = false;
  let dropped = 0;

  for (const line of lines) {
    if (isProtectedLine(line)) {
      if (isFailureLine(line)) inFailure = true;
      emit(line);
      continue;
    }
    if (inFailure && !endsFailureBlock(line)) {
      emit(line);
      continue;
    }
    inFailure = false;
    dropped += 1;
  }

  return dropped > 0;
}

export function compactTestOutput(source: string): string | null {
  const lines: string[] = [];
  const changed = emitTestOutput(source, (line) => lines.push(line));
  if (!changed) return null;
  return applyPreservationGuard(source, lines.join('\n'), 'test');
}
