import { applyPreservationGuard } from './preservation';

/**
 * Compact test-runner output.
 *
 * Failure blocks and the run summary are kept; passing and progress lines are
 * dropped. The preservation guard rejects the result if it lost a failure or
 * summary line.
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

function isFailureStart(line: string): boolean {
  return FAILURE_START.some((pattern) => pattern.test(line));
}

export function compactTestOutput(source: string): string | null {
  const lines = source.split('\n');
  const kept: string[] = [];
  let inFailure = false;
  let sawProtected = false;

  for (const line of lines) {
    if (isFailureStart(line)) {
      inFailure = true;
      sawProtected = true;
      kept.push(line);
      continue;
    }
    if (SUMMARY_LINE.test(line)) {
      sawProtected = true;
      kept.push(line);
      continue;
    }
    if (inFailure) {
      if (/^\s/.test(line) || line.trim() === '') {
        kept.push(line);
        continue;
      }
      inFailure = false;
    }
  }

  if (!sawProtected) return null;
  if (kept.length >= lines.length) return null;
  return applyPreservationGuard(source, kept.join('\n'), 'test');
}
