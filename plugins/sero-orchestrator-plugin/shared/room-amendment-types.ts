/**
 * What a Room records while a running Room's host grant is being amended.
 *
 * A configuration change or a team change on a running Room is an amendment of
 * the Room's EXISTING grant (never a second grant). It spans two stores — the
 * host's grant and the Room's own record — so each step is saved before the
 * next, and a restart can finish whichever step was not.
 */

import type { PersistentSessionExpansion, PersistentSessionSubjectPolicy } from '@sero-ai/common';

/** `pending` waits for a safe point or the host; `held` needs a person or a retry. */
export type RoomChangeState = 'pending' | 'held' | 'applied' | 'declined';

export type RoomChangeField = 'model' | 'thinking' | 'tools' | 'skills' | 'member';

/** One changed field and the value it is moving to. `member` carries the replacement's name. */
export interface RoomChangeValue {
  field: RoomChangeField;
  value: string | string[];
}

/**
 * The change as a member shows it. Present on a member whose configuration is
 * moving (or just moved), on the member being replaced, and on its replacement.
 */
export interface MemberConfigurationChange {
  revisionId: string;
  state: RoomChangeState;
  /** What is changing. Empty for a member that only joins. */
  fields: RoomChangeValue[];
  /** What the change adds beyond the current approval. Set while `held` for approval. */
  adds: PersistentSessionExpansion[];
  /** Plain-language reason a change is held or declined. */
  reason: string | null;
  /** Grant revision the change produced. Set when `applied`. */
  grantRevision: number | null;
  /** True while the member's work must not start, because its setup is mid-change. */
  workPaused: boolean;
  updatedAt: string;
}

/** The durable intent behind one amendment, kept on the Room revision. */
export interface RoomRevisionAmendment {
  /** The Room revision's command id. The host dedupes on it. */
  amendmentId: string;
  grantId: string;
  /** The grant revision the Room last saw. Rebased only before the host has been asked. */
  expectedRevision: number;
  /** True once the host may have seen the request, so the revision must not be rebased. */
  attempted: boolean;
  /** `intent`: Room not yet saved. `configured`: saved, the session not yet reopened. */
  phase: 'intent' | 'configured';
  state: RoomChangeState;
  /** Policies sent to the host, saved so a retry sends exactly the same request. */
  subjects: Record<string, PersistentSessionSubjectPolicy>;
  retire: string[];
  /** Existing members whose live session this change affects. */
  memberIds: string[];
  adds: PersistentSessionExpansion[];
  reason: string | null;
  grantRevision: number | null;
}
