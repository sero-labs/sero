/**
 * Conflict blocks, read out of a file and put back into it.
 *
 * The AI resolver needs two things the library cannot give it. First, the text
 * of each side on its own, to send to the model. Second, a way to write back a
 * resolution that is **neither side** — `resolveConflict()` takes the closed
 * union `'current' | 'incoming' | 'both'`, so anything the model composes has
 * to be written as file contents (§9.3).
 *
 * Every index here is against the **original** contents, and `rebuild()` always
 * starts from them. Nothing is ever applied on top of an already-rewritten
 * file, so indices never drift as resolutions land, order does not matter, and
 * undo is just a rebuild with fewer resolutions in it — which is what makes
 * "undo the machine's work but keep my answers" a one-liner rather than a
 * reverse patch.
 */

const START = /^<<<<<<< ?(.*)$/;
const BASE = /^\|\|\|\|\|\|\| ?(.*)$/;
const SEPARATOR = /^=======\s*$/;
const END = /^>>>>>>> ?(.*)$/;

export interface ConflictRegion {
  /** Position in the file, counting from 0. Stable for the life of the parse. */
  index: number;
  /** What HEAD has — "current" in the resolver's vocabulary. */
  current: string;
  /** What is being merged in. */
  incoming: string;
  /** The common ancestor, present only in diff3-style markers. */
  base?: string;
  currentLabel: string;
  incomingLabel: string;
  /** Line numbers of the block itself, 1-based and inclusive of the markers. */
  startLine: number;
  endLine: number;
}

interface ParsedFile {
  lines: string[];
  regions: ConflictRegion[];
  /** `\r\n` when the file uses it, so a rebuild does not silently convert line endings. */
  newline: string;
}

/**
 * Only complete, well-formed blocks count. A truncated one is left as ordinary
 * text: a half-parsed conflict written back would corrupt the file, and the
 * marker count the rest of the UI uses would disagree with what was resolved.
 */
export function parseConflictRegions(contents: string): ConflictRegion[] {
  return parseFile(contents).regions;
}

function parseFile(contents: string): ParsedFile {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  const regions: ConflictRegion[] = [];

  let cursor = 0;
  while (cursor < lines.length) {
    const startMatch = lines[cursor]?.match(START);
    if (!startMatch) {
      cursor += 1;
      continue;
    }

    const block = readBlock(lines, cursor);
    if (!block) {
      // Unterminated: not a conflict, just text that looks like one.
      cursor += 1;
      continue;
    }

    regions.push({ ...block.region, index: regions.length });
    cursor = block.nextLine;
  }

  return { lines, regions, newline };
}

function readBlock(
  lines: string[],
  startLine: number,
): { region: Omit<ConflictRegion, 'index'>; nextLine: number } | null {
  const currentLabel = lines[startLine]!.match(START)![1]!.trim();
  const current: string[] = [];
  const base: string[] = [];
  const incoming: string[] = [];

  let section: 'current' | 'base' | 'incoming' = 'current';
  let hasBase = false;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i]!;

    // A second start marker before this one closed means the first was never a
    // conflict. Give up on it rather than swallowing the real block after it.
    if (START.test(line)) return null;

    if (section === 'current' && BASE.test(line)) {
      section = 'base';
      hasBase = true;
      continue;
    }
    if (section !== 'incoming' && SEPARATOR.test(line)) {
      section = 'incoming';
      continue;
    }

    const endMatch = line.match(END);
    if (endMatch) {
      if (section !== 'incoming') return null;
      return {
        region: {
          current: current.join('\n'),
          incoming: incoming.join('\n'),
          base: hasBase ? base.join('\n') : undefined,
          currentLabel: currentLabel || 'HEAD',
          incomingLabel: endMatch[1]!.trim(),
          startLine: startLine + 1,
          endLine: i + 1,
        },
        nextLine: i + 1,
      };
    }

    if (section === 'current') current.push(line);
    else if (section === 'base') base.push(line);
    else incoming.push(line);
  }

  return null;
}

/**
 * The original contents with the given conflicts replaced by their resolutions.
 * Anything not in the map keeps its markers, so a partly-resolved file stays
 * partly conflicted — which is exactly what the pane should show while the run
 * is still working.
 */
export function rebuildWithResolutions(
  originalContents: string,
  resolutions: ReadonlyMap<number, string>,
): string {
  const { lines, regions, newline } = parseFile(originalContents);
  if (regions.length === 0) return originalContents;

  const out: string[] = [];
  let cursor = 0;

  for (const region of regions) {
    out.push(...lines.slice(cursor, region.startLine - 1));

    const resolution = resolutions.get(region.index);
    if (resolution === undefined) {
      out.push(...lines.slice(region.startLine - 1, region.endLine));
    } else if (resolution !== '') {
      // An empty resolution means "neither side" — the block goes, and no
      // blank line is left where it was.
      out.push(...resolution.split(/\r?\n/));
    }

    cursor = region.endLine;
  }

  out.push(...lines.slice(cursor));
  return out.join(newline);
}
