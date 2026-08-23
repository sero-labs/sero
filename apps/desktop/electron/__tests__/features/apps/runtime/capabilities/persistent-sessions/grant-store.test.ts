/**
 * Reservation, cap and restart tests for the grant store (architecture.md
 * §3.5.1, §3.8, §4.2).
 *
 * No path is ever passed to `reserve`. Pi names the session file, so the subject
 * binding is written at COMMIT with the path construction produced — which is
 * why a rollback is just dropping the reservation.
 *
 * Fakes and builders live in ./grant-store.fixtures.
 */

import { describe, expect, it } from 'vitest';
import { GrantStore } from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';

import {
  createFiles,
  createPersistence,
  createStore,
  IMPLEMENTER_FILE,
  issueWithSession,
  NOW,
  ORPHAN_FILE,
  proposal,
  reserved,
  REVIEWER_FILE,
  SESSION_DIR,
  storedGrant,
} from './grant-store.fixtures';

describe('GrantStore — issue', () => {
  it('persists the grant and returns the approved subject policies', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);

    const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());

    expect(grant.appId).toBe('orchestrator');
    expect(grant.sessionDir).toBe(SESSION_DIR);
    expect(grant.approvalId).toBe('approval-1');
    expect(grant.status).toBe('active');
    expect(grant.subjects).toEqual(proposal().subjects);
    expect(grant.maxLiveSessions).toBe(2);
    expect(grant.maxTotalSessions).toBe(4);
    expect(grant.createdSessions).toBe(0);
    expect(grant.sessionPaths).toEqual({});
    expect(grant.pending).toEqual({});
    expect(storedGrant(fake, grant.grantId)).toEqual(grant);
  });
});

describe('GrantStore — deletion', () => {
  it('removes a revoked grant and its complete session directory', async () => {
    const fake = createPersistence();
    const removed: string[] = [];
    const store = new GrantStore({
      persistence: fake.persistence,
      now: () => NOW,
      newId: () => 'grant-1',
      removeSessionDir: (dir) => removed.push(dir),
    });
    const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());
    await store.markRevoked(grant.grantId);

    await store.deleteRevoked(grant.grantId);

    expect(store.get(grant.grantId)).toBeNull();
    expect(removed).toEqual([SESSION_DIR]);
    expect(fake.stored()?.[grant.grantId]).toBeUndefined();
  });
});

describe('GrantStore — reserve', () => {
  it('writes a pending reservation but no binding, because Pi has not named the file yet', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());

    const reservationId = await reserved(store, grant.grantId, 'implementer');

    // Persisted BEFORE construction: a crash here is what the restart cases replay.
    const persisted = storedGrant(fake, grant.grantId);
    expect(persisted.pending[reservationId].subject).toBe('implementer');
    expect(persisted.sessionPaths).toEqual({});
    expect(persisted.createdSessions).toBe(0);
    expect(store.registeredSessionPath(grant.grantId, 'implementer')).toBeNull();
  });

  it('denies an unknown grant', async () => {
    const store = createStore(createPersistence().persistence);

    expect(await store.reserve('grant-missing', 'implementer'))
      .toEqual({ ok: false, reason: 'grant-not-found' });
  });

  it('denies a revoked grant', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());
    await store.markRevoked(grant.grantId);

    expect(await store.reserve(grant.grantId, 'implementer'))
      .toEqual({ ok: false, reason: 'grant-revoked' });
    expect(await store.reserveLive(grant.grantId, 'member-a', 'handle-1'))
      .toEqual({ ok: false, reason: 'grant-revoked' });
  });

  it('counts a pending reservation against the live cap', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 4 }),
    );
    await reserved(store, grant.grantId, 'implementer');

    // Still under construction, so it holds a live slot as firmly as a session does.
    expect(await store.reserve(grant.grantId, 'reviewer'))
      .toEqual({ ok: false, reason: 'live-limit' });
  });

  it('counts a live handle against the live cap', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await issueWithSession(store, 'implementer', IMPLEMENTER_FILE, 'handle-1', {
      maxLiveSessions: 1,
      maxTotalSessions: 4,
    });

    expect(await store.reserve(grant.grantId, 'reviewer'))
      .toEqual({ ok: false, reason: 'live-limit' });
  });

  it('counts a pending reservation against the lifetime cap', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 4, maxTotalSessions: 1 }),
    );
    await reserved(store, grant.grantId, 'implementer');

    expect(await store.reserve(grant.grantId, 'reviewer'))
      .toEqual({ ok: false, reason: 'total-limit' });
  });

  it('keeps the lifetime cap spent after a session is disposed', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await issueWithSession(store, 'implementer', IMPLEMENTER_FILE, 'handle-1', {
      maxLiveSessions: 2,
      maxTotalSessions: 1,
    });
    store.releaseLive(grant.grantId, 'handle-1');

    expect(await store.reserve(grant.grantId, 'reviewer'))
      .toEqual({ ok: false, reason: 'total-limit' });
  });

  it('denies a subject that already holds a binding', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await issueWithSession(store, 'implementer', IMPLEMENTER_FILE, 'handle-1');

    // A bound subject must reopen, never re-create: an immutable binding is what
    // makes a pathless `open` safe.
    expect(await store.reserve(grant.grantId, 'implementer'))
      .toEqual({ ok: false, reason: 'subject-already-bound' });
    expect(store.registeredSessionPath(grant.grantId, 'implementer')).toBe(IMPLEMENTER_FILE);
  });

  it('denies a subject that already has a reservation in flight', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());
    await reserved(store, grant.grantId, 'implementer');

    // One create in flight per subject: two constructions would otherwise race
    // to bind the same subject, and the loser's session would be orphaned.
    expect(await store.reserve(grant.grantId, 'implementer'))
      .toEqual({ ok: false, reason: 'subject-already-bound' });
  });

  it('charges a live slot for reopening an existing session', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 4 }),
    );

    // Two DIFFERENT subjects, so this exercises the live cap rather than the
    // one-session-per-subject rule below.
    expect((await store.reserveLive(grant.grantId, 'member-a', 'handle-1')).ok).toBe(true);
    expect(await store.reserveLive(grant.grantId, 'member-b', 'handle-2'))
      .toEqual({ ok: false, reason: 'live-limit' });

    store.releaseLive(grant.grantId, 'handle-1');
    expect((await store.reserveLive(grant.grantId, 'member-b', 'handle-2')).ok).toBe(true);
  });

  it('refuses a second live session for the same subject', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 4, maxTotalSessions: 4 }),
    );

    expect((await store.reserveLive(grant.grantId, 'member-a', 'handle-1')).ok).toBe(true);
    // Capacity is free — this must fail on identity, not on the cap. Two live
    // sessions over one file would let each overwrite the other's history.
    expect(await store.reserveLive(grant.grantId, 'member-a', 'handle-2'))
      .toEqual({ ok: false, reason: 'subject-already-open' });

    store.releaseLive(grant.grantId, 'handle-1');
    expect((await store.reserveLive(grant.grantId, 'member-a', 'handle-2')).ok).toBe(true);
  });
});

