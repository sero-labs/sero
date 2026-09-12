import { stripAnsi } from './ansi';
import { DIAGNOSTIC_LINE, applyPreservationGuard } from './preservation';

/**
 * Compact test-runner output.
 *
 * Failure blocks, the run summary, every diagnostic line, and every file/line
 * context line are kept; passing and progress lines are dropped. Classification
 * runs on the ANSI-stripped line, so a coloured FAIL block keeps its block.
 */

const FAILURE_START = [
  /^FAIL\s+/,
  /^FAILED\s+/,
  /^\s*●\s+/,
  /^\s*✕\s+/,
  /^\s*×\s+/,
  /test\s+\S+\s+\.\.\.\s*FAILED/,
  /thread\s+'\S+'\s+panicked/,
];

const SUMMARY_LINE = /test result:|\b\d+\s+(?:passed|failed|skipped|todo)\b|\bTests?:\s*\d/i;
/** A file/line context such as `src/main.ts:12:5` must survive. */
const FILE_LINE = /[^\s:]*[./][^\s:]*:\d+(?::\d+)?/;

function isFailureStart(line: string): boolean {
  return FAILURE_START.some((pattern) => pattern.test(line));
}

function isProtectedLine(line: string): boolean {
  return isFailureStart(line) || SUMMARY_LINE.test(line) || DIAGNOSTIC_LINE.test(line) || FILE_LINE.test(line);
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
      if (isFailureStart(line)) inFailure = true;
      emit(line);
      continue;
    }
    if (inFailure) {
      if (/^\s/.test(line) || line.trim() === '') {
        emit(line);
        continue;
      }
      inFailure = false;
    }
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
