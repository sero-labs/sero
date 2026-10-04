// The figures the "Add time" dialog works from, and the smallest total it accepts.

export const MINUTE_MS = 60_000;

/** What the dialog needs to know about the Room's time and spend. */
export interface RoomTimeLimit {
  title: string;
  /** Active time used: the figure the header and the limit use. */
  usedMs: number;
  limitMs: number;
  maxCostUsd: number;
}

/** The new total must be more than this many minutes: the limit, or the time used if that is more. */
export function minutesToExceed(time: Pick<RoomTimeLimit, 'usedMs' | 'limitMs'>): number {
  return Math.max(Math.ceil(time.limitMs / MINUTE_MS), Math.floor(time.usedMs / MINUTE_MS));
}