describe('GrantStore — concurrent reserve', () => {
  it('lets exactly one of two concurrent creates through a one-session cap', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 4 }),
    );

    // Fired with no await between them: this is the interleaving a plain
    // check-then-create loses, and the serialized critical section exists for.
    const first = store.reserve(grant.grantId, 'implementer');
    const second = store.reserve(grant.grantId, 'reviewer');
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect([firstResult.ok, secondResult.ok].filter(Boolean)).toHaveLength(1);
    expect(firstResult.ok ? secondResult : firstResult)
      .toEqual({ ok: false, reason: 'live-limit' });
    expect(Object.keys(storedGrant(fake, grant.grantId).pending)).toHaveLength(1);
  });

  it('lets exactly one of two concurrent creates through a one-session lifetime cap', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 4, maxTotalSessions: 1 }),
    );

    const first = store.reserve(grant.grantId, 'implementer');
    const second = store.reserve(grant.grantId, 'reviewer');
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect([firstResult.ok, secondResult.ok].filter(Boolean)).toHaveLength(1);
    expect(firstResult.ok ? secondResult : firstResult)
      .toEqual({ ok: false, reason: 'total-limit' });
  });
});

describe('GrantStore — commit and release', () => {
  it('binds the subject to the path construction produced', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer');

    expect(await store.commitReservation(grant.grantId, reservationId, 'handle-1', IMPLEMENTER_FILE))
      .toEqual({ ok: true });

    const persisted = storedGrant(fake, grant.grantId);
    expect(persisted.pending).toEqual({});
    expect(persisted.sessionPaths).toEqual({ implementer: IMPLEMENTER_FILE });
    expect(persisted.createdSessions).toBe(1);
    expect(store.registeredSessionPath(grant.grantId, 'implementer')).toBe(IMPLEMENTER_FILE);
    expect(store.liveHandles(grant.grantId)).toEqual(['handle-1']);
  });

  it('refuses a commit that lost the race with revocation and demands disposal', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer');
    await store.markRevoked(grant.grantId);

    // Revocation disposed the handles it could see; this session did not exist
    // yet, so the caller must dispose it — the store cannot.
    expect(await store.commitReservation(grant.grantId, reservationId, 'handle-1', IMPLEMENTER_FILE))
      .toEqual({ ok: false, reason: 'grant-revoked', disposeRequired: true });

    const persisted = storedGrant(fake, grant.grantId);
    expect(persisted.pending).toEqual({});
    expect(persisted.sessionPaths).toEqual({});
    expect(persisted.createdSessions).toBe(0);
    expect(store.registeredSessionPath(grant.grantId, 'implementer')).toBeNull();
    expect(store.liveHandles(grant.grantId)).toEqual([]);
  });

  it('drops the reservation and writes no binding when construction fails', async () => {
    const fake = createPersistence();
    const files = createFiles([IMPLEMENTER_FILE]);
    const store = createStore(fake.persistence, files);
    const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer');

    await store.releaseReservation(grant.grantId, reservationId);

    const persisted = storedGrant(fake, grant.grantId);
    expect(persisted.pending).toEqual({});
    expect(persisted.sessionPaths).toEqual({});
    expect(persisted.createdSessions).toBe(0);
    // Any partial file is unreferenced and the startup sweep takes it, so
    // release never deletes a path it was not given.
    expect(files.removed).toEqual([]);
  });
});

