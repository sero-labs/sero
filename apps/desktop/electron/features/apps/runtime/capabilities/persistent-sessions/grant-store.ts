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

import type { PersistentSessionGrantProposal } from '@sero-ai/common';

import { retiredRefusal, type AmendTx } from './grant-amendments';
import {
  isInsideDir,
  type CommitResult,
  type GrantStoreDeps,
  type ReserveResult,
  type StoredDelegationPolicy,
  type StoredGrant,
} from './grant-store-types';

export type {
  CommitResult,
  GrantStatePersistence,
  GrantStoreDeps,
  ReserveResult,
  StoredDelegationPolicy,
  StoredGrant,
} from './grant-store-types';

export class GrantStore {
  private grants: Record<string, StoredGrant> = {};
  private policies: Record<string, StoredDelegationPolicy> = {};
  private readonly revocationListeners = new Set<(grantId: string) => void>();
  /** Live handles per grant. In memory only, by design. */
  private readonly live = new Map<string, Set<string>>();
  /** Subjects with a live session, so a second concurrent open is refused. */
  private readonly openSubjects = new Map<string, Set<string>>();
  private readonly subjectByHandle = new Map<string, string>();
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
    this.policies = (await this.deps.persistence.readPolicies?.()) ?? {};

    let changed = false;
    for (const grant of Object.values(this.grants)) {
      // A policy is revoked write-first, before its grants. A crash between the
      // two leaves an active grant under a revoked policy, which ends here.
      if (grant.delegatedBy && grant.status === 'active' && this.policies[grant.delegatedBy.policyId]?.status !== 'active') {
        grant.status = 'revoked';
        grant.revokedAt = this.deps.now();
        changed = true;
      }
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

  /**
   * `sessionDirFor` takes the grant id rather than a ready-made path, because a
   * directory derived from caller-controlled fields could COLLIDE with another
   * grant's — and the startup sweep, which removes files no subject is bound
   * to, would then delete the other grant's sessions.
   */
  async issue(
    appId: string,
    sessionDirFor: (grantId: string) => string,
    approvalId: string,
    approved: PersistentSessionGrantProposal,
    delegatedByPolicyId?: string,
  ): Promise<StoredGrant> {
    return this.serialize(async () => {
      // Checked under the lock: a policy revoked while the proposal was being
      // clamped must not issue one more grant.
      const policy = delegatedByPolicyId ? this.policies[delegatedByPolicyId] : undefined;
      if (delegatedByPolicyId && policy?.status !== 'active') throw new Error('delegation-policy-revoked');
      const grantId = this.deps.newId('grant');
      const grant: StoredGrant = {
        grantId,
        appId,
        owner: approved.owner,
        scope: approved.scope,
        workspaceId: approved.workspaceId,
        sessionDir: sessionDirFor(grantId),
        // DEEP COPY. The caller holds a reference to the object it proposed; if
        // the store kept that same object the caller could push a tool or model
        // into a policy after approval and later validation would read the
        // mutation as if the user had approved it.
        subjects: structuredClone(approved.subjects),
        maxLiveSessions: approved.maxLiveSessions,
        maxTotalSessions: approved.maxTotalSessions,
        approvalId,
        status: 'active',
        issuedAt: this.deps.now(),
        sessionPaths: {},
        createdSessions: 0,
        pending: {},
        ...(policy ? { delegatedBy: { policyId: policy.policyId, approvalId: policy.approvalId } } : {}),
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

      if (retiredRefusal(grant, subject)) return { ok: false as const, reason: 'subject-retired' as const };
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

      const policyRefusal = this.policyRefusal(grant);
      if (policyRefusal) return { ok: false as const, reason: policyRefusal };

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

      // Verify the path construction produced before trusting it. Pi is given
      // the grant's directory, so this should always hold — but a binding is
      // permanent, and a wrong one would let `open` reach outside the grant
      // forever.
      if (!isInsideDir(sessionPath, grant.sessionDir)) {
        delete grant.pending[reservationId];
        await this.deps.persistence.write(this.grants);
        return { ok: false as const, reason: 'grant-revoked' as const, disposeRequired: true as const };
      }
      // One path per subject, globally within the grant: two subjects sharing a
      // file would alias each other's session.
      const pathOwner = Object.entries(grant.sessionPaths)
        .find(([subject, bound]) => bound === sessionPath && subject !== reservation.subject);
      if (pathOwner) {
        delete grant.pending[reservationId];
        await this.deps.persistence.write(this.grants);
        return { ok: false as const, reason: 'grant-revoked' as const, disposeRequired: true as const };
      }

      delete grant.pending[reservationId];
      // The binding is written HERE, with the path construction produced — so a
      // crash before this point leaves no binding to be wrong about.
      grant.sessionPaths[reservation.subject] = sessionPath;
      grant.createdSessions += 1;
      this.trackLive(grantId, handleId, reservation.subject);
      await this.deps.persistence.write(this.grants);
      const policy = grant.delegatedBy ? this.policies[grant.delegatedBy.policyId] : undefined;
      if (policy) {
        policy.createdSessions += 1;
        await this.deps.persistence.writePolicies?.(this.policies);
      }
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

  /**
   * Reopening an existing session still consumes a live slot, and the claim is
   * SUBJECT-AWARE: two concurrent opens for one subject would otherwise both
   * pass a bare count check and construct two live sessions over one file.
   */
  async reserveLive(grantId: string, subject: string, handleId: string): Promise<ReserveResult> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      if (!grant) return { ok: false as const, reason: 'grant-not-found' as const };
      if (grant.status !== 'active') return { ok: false as const, reason: 'grant-revoked' as const };
      if (this.openSubjects.get(grantId)?.has(subject)) {
        return { ok: false as const, reason: 'subject-already-open' as const };
      }
      if (retiredRefusal(grant, subject)) return { ok: false as const, reason: 'subject-retired' as const };
      const liveCount = this.live.get(grantId)?.size ?? 0;
      if (liveCount + Object.keys(grant.pending).length >= grant.maxLiveSessions) {
        return { ok: false as const, reason: 'live-limit' as const };
      }
      const policyRefusal = this.policyRefusal(grant, 'live');
      if (policyRefusal) return { ok: false as const, reason: policyRefusal };
      this.trackLive(grantId, handleId, subject);
      return { ok: true as const, reservationId: handleId };
    });
  }

  /**
   * Phase two for `open`, and the mirror of `commitReservation`.
   *
   * Revocation disposes the sessions it can see, then clears the live set. A
   * session still being constructed is in neither place — it is not registered
   * yet, so revocation cannot dispose it, and adding it afterwards would leave a
   * live session under a revoked grant that nothing will ever close. A handle
   * that is no longer tracked here means revocation won, and the caller must
   * dispose what it built.
   */
  async commitLive(grantId: string, handleId: string): Promise<CommitResult> {
    return this.serialize(async () => {
      const grant = this.grants[grantId];
      if (grant?.status === 'active' && this.live.get(grantId)?.has(handleId)) return { ok: true as const };
      this.releaseLive(grantId, handleId);
      return { ok: false as const, reason: 'grant-revoked' as const, disposeRequired: true as const };
    });
  }

  private trackLive(grantId: string, handleId: string, subject: string): void {
    const handles = this.live.get(grantId) ?? new Set<string>();
    handles.add(handleId);
    this.live.set(grantId, handles);

    const subjects = this.openSubjects.get(grantId) ?? new Set<string>();
    subjects.add(subject);
    this.openSubjects.set(grantId, subjects);
    this.subjectByHandle.set(handleId, subject);
  }

  releaseLive(grantId: string, handleId: string): void {
    this.live.get(grantId)?.delete(handleId);
    const subject = this.subjectByHandle.get(handleId);
    if (subject) {
      this.openSubjects.get(grantId)?.delete(subject);
      this.subjectByHandle.delete(handleId);
    }
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

  /** Runs an amendment in the same serialized section as every other grant write. */
  amend<T>(task: (tx: AmendTx) => Promise<T>): Promise<T> {
    return this.serialize(() => task({
      grant: (id) => this.grants[id] ?? null,
      policy: (id) => this.policies[id] ?? null,
      persist: () => this.deps.persistence.write(this.grants),
    }));
  }

  getPolicy(policyId: string): StoredDelegationPolicy | null {
    return this.policies[policyId] ?? null;
  }

  /** Stores the clamped delegation of an approved proposal as an immutable policy. */
  async issuePolicy(appId: string, approvalId: string, approved: PersistentSessionGrantProposal): Promise<StoredDelegationPolicy | null> {
    const delegation = approved.delegation;
    if (!delegation) return null;
    return this.serialize(async () => {
      const policy: StoredDelegationPolicy = {
        policyId: this.deps.newId('policy'),
        appId,
        owner: approved.owner,
        scope: approved.scope,
        workspaceId: approved.workspaceId,
        delegateAppIds: [...delegation.delegateAppIds],
        // DEEP COPY, for the reason `issue` gives.
        roles: structuredClone(delegation.roles),
        maxLiveSessions: delegation.maxLiveSessions,
        maxTotalSessions: delegation.maxTotalSessions,
        approvalId,
        status: 'active',
        issuedAt: this.deps.now(),
        createdSessions: 0,
      };
      this.policies[policy.policyId] = policy;
      await this.deps.persistence.writePolicies?.(this.policies);
      return policy;
    });
  }

  /**
   * Why a policy-issued grant may not take one more session, or null. The
   * bounds are the policy's, counted across every grant issued under it, so two
   * Rooms that start together cannot each take the whole allowance.
   */
  private policyRefusal(grant: StoredGrant, only?: 'live'): 'grant-revoked' | 'live-limit' | 'total-limit' | null {
    if (!grant.delegatedBy) return null;
    const policy = this.policies[grant.delegatedBy.policyId];
    if (policy?.status !== 'active') return 'grant-revoked';
    const siblings = Object.values(this.grants).filter((other) => other.delegatedBy?.policyId === policy.policyId);
    const pending = siblings.reduce((sum, other) => sum + Object.keys(other.pending).length, 0);
    const live = siblings.reduce((sum, other) => sum + (this.live.get(other.grantId)?.size ?? 0), 0);
    if (live + pending >= policy.maxLiveSessions) return 'live-limit';
    if (only !== 'live' && policy.createdSessions + pending >= policy.maxTotalSessions) return 'total-limit';
    return null;
  }

  /**
   * Revokes a policy and every grant issued under it. Write-first, policy
   * before grants: a crash between the two leaves grants that `initialize`
   * revokes and that `policyRefusal` already denies. Returns the grants this
   * call revoked, so each host can tear down the sessions it holds.
   */
  async markPolicyRevoked(policyId: string): Promise<string[]> {
    return this.serialize(async () => {
      const policy = this.policies[policyId];
      if (!policy) return [];
      if (policy.status !== 'revoked') {
        policy.status = 'revoked';
        policy.revokedAt = this.deps.now();
        await this.deps.persistence.writePolicies?.(this.policies);
      }
      const revoked = Object.values(this.grants)
        .filter((grant) => grant.delegatedBy?.policyId === policyId && grant.status === 'active');
      for (const grant of revoked) {
        grant.status = 'revoked';
        grant.revokedAt = this.deps.now();
      }
      if (revoked.length > 0) await this.deps.persistence.write(this.grants);
      return revoked.map((grant) => grant.grantId);
    });
  }

  /** A host instance listens so it can tear down sessions of a grant another instance revoked. */
  onGrantRevoked(listener: (grantId: string) => void): () => void {
    this.revocationListeners.add(listener);
    return () => { this.revocationListeners.delete(listener); };
  }

  notifyRevoked(grantId: string): void {
    for (const listener of this.revocationListeners) listener(grantId);
  }

  /** Deletes only revoked authority. Revocation must be durable before retention cleanup. */
  async deleteRevoked(grantId: string): Promise<void> {
    await this.serialize(async () => {
      const grant = this.grants[grantId];
      if (!grant) return;
      if (grant.status !== 'revoked') throw new Error(`grant ${grantId} must be revoked before deletion`);
      (this.deps.removeSessionDir ?? ((target: string) => rmSync(target, { recursive: true, force: true })))(grant.sessionDir);
      delete this.grants[grantId];
      await this.deps.persistence.write(this.grants);
    });
  }

  /** After a revoked grant's sessions have been disposed. */
  clearLive(grantId: string): void {
    for (const handleId of this.live.get(grantId) ?? []) this.subjectByHandle.delete(handleId);
    this.live.delete(grantId);
    this.openSubjects.delete(grantId);
  }
}
