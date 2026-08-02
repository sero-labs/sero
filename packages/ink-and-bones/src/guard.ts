/**
 * Argument guards for the authoring surface.
 *
 * An authored character is TypeScript that is compiled by esbuild, which
 * strips types without checking them. That makes every authoring call
 * effectively untyped at runtime, and the failure mode is the worst one there
 * is: a mis-shaped argument becomes NaN, the helper's loops never run, the
 * part draws NOTHING, and every audit gate passes — because the gates measure
 * the picture that came out, never whether it matches the calls that were
 * made. A knight lost its visor, its shield emblem, its crossguard and all its
 * chest shading exactly this way, and reported itself finished.
 *
 * So: every authoring argument is checked at the boundary and a wrong one
 * THROWS, where the loop turns it into feedback the author can act on. The
 * messages name the real signature, because the author's next move is to
 * rewrite the call.
 */

import type { Color } from './img';
import type { Vec } from './vec';

/** `${helper}: ${problem}. ${signature}` — every guard reads the same way. */
function fail(helper: string, problem: string, signature: string): never {
  throw new Error(`${helper}: ${problem}. ${signature}`);
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value === null) return 'null';
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return typeof value;
}

/** A finite number — the shape of a radius, a width, a depth, a coordinate. */
export function assertNumber(value: unknown, what: string, helper: string, signature: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(helper, `${what} must be a finite number, not ${describe(value)}`, signature);
  }
  return value;
}

/** A point: [x, y], both finite. */
export function assertVec(value: unknown, what: string, helper: string, signature: string): Vec {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    fail(helper, `${what} must be a point [x, y], not ${describe(value)}`, signature);
  }
  return value as unknown as Vec;
}

/** A colour: [r, g, b, a] in 0..1, as hex() returns. */
export function assertColor(value: unknown, what: string, helper: string, signature: string): Color {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some((c) => typeof c !== 'number' || !Number.isFinite(c))
  ) {
    fail(
      helper,
      `${what} must be a colour [r, g, b, a] from hex('4e5f78'), not ${describe(value)}`,
      signature,
    );
  }
  return value as unknown as Color;
}

/** A polyline: at least two points. */
export function assertPoints(value: unknown, what: string, helper: string, signature: string): readonly Vec[] {
  if (!Array.isArray(value)) {
    fail(helper, `${what} must be an array of [x, y] points, not ${describe(value)}`, signature);
  }
  if (value.length < 2) {
    fail(helper, `${what} needs at least two points, got ${value.length}`, signature);
  }
  value.forEach((point, i) => assertVec(point, `${what}[${i}]`, helper, signature));
  return value as readonly Vec[];
}

/** A per-point width profile: a non-empty ARRAY of finite numbers. A single
 * number is the mistake this exists to catch — it reads as a uniform width and
 * silently draws nothing. */
export function assertWidths(value: unknown, what: string, helper: string, signature: string): readonly number[] {
  if (typeof value === 'number') {
    fail(
      helper,
      `${what} must be an ARRAY of half-widths, one per point — [${value}, ${value}] for a uniform ` +
        `line, not the bare number ${value}`,
      signature,
    );
  }
  if (!Array.isArray(value) || value.length === 0) {
    fail(helper, `${what} must be a non-empty array of half-widths, not ${describe(value)}`, signature);
  }
  value.forEach((w, i) => assertNumber(w, `${what}[${i}]`, helper, signature));
  return value as readonly number[];
}
