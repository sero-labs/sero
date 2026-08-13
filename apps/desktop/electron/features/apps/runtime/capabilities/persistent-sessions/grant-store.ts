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
 * the file exists, would leave a subject bound to a nonexistent session and a
 * leaked count that permanently shrinks the cap. So a reservation is written as
 * `pending`, construction runs, and only then is it committed. On startup any
 * pending reservation whose session file is absent is rolled back.
 *
 * **Live vs created counts.** `createdSessions` persists — it is a lifetime cap.
 * The live count never persists: after a restart nothing is live, and a
 * persisted live count would leak on a crash and wedge the grant forever.
 */

import { existsSync } from 'fs';

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
  /** Reservations written before construction and cleared after it. */
  pending: Record<string, { sessionPath: string; startedAt: string }>;
}

export interface GrantStatePersistence {
  read(): Promise<Record<string, StoredGrant> | null>;
  write(grants: Record<string, StoredGrant>): Promise<void>;
}

export type ReserveResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: 'grant-not-found' | 'grant-revoked' | 'live-limit' | 'total-limit' };

export interface GrantStoreDeps {
  persistence: GrantStatePersistence;
  now(): string;
  newId(prefix: string): string;
  /** Injected so restart reconciliation is testable without a real filesystem. */
  sessionFileExists?(sessionPath: string): boolean;
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

  /**
   * Loads grants and rolls back reservations that never completed. MUST run
   * before any plugin runtime starts, so a runtime cannot race the store.
   */
  async initialize(): Promise<void> {
    if (this.loaded) return;
    this.grants = (await this.deps.persistence.read()) ?? {};

    let changed = false;
    for (const grant of Object.values(this.grants)) {
      for (const [reservationId, reservation] of Object.entries(grant.pending ?? {})) {
        // The session file is the proof. Present ⇒ construction completed and
        // the crash happened before the commit, so commit it now. Absent ⇒ the
        // session was never created, so release the count and the binding.
        if (this.fileExists(reservation.sessionPath)) {
          grant.createdSessions += 1;
        } else {
          for (const [subject, boundPath] of Object.entries(grant.sessionPaths)) {
            if (boundPath === reservation.sessionPath) delete grant.sessionPaths[subject];
          }
        }
        delete grant.pending[reservationId];
        changed = true;
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
   * Phase one: re-check status and both caps, bind the subject, and write a
   * pending reservation — all under the serialized lock, before construction.
   */
  async reserve(grantId: string, subject: string, sessionPath: string): Promise<ReserveResult> {
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

      const reservationId = this.deps.newId('resv');
      grant.pending[reservationId] = { sessionPath, startedAt: this.deps.now() };
      // First binding wins and is never rewritten — a subject's session path is
      // immutable, which is what makes `open` safe without a caller path.
      grant.sessionPaths[subject] ??= sessionPath;
      await this.deps.persistence.write(this.grants);
      return { ok: true as const, reservationId };
    });
  }

  /** Phase two: construction succeeded. */
  async commitReservation(grantId: string, reservationId: string, handleId: string): Promise<void> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      if (!grant?.pending[reservationId]) return;
      delete grant.pending[reservationId];
      grant.createdSessions += 1;
      this.trackLive(grantId, handleId);
      await this.deps.persistence.write(this.grants);
    });
  }

  /** Phase two: construction failed. Releases the count and any binding it made. */
  async releaseReservation(grantId: string, reservationId: string, subject: string): Promise<void> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      const reservation = grant?.pending[reservationId];
      if (!grant || !reservation) return;
      delete grant.pending[reservationId];
      if (grant.sessionPaths[subject] === reservation.sessionPath && !this.fileExists(reservation.sessionPath)) {
        delete grant.sessionPaths[subject];
      }
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
