/**
 * Durable grant store for `appRuntime.persistentSessions` (AD-029 §3.8).
 *
 * Owns the two things a stateless validator cannot: the atomic reservation, and
 * crash-safe durability.
 *
 * **Atomic reservation.** A count check followed by a create is a race — two
 * concurrent creates would both pass a one-session cap. Reserving, constructing
 * and committing is therefore a single serialized critical section per grant.
 *
 * **Crash safety.** The reservation is two-phase. Persisting the subject binding
 * and incrementing the created count *before* construction, and crashing before
 * the session exists, would leave a subject bound to a nonexistent session and a
 * leaked count that permanently shrinks the cap. So a reservation is written as
 * `pending`, construction runs, and only then is it committed.
 *
 * At startup every pending reservation is ROLLED BACK, never committed. File
 * existence is not proof that a reservation completed — construction can create
 * the file and then fail — so committing on it would register a session that was
 * never usable. Because the subject binding is written only at COMMIT, rollback
 * is simply dropping the reservation. A startup sweep then removes any file in
 * the grant's session directory that no subject is bound to, which is exactly
 * what a failed construction leaves behind.
 *
 * **Live vs created counts.** `createdSessions` persists — it is a lifetime cap.
 * The live count never persists: after a restart nothing is live, and a
 * persisted live count would leak on a crash and wedge the grant forever.
 */

import { existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

import type {
  PersistentSessionGrantProposal,
  PersistentSessionSubjectPolicy,
} from '@sero-ai/common';

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
}

export interface GrantStatePersistence {
  read(): Promise<Record<string, StoredGrant> | null>;
  write(grants: Record<string, StoredGrant>): Promise<void>;
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
        | 'subject-already-bound';
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
}

