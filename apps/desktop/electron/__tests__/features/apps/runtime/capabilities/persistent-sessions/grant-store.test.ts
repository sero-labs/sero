/**
 * Reservation, cap and restart tests for the grant store (architecture.md
 * §3.5.1, §3.8, §4.2).
 *
 * Persistence is a fake that clones on read and write, so the store never keeps
 * a live reference into "disk" — that is what makes the restart cases real
 * restarts rather than the same object under a new name. The session directory
 * is a fake listing for the same reason: reconciliation must be provable
 * without timing a real crash.
 *
 * No path is ever passed to `reserve`. Pi names the session file, so the
 * subject binding is written at COMMIT with the path construction produced.
 */

import { describe, expect, it } from 'vitest';

import type {
  PersistentSessionGrantProposal,
  PersistentSessionSubjectPolicy,
} from '@sero-ai/common';
import {
  GrantStore,
  type GrantStatePersistence,
  type StoredGrant,
} from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';

const SESSION_DIR = '/sessions/rooms/room-1';
const IMPLEMENTER_FILE = `${SESSION_DIR}/session-implementer.jsonl`;
const REVIEWER_FILE = `${SESSION_DIR}/session-reviewer.jsonl`;
const ORPHAN_FILE = `${SESSION_DIR}/session-orphan.jsonl`;

interface FakePersistence {
  persistence: GrantStatePersistence;
  /** What survives a restart. */
  stored(): Record<string, StoredGrant> | null;
  writes(): number;
}

function createPersistence(): FakePersistence {
  let snapshot: Record<string, StoredGrant> | null = null;
  let writes = 0;
  const clone = (grants: Record<string, StoredGrant>): Record<string, StoredGrant> =>
    JSON.parse(JSON.stringify(grants)) as Record<string, StoredGrant>;

  return {
    persistence: {
      read: async () => (snapshot === null ? null : clone(snapshot)),
      write: async (grants) => {
        snapshot = clone(grants);
        writes += 1;
      },
    },
    stored: () => snapshot,
    writes: () => writes,
  };
}

interface FakeFiles {
  exists(sessionPath: string): boolean;
  list(sessionDir: string): string[];
  remove(sessionPath: string): void;
  removed: string[];
}

/** A fake session directory. Every entry is treated as living in SESSION_DIR. */
function createFiles(present: string[] = []): FakeFiles {
  const files = new Set(present);
  const removed: string[] = [];
  return {
    exists: (sessionPath) => files.has(sessionPath),
    list: (sessionDir) => [...files].filter((file) => file.startsWith(`${sessionDir}/`)),
    remove: (sessionPath) => {
      files.delete(sessionPath);
      removed.push(sessionPath);
    },
    removed,
  };
}

function createStore(persistence: GrantStatePersistence, files: FakeFiles = createFiles()): GrantStore {
  let counter = 0;
  return new GrantStore({
    persistence,
    now: () => '2026-08-14T00:00:00.000Z',
    newId: (prefix) => `${prefix}-${(counter += 1)}`,
    sessionFileExists: files.exists,
    listSessionFiles: files.list,
    removeSessionFile: files.remove,
  });
}

function policy(): PersistentSessionSubjectPolicy {
  return {
    allowedCwds: ['/repo'],
    allowedModels: ['anthropic/claude-opus-5'],
    allowedTools: ['read'],
    allowedSkills: [],
    allowedThinkingLevels: ['low'],
    permissionProfile: { filesystem: 'read', commands: 'none', network: 'none', vcs: 'read' },
    maxSystemPromptAdditionBytes: 100,
  };
}

function proposal(overrides: Partial<PersistentSessionGrantProposal> = {}): PersistentSessionGrantProposal {
  return {
    owner: 'room-1',
    scope: 'members',
    workspaceId: 'ws-1',
    subjects: { implementer: policy(), reviewer: policy() },
    maxLiveSessions: 2,
    maxTotalSessions: 4,
    reason: 'Run a Room team',
    ...overrides,
  };
}

function storedGrant(fake: FakePersistence, grantId: string): StoredGrant {
  const grant = fake.stored()?.[grantId];
  if (!grant) throw new Error(`grant ${grantId} was never persisted`);
  return grant;
}

async function reserved(store: GrantStore, grantId: string, subject: string): Promise<string> {
  const result = await store.reserve(grantId, subject);
  if (!result.ok) throw new Error(`expected a reservation, got ${result.reason}`);
  return result.reservationId;
}

