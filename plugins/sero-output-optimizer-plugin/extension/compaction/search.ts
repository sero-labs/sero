import { byteLength } from './emitter';
import { applyPreservationGuard } from './preservation';

/**
 * Group complete search captures by file.
 *
 * Every file path, every matched line, and every non-match line (such as
 * `rg: private.txt: Permission denied`) is kept in full. Nothing is
 * abbreviated, capped or trimmed. When grouping would not reduce the byte
 * count, the raw output stays the candidate.
 */

/** A match line needs a numeric line number; an error line does not match. */
const SEARCH_LINE = /^(.+?):(\d+):(.*)$/;

interface SearchMatch {
  file: string;
  lineNumber: string;
  content: string;
}

interface ParsedSearch {
  matches: SearchMatch[];
  passthrough: string[];
  rawLines: string[];
}

function parseSearch(source: string): ParsedSearch {
  const matches: SearchMatch[] = [];
  const passthrough: string[] = [];
  const rawLines = source.split('\n');
  for (const line of rawLines) {
    if (!line.trim()) {
      passthrough.push(line);
      continue;
    }
    const match = line.match(SEARCH_LINE);
    if (!match) {
      passthrough.push(line);
      continue;
    }
    matches.push({
      file: match[1] ?? '',
      lineNumber: match[2] ?? '',
      content: match[3] ?? '',
    });
  }
  return { matches, passthrough, rawLines };
}

export function emitSearchOutput(source: string, emit: (line: string) => void): boolean {
  const { matches, passthrough, rawLines } = parseSearch(source);
  if (matches.length === 0) return false;

  const byFile = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const existing = byFile.get(match.file) ?? [];
    existing.push(match);
    byFile.set(match.file, existing);
  }

  const grouped: string[] = [...passthrough];
  grouped.push(`${matches.length} matches in ${byFile.size} files:`);
  const sortedFiles = [...byFile.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [file, fileMatches] of sortedFiles) {
    grouped.push(`${file} (${fileMatches.length} matches):`);
    for (const match of fileMatches) {
      grouped.push(`  ${match.lineNumber}: ${match.content}`);
    }
  }

  // Grouping only wins when it reduces the byte count; otherwise keep the raw
  // output so nothing is lost to a larger candidate.
  if (byteLength(grouped.join('\n')) >= byteLength(source)) {
    for (const line of rawLines) emit(line);
    return false;
  }

  for (const line of grouped) emit(line);
  return true;
}

export function groupSearchOutput(source: string): string | null {
  const lines: string[] = [];
  const changed = emitSearchOutput(source, (line) => lines.push(line));
  if (!changed) return null;
  return applyPreservationGuard(source, lines.join('\n'), 'search');
}
