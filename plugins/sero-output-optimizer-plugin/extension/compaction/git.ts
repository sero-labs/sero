import { applyPreservationGuard } from './preservation';

/**
 * Compact Git status and log output.
 *
 * Status keeps every changed path and drops only the `(use "git ...")` hints.
 * Log keeps every commit identifier and the full commit message, dropping only
 * author/date metadata. Neither rule caps the number of paths or truncates a
 * message.
 */

const COMMIT_HEADER = /^commit\s+[0-9a-f]{7,40}\b/i;
const GIT_HINT = /^\s*\(use /;
const LOG_METADATA = /^(?:Author|AuthorDate|CommitDate|Commit|Date|Merge):/i;

const PORCELAIN_ENTRY = /^([ MADRCU?]{2}) (.*)$/;

function compactGitStatus(source: string): string | null {
  const kept: string[] = [];
  for (const line of source.split('\n')) {
    if (line.trim() === '' || GIT_HINT.test(line)) continue;
    const porcelain = line.match(PORCELAIN_ENTRY);
    if (porcelain) {
      const status = porcelain[1] ?? '';
      const code = status[0] !== ' ' ? status[0] : status[1];
      kept.push(`${code ?? '?'} ${porcelain[2] ?? ''}`);
      continue;
    }
    kept.push(line);
  }
  const candidate = kept.join('\n');
  if (candidate.length >= source.length) return null;
  return applyPreservationGuard(source, candidate, 'git');
}

function compactGitLog(source: string): string | null {
  const kept: string[] = [];
  let previousBlank = false;
  for (const line of source.split('\n')) {
    if (LOG_METADATA.test(line)) continue;
    const blank = line.trim() === '';
    if (blank && previousBlank) continue;
    previousBlank = blank;
    kept.push(line);
  }
  const candidate = kept.join('\n');
  if (candidate.length >= source.length) return null;
  return applyPreservationGuard(source, candidate, 'git');
}

export function compactGitOutput(source: string): string | null {
  if (COMMIT_HEADER.test(source)) return compactGitLog(source);
  return compactGitStatus(source);
}
