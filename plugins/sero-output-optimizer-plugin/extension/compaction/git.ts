import { stripAnsi } from './ansi';
import { applyPreservationGuard } from './preservation';

/**
 * Compact Git status and log output.
 *
 * Status keeps every changed path, both status columns, and drops only the
 * `(use "git ...")` hints. The two porcelain columns are distinct: `MM` means
 * a staged and an unstaged change, `AM` a staged add with unstaged edits, `RM`
 * a rename with unstaged edits. Collapsing them would hide unstaged work.
 * Log keeps every commit identifier and the full commit message, dropping only
 * author/date metadata. Neither rule caps the number of paths or truncates a
 * message. Classification runs on the ANSI-stripped line.
 */

const COMMIT_HEADER = /^commit\s+[0-9a-f]{7,40}\b/i;
const GIT_HINT = /^\s*\(use /;
const LOG_METADATA = /^(?:Author|AuthorDate|CommitDate|Commit|Date|Merge):/i;

export function emitGitStatus(source: string, emit: (line: string) => void): boolean {
  let transformed = false;
  for (const raw of source.split('\n')) {
    const line = stripAnsi(raw);
    if (line.trim() === '' || GIT_HINT.test(line)) {
      transformed = true;
      continue;
    }
    emit(line);
  }
  return transformed;
}

export function emitGitLog(source: string, emit: (line: string) => void): boolean {
  let dropped = 0;
  let previousBlank = false;
  for (const raw of source.split('\n')) {
    const line = stripAnsi(raw);
    if (LOG_METADATA.test(line)) {
      dropped += 1;
      continue;
    }
    const blank = line.trim() === '';
    if (blank && previousBlank) {
      dropped += 1;
      continue;
    }
    previousBlank = blank;
    emit(line);
  }
  return dropped > 0;
}

export function emitGitOutput(source: string, emit: (line: string) => void): boolean {
  if (COMMIT_HEADER.test(stripAnsi(source))) return emitGitLog(source, emit);
  return emitGitStatus(source, emit);
}

export function compactGitOutput(source: string): string | null {
  const lines: string[] = [];
  const changed = emitGitOutput(source, (line) => lines.push(line));
  if (!changed) return null;
  return applyPreservationGuard(source, lines.join('\n'), 'git');
}
