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
import {
  DEFAULT_VIDEO_SECONDS,
  MAX_VIDEO_SECONDS,
  boundedDuration,
  isVideoCapability,
} from './media';

/**
 * Every length worth offering for a model, ascending, or null when unknown.
 *
 * The ceiling is applied here, so it holds for the picker and the runtime alike.
 * An empty list is a real answer and not the same as null: it means the model
 * was asked, and the shortest clip it makes is longer than we are willing to buy
 * without being told otherwise.
 */
export function allowedDurations(options: MediaModelOptions | undefined): number[] | null {
  const listed = options?.durationsSeconds;
  if (listed !== undefined && listed.length > 0) return affordable(listed);

  const range = options?.durationRange;
  if (range === undefined) return null;
  // A range becomes a handful of choices rather than a free number: the picker
  // exists to say what this costs, and a box accepting any number of seconds
  // invites a value nobody meant to buy.
  const mid = Math.round((range.min + range.max) / 2);
  return affordable([...new Set([range.min, mid, range.max])]);
}

function affordable(seconds: number[]): number[] {
  return seconds.filter((value) => value <= MAX_VIDEO_SECONDS).toSorted((a, b) => a - b);
}

/**
 * Why this model cannot be asked for a video, or null when it can.
 *
 * A model whose shortest clip is longer than the ceiling is refused rather than
 * quietly bought at its own length. The ceiling is the promise that one press
 * cannot spend more than a known amount, and a promise that yields to whatever
 * the endpoint happens to offer is not one.
 */
export function videoLengthRefusal(
  capability: MediaCapability,
  options: MediaModelOptions | undefined,
): string | null {
  if (!isVideoCapability(capability)) return null;
  if (allowedDurations(options)?.length !== 0) return null;
  return (
    `The video model in Settings makes nothing shorter than ${MAX_VIDEO_SECONDS} seconds, ` +
    'which is longer than this app will buy in one go. Choose a model with shorter clips.'
  );
}

/**
 * The length to actually ask for, out of what the model allows.
 *
 * Nearest-allowed rather than exact: the caller's number is a preference, and a
 * model that takes 5 or 10 has no way to honour a request for 4.
 */
function nearestAllowed(preferred: number, allowed: number[]): number {
  return allowed.reduce((best, seconds) =>
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
  if (!isVideoCapability(request.capability)) return rest as T;

  const allowed = allowedDurations(options);
  const preferred = boundedDuration(requested);
  // An empty list is handled like an unknown one: the callers refuse a model
  // whose clips are all too long before reaching here, and inventing a length it
  // never offered would only be rejected further down.
  const durationSeconds =
    allowed === null || allowed.length === 0
      ? preferred
      : nearestAllowed(preferred ?? DEFAULT_VIDEO_SECONDS, allowed);

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
