/**
 * What a member is doing RIGHT NOW (architecture.md §12, NFR-016).
 *
 * Shared because the Watch view reads these shapes and the runtime produces
 * them. They describe a TRANSIENT view of the current turn: nothing here is
 * persisted, and none of it is Room state — the record is the Room, and the
 * session file is the history.
 */

export interface LiveToolCall {
  toolName: string;
  summary: string;
  /** The UI computes elapsed time from this; the buffer keeps no timer. */
  startedAt: string;
}

/** What the UI reads on mount, before any event arrives. */
export interface MemberLiveSnapshot {
  roomId: string;
  memberId: string;
  /** Set while a turn is in flight. */
  turnId: string | null;
  /** The current turn's assistant text. Empty while nobody is watching. */
  text: string;
  /** True when the head of this turn's text was dropped at the cap. */
  truncated: boolean;
  toolInFlight: LiveToolCall | null;
  /** How the last completed turn ended. Cleared when the next one starts. */
  lastTurnStatus: 'completed' | 'aborted' | 'error' | null;
  /** Whether text is being retained right now, so the UI never shows a stale line as live. */
  watching: boolean;
  updatedAt: string;
}
