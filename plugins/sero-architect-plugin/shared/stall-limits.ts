/** Internal safety values for the owner session. The user never sets these. */

/** No session event for this long marks an owner turn as stalled and steers it. */
export const OWNER_STALL_WINDOW_MS = 10 * 60_000;
/** Silence after the steer for this long aborts the turn. */
export const OWNER_STALL_GRACE_MS = 5 * 60_000;
/** Turns in a row that end with no declared outcome before the project is held. */
export const SILENT_TURN_LIMIT = 3;
