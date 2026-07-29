/**
 * Settling a request against what the model behind it will actually accept.
 *
 * This exists because guessing was wrong, in the way that costs a generation. A
 * clip length is not a free number: one video model takes exactly 5 or 10
 * seconds, the next takes any integer from 2 to 6, and a length outside the set
 * is rejected outright — the request fails and the artwork never arrives.
 * Hard-coding the lengths here would only move the problem, since the model id
 * is a setting the user is invited to edit.
 *
 * So the provider is asked, and what it says is applied here — in shared code,
 * because the same rules have to hold for a length typed into the dialog, one a
 * model asked for through a tool, and one replayed from a stored request months
 * later.
 */

import type { MediaCapability, MediaModelOptions } from './media';
import { DEFAULT_VIDEO_SECONDS, MAX_VIDEO_SECONDS, boundedDuration } from './media';

/** Every length worth offering for a model, ascending, or null when unknown. */
export function allowedDurations(options: MediaModelOptions | undefined): number[] | null {
  const listed = options?.durationsSeconds;
  if (listed !== undefined && listed.length > 0) return listed.toSorted((a, b) => a - b);

  const range = options?.durationRange;
  if (range === undefined) return null;
  // A range becomes a handful of choices rather than a free number: the picker
  // exists to say what this costs, and a box accepting any number of seconds
  // invites a value nobody meant to buy.
  const mid = Math.round((range.min + range.max) / 2);
  return [...new Set([range.min, mid, range.max])].sort((a, b) => a - b);
}

/**
 * The length to actually ask for, out of what the model allows.
 *
 * Nearest-allowed rather than exact: the caller's number is a preference, and a
 * model that takes 5 or 10 has no way to honour a request for 4. Our own ceiling
 * applies wherever the model leaves room — but when every length it offers is
 * longer than the ceiling, the shortest one it offers wins, because refusing to
 * generate anything at all is not a spend protection anybody asked for.
 */
function nearestAllowed(preferred: number, allowed: number[]): number {
  const affordable = allowed.filter((seconds) => seconds <= MAX_VIDEO_SECONDS);
  const candidates = affordable.length > 0 ? affordable : [Math.min(...allowed)];
  return candidates.reduce((best, seconds) =>
    Math.abs(seconds - preferred) < Math.abs(best - preferred) ? seconds : best,
  );
}

function ratioValue(ratio: string): number | undefined {
  const [width, height] = ratio.split(':').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || height === 0) return undefined;
  return width / height;
}

/**
 * The closest shape the model can produce.
 *
 * Nearest by proportion rather than dropped: asking for `3:2` on a model that
 * offers `16:9`, `9:16` and `1:1` means landscape, and falling back to the
 * model's own default — portrait, on some — lands further from what was asked
 * for than the landscape option sitting right there.
 */
function nearestRatio(requested: string, allowed: string[]): string {
  if (allowed.includes(requested)) return requested;
  const target = ratioValue(requested);
  if (target === undefined) return allowed[0];
  return allowed.reduce((best, ratio) => {
    const value = ratioValue(ratio);
    const bestValue = ratioValue(best);
    if (value === undefined) return best;
    if (bestValue === undefined) return ratio;
    return Math.abs(value - target) < Math.abs(bestValue - target) ? ratio : best;
  }, allowed[0]);
}

/**
 * Settle a request against the model's options, before anything charges for it.
 *
 * Applied at every point a request becomes a provider call, not only where one
 * is built, because the values reach those points from three directions — a
 * model's tool call, a request-log entry written by another process, and a
 * stored request replayed by a retry — and only the last hop is common to all
 * three.
 *
 * With options in hand, every video ends up with a length the model will take
 * and the confirmation can quote. Without them the requested length is passed
 * through bounded, and an absent one is left absent: a number invented on this
 * side would be a guess the provider is free to reject, where the model's own
 * default is at least a length it can produce.
 */
export function settleMediaRequest<
  T extends { capability: MediaCapability; durationSeconds?: number; aspectRatio?: string },
>(request: T, options?: MediaModelOptions): T {
  // A duration on a still image is noise in the record and in the parameters
  // sent to the provider.
  const { durationSeconds: requested, ...rest } = request;
  if (request.capability !== 'text-to-video') return rest as T;

  const allowed = allowedDurations(options);
  const preferred = boundedDuration(requested);
  const durationSeconds =
    allowed === null ? preferred : nearestAllowed(preferred ?? DEFAULT_VIDEO_SECONDS, allowed);

  const ratios = options?.aspectRatios;
  const aspectRatio =
    request.aspectRatio === undefined || ratios === undefined || ratios.length === 0
      ? request.aspectRatio
      : nearestRatio(request.aspectRatio, ratios);

  return {
    ...(rest as T),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
  };
}
