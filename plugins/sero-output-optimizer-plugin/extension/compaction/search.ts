import { stripAnsi } from './ansi';
import { byteLength, countBytes } from './emitter';
import { applyPreservationGuard } from './preservation';

/**
 * Group complete search captures by file.
 *
 * Every file path, every matched line, and every non-match line (such as
 * `rg: private.txt: Permission denied`) is kept in full. Nothing is
 * abbreviated, capped or trimmed. When parsing finds no matches, or grouping
 * would not reduce the byte count, the unchanged source is emitted so output is
 * never emptied. The grouped candidate is counted without being joined.
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
  byFile: Map<string, SearchMatch[]>;
  passthrough: string[];
  rawLines: string[];
}

function parseSearch(source: string): ParsedSearch {
  const matches: SearchMatch[] = [];
  const byFile = new Map<string, SearchMatch[]>();
  const passthrough: string[] = [];
  const rawLines: string[] = [];

  for (const raw of source.split('\n')) {
    const line = stripAnsi(raw);
    rawLines.push(line);
    if (!line.trim()) {
      passthrough.push(line);
      continue;
    }
    const match = line.match(SEARCH_LINE);
    if (!match) {
      passthrough.push(line);
      continue;
    }
    const entry: SearchMatch = { file: match[1] ?? '', lineNumber: match[2] ?? '', content: match[3] ?? '' };
    matches.push(entry);
    const existing = byFile.get(entry.file) ?? [];
    existing.push(entry);
    byFile.set(entry.file, existing);
  }

  return { matches, byFile, passthrough, rawLines };
}

function* searchCandidate(parsed: ParsedSearch): Generator<string> {
  yield* parsed.passthrough;
  yield `${parsed.matches.length} matches in ${parsed.byFile.size} files:`;
  const sortedFiles = [...parsed.byFile.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [file, fileMatches] of sortedFiles) {
    yield `${file} (${fileMatches.length} matches):`;
    for (const match of fileMatches) {
      yield `  ${match.lineNumber}: ${match.content}`;
    }
  }
}

function emitRaw(parsed: ParsedSearch, emit: (line: string) => void): false {
  for (const line of parsed.rawLines) emit(line);
  return false;
}

export function emitSearchOutput(source: string, emit: (line: string) => void): boolean {
  const parsed = parseSearch(source);
  if (parsed.matches.length === 0) return emitRaw(parsed, emit);

  // Grouping only wins when it reduces the byte count; otherwise keep the raw
  // output so nothing is lost to a larger candidate.
  if (countBytes(searchCandidate(parsed)) >= byteLength(source)) return emitRaw(parsed, emit);

  for (const line of searchCandidate(parsed)) emit(line);
  return true;
}

export function groupSearchOutput(source: string): string | null {
  const lines: string[] = [];
  const changed = emitSearchOutput(source, (line) => lines.push(line));
  if (!changed) return null;
  return applyPreservationGuard(source, lines.join('\n'), 'search');
}
