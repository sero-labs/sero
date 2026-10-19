/**
 * Changing a grant that already exists.
 *
 * An amendment keeps the grant id, the session directory and every existing
 * subject binding, so sessions keep their history. It is never a second grant.
 * The host applies it under the same serialization as every other grant write.
 *
 * A change that stays inside what the user already approved applies with no
 * dialog. A change that would add authority is held until the user approves
 * exactly that addition.
 */

import type { PersistentSessionSubjectPolicy } from './app-runtime-persistent-sessions';

export interface PersistentSessionGrantAmendment {
  grantId: string;
  /**
   * Chosen by the caller and saved before the call. A repeat with the same id
   * returns the stored result and changes nothing, so a caller that lost the
   * answer asks again with the same id.
   */
  amendmentId: string;
  /** The grant revision the caller last saw. Any other current revision is refused as stale. */
  expectedRevision: number;
  /** Subjects to add or change, each with its complete new policy. */
  subjects?: Record<string, PersistentSessionSubjectPolicy>;
  /**
   * Subjects that start no more sessions. Their session files, bindings and
   * lifetime session count are kept.
   */
  retire?: string[];
  /**
   * `hold` (the default) returns `needs-approval` when the change adds
   * authority, and shows nothing. `ask` shows the user the addition and waits
   * for the answer. Use `ask` only in response to a person's action.
   */
  approval?: 'hold' | 'ask';
  /** Shown to the user when approval is asked. Plain language, no secrets. */
  reason: string;
}

/** One piece of authority an amendment would add beyond the current approval. */
export interface PersistentSessionExpansion {
  subject: string;
  field: 'cwd' | 'model' | 'tool' | 'skill' | 'thinking' | 'permission' | 'prompt' | 'subject' | 'sessions';
  value: string;
}

export type PersistentSessionGrantAmendmentResult =
  | {
      status: 'applied';
      amendmentId: string;
      /** The grant revision after the change. */
      revision: number;
      /** The clamped policy now stored for every subject of the grant. */
      subjects: Record<string, PersistentSessionSubjectPolicy>;
      retired: string[];
      /** True when the user approved an addition for this amendment. */
      approvedByUser: boolean;
    }
  | {
      /** The change adds authority and nobody was asked. Nothing changed. */
      status: 'needs-approval';
      amendmentId: string;
      revision: number;
      expansion: PersistentSessionExpansion[];
    }
  | {
      /** The user was asked and said no. Nothing changed. */
      status: 'declined';
      amendmentId: string;
      revision: number;
    }
  | {
      /** The grant moved on since the caller read it. Nothing changed. */
      status: 'stale';
      amendmentId: string;
      revision: number;
    }
  | {
      /** The grant is unknown or revoked, or the change cannot be made at all. Nothing changed. */
      status: 'refused';
      amendmentId: string;
      revision: number | null;
      reason: string;
    };
