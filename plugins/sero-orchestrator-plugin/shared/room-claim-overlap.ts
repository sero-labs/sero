/**
 * When two path claims can name the same file.
 *
 * The rule lives in `shared` because both sides need the SAME answer: the
 * runtime applies it when a member claims a path, and the Room panel applies it
 * to say which members overlap. A second rule written for the panel would
 * eventually disagree with the one that was enforced.
 */

/**
 * One comparable form for a claim: `./src//app.ts/` and `src/app.ts` are the
 * same claim, and overlap detection would miss it otherwise.
 */
export function normalizeClaimPattern(pattern: string): string {
  return pattern
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/** `*` matches inside one segment only, which is what a path glob means. */
function segmentMatches(left: string, right: string): boolean {
  if (left === right) return true;
  if (!left.includes('*') && !right.includes('*')) return false;
  return toSegmentRegex(left).test(right) || toSegmentRegex(right).test(left);
}

function toSegmentRegex(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Whether two claim patterns can name the same file.
 *
 * A pattern that runs out of segments is treated as a DIRECTORY claim covering
 * everything below it: claiming `src` means claiming `src/api/users.ts`. That is
 * deliberately the generous direction — an advisory claim that warns once too
 * often costs a sentence, while one that stays silent costs two members a turn.
 */
export function patternsOverlap(left: string, right: string): boolean {
  const a = normalizeClaimPattern(left).split('/');
  const b = normalizeClaimPattern(right).split('/');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const segmentA = a[i];
    const segmentB = b[i];
    if (segmentA === undefined || segmentB === undefined) return true;
    if (segmentA === '**' || segmentB === '**') return true;
    if (!segmentMatches(segmentA, segmentB)) return false;
  }
  return true;
}
