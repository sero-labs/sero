/**
 * The stored shapes and results of the grant store, split from grant-store.ts
 * to keep each file within the 500-line limit.
 */

import { realpathSync } from 'fs';
import { relative, resolve } from 'path';

/** Containment after symlink resolution, compared segment-wise. */
export function isInsideDir(child: string, parent: string): boolean {
  const canonical = (target: string) => {
    try {
      return realpathSync(target);
    } catch {
      return resolve(target);
    }
  };
  const rel = relative(canonical(parent), canonical(child));
  return rel !== '' && !rel.startsWith('..') && !rel.includes('..');
}

import type { PersistentSessionGrantAmendmentResult, PersistentSessionSubjectPolicy } from '@sero-ai/common';

export interface StoredGrant {
  grantId: string;
  appId: string;
  owner: string;
  scope: string;
  workspaceId: string;
  /** Absolute directory every session file must resolve inside. */
  sessionDir: string;
  subjects: Record<string, PersistentSessionSubjectPolicy>;
  maxLiveSessions: number;
  maxTotalSessions: number;
  /** Host-owned reference to the approval this grant was issued from. */
  approvalId: string;
  status: 'active' | 'revoked';
  issuedAt: string;
  revokedAt?: string;
  /** Immutable subject → session path bindings, written at create. */
  sessionPaths: Record<string, string>;
  /** Lifetime count of successfully created sessions. Persists. */
  createdSessions: number;
  /**
   * Reservations written before construction and cleared after it. The subject
   * is recorded so a rollback knows exactly which binding it created — without
   * it, reconciliation has to guess by matching paths.
   */
  pending: Record<string, { subject: string; startedAt: string }>;
  /**
   * The delegation policy this grant was issued under, and the approval that
   * policy came from. Absent on a grant the user approved directly, which never
   * gains delegation authority.
   */
  delegatedBy?: { policyId: string; approvalId: string };
  /** Applied amendments. Absent means 0. */
  revision?: number;
  /** Subjects that start no more sessions. Their files, bindings and lifetime count stay. */
  retired?: string[];
  /** Applied and declined amendment results by id, so a repeat returns the stored answer. */
  amendments?: Record<string, PersistentSessionGrantAmendmentResult>;
}

/**
 * One approved, immutable delegation policy. The host checks linked grant
 * proposals against this record, never against anything a plugin presents.
 */
export interface StoredDelegationPolicy {
  policyId: string;
  /** The app the policy was issued to. Only it may revoke the policy. */
  appId: string;
  owner: string;
  scope: string;
  workspaceId: string;
  delegateAppIds: string[];
  roles: Record<string, PersistentSessionSubjectPolicy>;
  /** Across every grant issued under the policy. */
  maxLiveSessions: number;
  maxTotalSessions: number;
  approvalId: string;
  status: 'active' | 'revoked';
  issuedAt: string;
  revokedAt?: string;
  /** Lifetime count of sessions created under the policy. Persists, and outlives a deleted grant. */
  createdSessions: number;
}

export interface GrantStatePersistence {
  read(): Promise<Record<string, StoredGrant> | null>;
  write(grants: Record<string, StoredGrant>): Promise<void>;
  /** Delegation policies. Absent in a store that never issues one. */
  readPolicies?(): Promise<Record<string, StoredDelegationPolicy> | null>;
  writePolicies?(policies: Record<string, StoredDelegationPolicy>): Promise<void>;
}

export type ReserveResult =
  | { ok: true; reservationId: string }
  | {
      ok: false;
      reason:
        | 'grant-not-found'
        | 'grant-revoked'
        | 'live-limit'
        | 'total-limit'
        | 'subject-already-bound'
        | 'subject-already-open'
        | 'subject-retired';
    };

/**
 * A commit can lose a race with revocation. When it does the session was
 * already constructed, so the caller MUST dispose it — the store cannot, and a
 * silently kept session would outlive the grant that authorised it.
 */
export type CommitResult = { ok: true } | { ok: false; reason: 'grant-revoked'; disposeRequired: true };

export interface GrantStoreDeps {
  persistence: GrantStatePersistence;
  now(): string;
  newId(prefix: string): string;
  /** Injected so restart reconciliation is testable without a real filesystem. */
  sessionFileExists?(sessionPath: string): boolean;
  /** Removes an orphaned session file left by a construction that never committed. */
  removeSessionFile?(sessionPath: string): void;
  /** Session files currently in a grant's directory. Injected for tests. */
  listSessionFiles?(sessionDir: string): string[];
  /** Removes a revoked grant's complete session directory. */
  removeSessionDir?(sessionDir: string): void;
}