describe('GrantStore — revocation', () => {
  it('persists the revoked status before anything is torn down, and is idempotent', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await issueWithSession(store, 'implementer', IMPLEMENTER_FILE, 'handle-1');

    await store.markRevoked(grant.grantId);

    // Write-first: the status is durable while the live session is still there
    // for the caller to dispose. A crash here leaves the grant revoked.
    expect(storedGrant(fake, grant.grantId).status).toBe('revoked');
    expect(storedGrant(fake, grant.grantId).revokedAt).toBe(NOW);
    expect(store.liveHandles(grant.grantId)).toEqual(['handle-1']);

    const writesAfterRevoke = fake.writes();
    await store.markRevoked(grant.grantId);
    expect(fake.writes()).toBe(writesAfterRevoke);

    store.clearLive(grant.grantId);
    expect(store.liveHandles(grant.grantId)).toEqual([]);
  });

  it('survives a restart as revoked', async () => {
    const fake = createPersistence();
    const first = createStore(fake.persistence);
    const grant = await first.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());
    await first.markRevoked(grant.grantId);

    const restarted = createStore(fake.persistence);
    await restarted.initialize();

    expect(restarted.get(grant.grantId)?.status).toBe('revoked');
    expect(await restarted.reserve(grant.grantId, 'implementer'))
      .toEqual({ ok: false, reason: 'grant-revoked' });
  });
});

describe('GrantStore — restart reconciliation', () => {
  // File existence must not change the outcome: construction can create the
  // file and then fail, so a present file is not proof of a usable session.
  for (const present of [false, true]) {
    it(`always rolls back a pending reservation, session file ${present ? 'present' : 'absent'}`, async () => {
      const fake = createPersistence();
      const first = createStore(fake.persistence);
      const grant = await first.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal());
      await reserved(first, grant.grantId, 'implementer');

      const restarted = createStore(fake.persistence, createFiles(present ? [IMPLEMENTER_FILE] : []));
      await restarted.initialize();

      expect(restarted.get(grant.grantId)?.pending).toEqual({});
      expect(restarted.get(grant.grantId)?.createdSessions).toBe(0);
      expect(restarted.get(grant.grantId)?.sessionPaths).toEqual({});
      expect(restarted.registeredSessionPath(grant.grantId, 'implementer')).toBeNull();
      expect(storedGrant(fake, grant.grantId).pending).toEqual({});
      expect(storedGrant(fake, grant.grantId).sessionPaths).toEqual({});
      // The rolled-back caps are free again.
      expect((await restarted.reserve(grant.grantId, 'implementer')).ok).toBe(true);
    });
  }

  it('sweeps an unbound session file and leaves every bound one alone', async () => {
    const fake = createPersistence();
    const first = createStore(fake.persistence);
    const grant = await issueWithSession(first, 'implementer', IMPLEMENTER_FILE, 'handle-1');
    const reviewer = await reserved(first, grant.grantId, 'reviewer');
    await first.commitReservation(grant.grantId, reviewer, 'handle-2', REVIEWER_FILE);

    // ORPHAN_FILE is what a construction that never committed leaves behind.
    const files = createFiles([IMPLEMENTER_FILE, REVIEWER_FILE, ORPHAN_FILE]);
    const restarted = createStore(fake.persistence, files);
    await restarted.initialize();

    expect(files.removed).toEqual([ORPHAN_FILE]);
    expect(restarted.registeredSessionPath(grant.grantId, 'implementer')).toBe(IMPLEMENTER_FILE);
    expect(restarted.registeredSessionPath(grant.grantId, 'reviewer')).toBe(REVIEWER_FILE);
  });

  it('reloads a grant with a zeroed live count and an intact lifetime count', async () => {
    const fake = createPersistence();
    const first = createStore(fake.persistence);
    const grant = await issueWithSession(first, 'implementer', IMPLEMENTER_FILE, 'handle-1', {
      maxLiveSessions: 1,
      maxTotalSessions: 4,
    });
    expect(first.liveHandles(grant.grantId)).toEqual(['handle-1']);

    const restarted = createStore(fake.persistence, createFiles([IMPLEMENTER_FILE]));
    await restarted.initialize();

    // Nothing is live after a restart, so the live cap is free again while the
    // lifetime count — which persists — is unchanged.
    expect(restarted.liveHandles(grant.grantId)).toEqual([]);
    expect(restarted.get(grant.grantId)?.createdSessions).toBe(1);
    expect(restarted.registeredSessionPath(grant.grantId, 'implementer')).toBe(IMPLEMENTER_FILE);
    expect((await restarted.reserveLive(grant.grantId, 'member-a', 'handle-2')).ok).toBe(true);
  });
});