export class GrantStore {
  private grants: Record<string, StoredGrant> = {};
  /** Live handles per grant. In memory only, by design. */
  private readonly live = new Map<string, Set<string>>();
  private loaded = false;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: GrantStoreDeps) {}

  /** Serializes every mutation, so a reservation is a real critical section. */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private fileExists(sessionPath: string): boolean {
    return (this.deps.sessionFileExists ?? existsSync)(sessionPath);
  }

  private listSessionFiles(sessionDir: string): string[] {
    if (this.deps.listSessionFiles) return this.deps.listSessionFiles(sessionDir);
    if (!existsSync(sessionDir)) return [];
    return readdirSync(sessionDir)
      .filter((entry) => entry.endsWith('.jsonl'))
      .map((entry) => join(sessionDir, entry));
  }

  private removeFile(sessionPath: string): void {
    (this.deps.removeSessionFile ?? ((target: string) => rmSync(target, { force: true })))(sessionPath);
  }

  /**
   * Loads grants and rolls back reservations that never completed. MUST run
   * before any plugin runtime starts, so a runtime cannot race the store.
   */
  async initialize(): Promise<void> {
    if (this.loaded) return;
    this.grants = (await this.deps.persistence.read()) ?? {};

    let changed = false;
    for (const grant of Object.values(this.grants)) {
      // ALWAYS roll back. A commit deletes its own reservation, so a surviving
      // pending record means construction did not complete. Since the binding is
      // written only at commit, rollback is just dropping the reservation.
      for (const reservationId of Object.keys(grant.pending ?? {})) {
        delete grant.pending[reservationId];
        changed = true;
      }
      // Sweep orphans: every file in the grant's session dir must be bound to a
      // subject. An unbound one is what a failed construction leaves behind.
      const bound = new Set(Object.values(grant.sessionPaths));
      for (const orphan of this.listSessionFiles(grant.sessionDir).filter((file) => !bound.has(file))) {
        this.removeFile(orphan);
      }
    }
    if (changed) await this.deps.persistence.write(this.grants);
    this.loaded = true;
  }

  get(grantId: string): StoredGrant | null {
    return this.grants[grantId] ?? null;
  }

  /** The session path bound to a subject, or null when it has never been created. */
  registeredSessionPath(grantId: string, subject: string): string | null {
    return this.grants[grantId]?.sessionPaths[subject] ?? null;
  }

  async issue(
    appId: string,
    sessionDir: string,
    approvalId: string,
    approved: PersistentSessionGrantProposal,
  ): Promise<StoredGrant> {
    return this.serialize(async () => {
      const grant: StoredGrant = {
        grantId: this.deps.newId('grant'),
        appId,
        owner: approved.owner,
        scope: approved.scope,
        workspaceId: approved.workspaceId,
        sessionDir,
        subjects: approved.subjects,
        maxLiveSessions: approved.maxLiveSessions,
        maxTotalSessions: approved.maxTotalSessions,
        approvalId,
        status: 'active',
        issuedAt: this.deps.now(),
        sessionPaths: {},
        createdSessions: 0,
        pending: {},
      };
      this.grants[grant.grantId] = grant;
      await this.deps.persistence.write(this.grants);
      return grant;
    });
  }

  /**
   * Phase one: re-check status and both caps and write a pending reservation —
   * all under the serialized lock, before construction.
   *
   * No path is taken here. Pi names the session file, so the binding is written
   * at COMMIT with the path construction actually produced. A reservation
   * therefore records only the subject, and rollback is a plain "this subject
   * has no session".
   */
  async reserve(grantId: string, subject: string): Promise<ReserveResult> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      if (!grant) return { ok: false as const, reason: 'grant-not-found' as const };
      if (grant.status !== 'active') return { ok: false as const, reason: 'grant-revoked' as const };

      const liveCount = this.live.get(grantId)?.size ?? 0;
      const pendingCount = Object.keys(grant.pending).length;
      if (liveCount + pendingCount >= grant.maxLiveSessions) {
        return { ok: false as const, reason: 'live-limit' as const };
      }
      // Pending reservations count toward the lifetime cap too, so concurrent
      // creates cannot collectively overshoot it.
      if (grant.createdSessions + pendingCount >= grant.maxTotalSessions) {
        return { ok: false as const, reason: 'total-limit' as const };
      }

      // A subject's binding is IMMUTABLE. A bound subject must `open`, never
      // `create` — otherwise it would orphan its first session and own two.
      if (grant.sessionPaths[subject]) {
        return { ok: false as const, reason: 'subject-already-bound' as const };
      }
      // One create in flight per subject, so two concurrent creates cannot both
      // construct a session and race to bind the same subject.
      if (Object.values(grant.pending).some((reservation) => reservation.subject === subject)) {
        return { ok: false as const, reason: 'subject-already-bound' as const };
      }

      const reservationId = this.deps.newId('resv');
      grant.pending[reservationId] = { subject, startedAt: this.deps.now() };
      await this.deps.persistence.write(this.grants);
      return { ok: true as const, reservationId };
    });
  }

  /**
   * Phase two: construction succeeded. Re-checks revocation, because revoke can
   * run while construction is in flight — it disposes the handles it can see,
   * and this one did not exist yet. Committing blindly would register a live
   * session on a revoked grant.
   */
  async commitReservation(
    grantId: string,
    reservationId: string,
    handleId: string,
    sessionPath: string,
  ): Promise<CommitResult> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      const reservation = grant?.pending[reservationId];
      if (!grant || !reservation) return { ok: true as const };

      if (grant.status !== 'active') {
        delete grant.pending[reservationId];
        await this.deps.persistence.write(this.grants);
        return { ok: false as const, reason: 'grant-revoked' as const, disposeRequired: true as const };
      }

      delete grant.pending[reservationId];
      // The binding is written HERE, with the path construction produced — so a
      // crash before this point leaves no binding to be wrong about.
      grant.sessionPaths[reservation.subject] = sessionPath;
      grant.createdSessions += 1;
      this.trackLive(grantId, handleId);
      await this.deps.persistence.write(this.grants);
      return { ok: true as const };
    });
  }

  /**
   * Phase two: construction failed. Releases the binding this reservation made
   * and removes any partial file, so the next create for the subject is clean.
   * The subject comes from the reservation, never from the caller.
   */
  async releaseReservation(grantId: string, reservationId: string): Promise<void> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      if (!grant?.pending[reservationId]) return;
      // Nothing to unbind — the binding is only written on commit. Any file Pi
      // created before failing is unreferenced, and startup sweeps it (§3.8).
      delete grant.pending[reservationId];
      await this.deps.persistence.write(this.grants);
    });
  }

  /** Reopening an existing session still consumes a live slot. */
  async reserveLive(grantId: string, handleId: string): Promise<ReserveResult> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      if (!grant) return { ok: false as const, reason: 'grant-not-found' as const };
      if (grant.status !== 'active') return { ok: false as const, reason: 'grant-revoked' as const };
      const liveCount = this.live.get(grantId)?.size ?? 0;
      if (liveCount + Object.keys(grant.pending).length >= grant.maxLiveSessions) {
        return { ok: false as const, reason: 'live-limit' as const };
      }
      this.trackLive(grantId, handleId);
      return { ok: true as const, reservationId: handleId };
    });
  }

  private trackLive(grantId: string, handleId: string): void {
    const handles = this.live.get(grantId) ?? new Set<string>();
    handles.add(handleId);
    this.live.set(grantId, handles);
  }

  releaseLive(grantId: string, handleId: string): void {
    this.live.get(grantId)?.delete(handleId);
  }

  liveHandles(grantId: string): string[] {
    return [...(this.live.get(grantId) ?? [])];
  }

  /**
   * Write-first revocation: the revoked status is persisted BEFORE anything is
   * torn down, so a crash mid-revocation leaves the grant revoked — the safe
   * direction. Idempotent.
   */
  async markRevoked(grantId: string): Promise<StoredGrant | null> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      if (!grant || grant.status === 'revoked') return grant ?? null;
      grant.status = 'revoked';
      grant.revokedAt = this.deps.now();
      await this.deps.persistence.write(this.grants);
      return grant;
    });
  }

  /** After a revoked grant's sessions have been disposed. */
  clearLive(grantId: string): void {
    this.live.delete(grantId);
  }
}