describe('GrantStore — issue', () => {
  it('persists the grant and returns the approved subject policies', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);

    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());

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

describe('GrantStore — reserve', () => {
  it('writes a pending reservation but no binding, because Pi has not named the file yet', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());

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
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    await store.markRevoked(grant.grantId);

    expect(await store.reserve(grant.grantId, 'implementer'))
      .toEqual({ ok: false, reason: 'grant-revoked' });
    expect(await store.reserveLive(grant.grantId, 'handle-1'))
      .toEqual({ ok: false, reason: 'grant-revoked' });
  });

  it('counts a pending reservation against the live cap', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
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
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 4 }),
    );
    const reservationId = await reserved(store, grant.grantId, 'implementer');
    await store.commitReservation(grant.grantId, reservationId, 'handle-1', IMPLEMENTER_FILE);

    expect(await store.reserve(grant.grantId, 'reviewer'))
      .toEqual({ ok: false, reason: 'live-limit' });
  });

  it('counts a pending reservation against the lifetime cap', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 4, maxTotalSessions: 1 }),
    );
    await reserved(store, grant.grantId, 'implementer');

    expect(await store.reserve(grant.grantId, 'reviewer'))
      .toEqual({ ok: false, reason: 'total-limit' });
  });

  it('keeps the lifetime cap spent after a session is disposed', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 2, maxTotalSessions: 1 }),
    );
    const reservationId = await reserved(store, grant.grantId, 'implementer');
    await store.commitReservation(grant.grantId, reservationId, 'handle-1', IMPLEMENTER_FILE);
    store.releaseLive(grant.grantId, 'handle-1');

    expect(await store.reserve(grant.grantId, 'reviewer'))
      .toEqual({ ok: false, reason: 'total-limit' });
  });

  it('denies a subject that already holds a binding', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer');
    await store.commitReservation(grant.grantId, reservationId, 'handle-1', IMPLEMENTER_FILE);

    // A bound subject must reopen, never re-create: an immutable binding is what
    // makes a pathless `open` safe.
    expect(await store.reserve(grant.grantId, 'implementer'))
      .toEqual({ ok: false, reason: 'subject-already-bound' });
    expect(store.registeredSessionPath(grant.grantId, 'implementer')).toBe(IMPLEMENTER_FILE);
  });

  it('denies a subject that already has a reservation in flight', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    await reserved(store, grant.grantId, 'implementer');

    // One create in flight per subject: two constructions would otherwise race
    // to bind the same subject, and the loser's session would be orphaned.
    expect(await store.reserve(grant.grantId, 'implementer'))
      .toEqual({ ok: false, reason: 'subject-already-bound' });
  });

  it('charges a live slot for reopening an existing session', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 4 }),
    );

    expect((await store.reserveLive(grant.grantId, 'handle-1')).ok).toBe(true);
    expect(await store.reserveLive(grant.grantId, 'handle-2'))
      .toEqual({ ok: false, reason: 'live-limit' });

    store.releaseLive(grant.grantId, 'handle-1');
    expect((await store.reserveLive(grant.grantId, 'handle-2')).ok).toBe(true);
  });
});

describe('GrantStore — concurrent reserve', () => {
  it('lets exactly one of two concurrent creates through a one-session cap', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
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
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
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
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
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
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
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
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
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
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer');
    await store.commitReservation(grant.grantId, reservationId, 'handle-1', IMPLEMENTER_FILE);

    await store.markRevoked(grant.grantId);

    // Write-first: the status is durable while the live session is still there
    // for the caller to dispose. A crash here leaves the grant revoked.
    expect(storedGrant(fake, grant.grantId).status).toBe('revoked');
    expect(storedGrant(fake, grant.grantId).revokedAt).toBe('2026-08-14T00:00:00.000Z');
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
    const grant = await first.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
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
      const grant = await first.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
      await reserved(first, grant.grantId, 'implementer');

      const files = createFiles(present ? [IMPLEMENTER_FILE] : []);
      const restarted = createStore(fake.persistence, files);
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
    const grant = await first.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    const implementer = await reserved(first, grant.grantId, 'implementer');
    await first.commitReservation(grant.grantId, implementer, 'handle-1', IMPLEMENTER_FILE);
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
    const grant = await first.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 4 }),
    );
    const reservationId = await reserved(first, grant.grantId, 'implementer');
    await first.commitReservation(grant.grantId, reservationId, 'handle-1', IMPLEMENTER_FILE);
    expect(first.liveHandles(grant.grantId)).toEqual(['handle-1']);

    const restarted = createStore(fake.persistence, createFiles([IMPLEMENTER_FILE]));
    await restarted.initialize();

    // Nothing is live after a restart, so the live cap is free again while the
    // lifetime count — which persists — is unchanged.
    expect(restarted.liveHandles(grant.grantId)).toEqual([]);
    expect(restarted.get(grant.grantId)?.createdSessions).toBe(1);
    expect(restarted.registeredSessionPath(grant.grantId, 'implementer')).toBe(IMPLEMENTER_FILE);
    expect((await restarted.reserveLive(grant.grantId, 'handle-2')).ok).toBe(true);
  });
});
