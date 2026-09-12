import { applyPreservationGuard } from './preservation';

/**
 * Group complete search captures by file.
 *
 * Every file path and every matched line is kept in full. Nothing is
 * abbreviated, capped or trimmed. When grouping would not reduce the byte
 * count, the raw output stays the candidate.
 */

const SEARCH_LINE = /^(.+?):(\d+)?:(.*)$/;

interface SearchMatch {
  file: string;
  lineNumber: string;
  content: string;
}

function parseMatches(source: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  for (const line of source.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(SEARCH_LINE);
    if (!match) continue;
    matches.push({
      file: match[1] ?? '',
      lineNumber: match[2] ?? '',
      content: match[3] ?? '',
    });
  }
  return matches;
}

export function groupSearchOutput(source: string): string | null {
  const matches = parseMatches(source);
  if (matches.length === 0) return null;

  const byFile = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const existing = byFile.get(match.file) ?? [];
    existing.push(match);
    byFile.set(match.file, existing);
  }

  const lines: string[] = [`${matches.length} matches in ${byFile.size} files:`];
  const sortedFiles = [...byFile.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [file, fileMatches] of sortedFiles) {
    lines.push(`${file} (${fileMatches.length} matches):`);
    for (const match of fileMatches) {
      lines.push(`  ${match.lineNumber}: ${match.content}`);
    }
  }

  const candidate = lines.join('\n');
  if (candidate.length >= source.length) return null;
  return applyPreservationGuard(source, candidate, 'search');
}
