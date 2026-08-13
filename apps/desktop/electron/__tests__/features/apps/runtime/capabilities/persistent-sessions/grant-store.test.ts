/**
 * Reservation, cap and restart tests for the grant store (architecture.md
 * §3.5.1, §3.8, §4.2).
 *
 * Persistence is a fake that clones on read and write, so the store never keeps
 * a live reference into "disk" — that is what makes the restart cases real
 * restarts rather than the same object under a new name. Session files are a
 * fake set for the same reason: reconciliation must be provable without timing
 * a real crash.
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
const IMPLEMENTER_FILE = `${SESSION_DIR}/implementer.jsonl`;
const REVIEWER_FILE = `${SESSION_DIR}/reviewer.jsonl`;

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
  remove(sessionPath: string): void;
  removed: string[];
}

function createFiles(present: string[] = []): FakeFiles {
  const files = new Set(present);
  const removed: string[] = [];
  return {
    exists: (sessionPath) => files.has(sessionPath),
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

async function reserved(store: GrantStore, grantId: string, subject: string, sessionPath: string): Promise<string> {
  const result = await store.reserve(grantId, subject, sessionPath);
  if (!result.ok) throw new Error(`expected a reservation, got ${result.reason}`);
  return result.reservationId;
}

describe('GrantStore — reservation', () => {
  it('issues a grant with zeroed counters and persists it', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);

    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());

    expect(grant.status).toBe('active');
    expect(grant.createdSessions).toBe(0);
    expect(grant.sessionPaths).toEqual({});
    expect(storedGrant(fake, grant.grantId).approvalId).toBe('approval-1');
  });

  it('writes a pending reservation and binds the subject before construction', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());

    const reservationId = await reserved(store, grant.grantId, 'implementer', IMPLEMENTER_FILE);

    // Persisted BEFORE construction: a crash here is what the restart cases replay.
    const persisted = storedGrant(fake, grant.grantId);
    expect(persisted.pending[reservationId].subject).toBe('implementer');
    expect(persisted.sessionPaths.implementer).toBe(IMPLEMENTER_FILE);
    expect(persisted.createdSessions).toBe(0);
  });

  it('commits a reservation into the lifetime count and a live handle', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer', IMPLEMENTER_FILE);

    expect(await store.commitReservation(grant.grantId, reservationId, 'handle-1')).toEqual({ ok: true });

    const persisted = storedGrant(fake, grant.grantId);
    expect(persisted.pending).toEqual({});
    expect(persisted.createdSessions).toBe(1);
    expect(store.liveHandles(grant.grantId)).toEqual(['handle-1']);
  });

  it('releases the count, the binding and the partial file when construction fails', async () => {
    const fake = createPersistence();
    const files = createFiles([IMPLEMENTER_FILE]);
    const store = createStore(fake.persistence, files);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer', IMPLEMENTER_FILE);

    await store.releaseReservation(grant.grantId, reservationId);

    const persisted = storedGrant(fake, grant.grantId);
    expect(persisted.pending).toEqual({});
    expect(persisted.sessionPaths).toEqual({});
    expect(persisted.createdSessions).toBe(0);
    expect(files.removed).toEqual([IMPLEMENTER_FILE]);
  });

  it('denies a second create for a subject that is already bound', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer', IMPLEMENTER_FILE);
    await store.commitReservation(grant.grantId, reservationId, 'handle-1');

    // A bound subject must reopen, never re-create: an immutable binding is what
    // makes a pathless `open` safe.
    expect(await store.reserve(grant.grantId, 'implementer', `${SESSION_DIR}/other.jsonl`))
      .toEqual({ ok: false, reason: 'subject-already-bound' });
    expect(store.registeredSessionPath(grant.grantId, 'implementer')).toBe(IMPLEMENTER_FILE);
  });

  it('denies two subjects reserving the same session path', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    await reserved(store, grant.grantId, 'implementer', IMPLEMENTER_FILE);

    expect(await store.reserve(grant.grantId, 'reviewer', IMPLEMENTER_FILE))
      .toEqual({ ok: false, reason: 'path-already-bound' });
  });

  it('denies a reservation against an unknown grant', async () => {
    const store = createStore(createPersistence().persistence);
    expect(await store.reserve('grant-missing', 'implementer', IMPLEMENTER_FILE))
      .toEqual({ ok: false, reason: 'grant-not-found' });
  });
});

describe('GrantStore — caps', () => {
  it('lets exactly one of two concurrent creates through a one-session cap', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 4 }),
    );

    // Fired without awaiting between them: a check-then-create would pass both.
    const [first, second] = await Promise.all([
      store.reserve(grant.grantId, 'implementer', IMPLEMENTER_FILE),
      store.reserve(grant.grantId, 'reviewer', REVIEWER_FILE),
    ]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(first.ok ? second : first).toEqual({ ok: false, reason: 'live-limit' });
    expect(Object.keys(storedGrant(fake, grant.grantId).pending)).toHaveLength(1);
  });

  it('counts pending reservations against the lifetime cap', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 4, maxTotalSessions: 1 }),
    );

    const [first, second] = await Promise.all([
      store.reserve(grant.grantId, 'implementer', IMPLEMENTER_FILE),
      store.reserve(grant.grantId, 'reviewer', REVIEWER_FILE),
    ]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(first.ok ? second : first).toEqual({ ok: false, reason: 'total-limit' });
  });

  it('keeps the lifetime cap spent after a session is disposed', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 2, maxTotalSessions: 1 }),
    );
    const reservationId = await reserved(store, grant.grantId, 'implementer', IMPLEMENTER_FILE);
    await store.commitReservation(grant.grantId, reservationId, 'handle-1');
    store.releaseLive(grant.grantId, 'handle-1');

    expect(await store.reserve(grant.grantId, 'reviewer', REVIEWER_FILE))
      .toEqual({ ok: false, reason: 'total-limit' });
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

describe('GrantStore — revocation', () => {
  it('persists the revoked status and is idempotent', async () => {
    const fake = createPersistence();
    const store = createStore(fake.persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());

    await store.markRevoked(grant.grantId);
    const writesAfterRevoke = fake.writes();

    // Write-first: the revoked status is durable before anything is torn down.
    expect(storedGrant(fake, grant.grantId).status).toBe('revoked');
    expect(storedGrant(fake, grant.grantId).revokedAt).toBe('2026-08-14T00:00:00.000Z');

    await store.markRevoked(grant.grantId);
    expect(fake.writes()).toBe(writesAfterRevoke);
  });

  it('denies every reservation against a revoked grant', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    await store.markRevoked(grant.grantId);

    expect(await store.reserve(grant.grantId, 'implementer', IMPLEMENTER_FILE))
      .toEqual({ ok: false, reason: 'grant-revoked' });
    expect(await store.reserveLive(grant.grantId, 'handle-1'))
      .toEqual({ ok: false, reason: 'grant-revoked' });
  });

  it('refuses a commit that lost the race with revocation', async () => {
    const store = createStore(createPersistence().persistence);
    const grant = await store.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    const reservationId = await reserved(store, grant.grantId, 'implementer', IMPLEMENTER_FILE);
    await store.markRevoked(grant.grantId);

    // Revocation disposed the handles it could see; this one did not exist yet,
    // so the caller is told to dispose it rather than the store keeping it.
    expect(await store.commitReservation(grant.grantId, reservationId, 'handle-1'))
      .toEqual({ ok: false, reason: 'grant-revoked', disposeRequired: true });
    expect(store.get(grant.grantId)?.createdSessions).toBe(0);
    expect(store.registeredSessionPath(grant.grantId, 'implementer')).toBeNull();
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
    expect(await restarted.reserve(grant.grantId, 'implementer', IMPLEMENTER_FILE))
      .toEqual({ ok: false, reason: 'grant-revoked' });
  });
});

describe('GrantStore — restart reconciliation', () => {
  it('reloads a grant with a zeroed live count', async () => {
    const fake = createPersistence();
    const first = createStore(fake.persistence);
    const grant = await first.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 4 }),
    );
    const reservationId = await reserved(first, grant.grantId, 'implementer', IMPLEMENTER_FILE);
    await first.commitReservation(grant.grantId, reservationId, 'handle-1');
    expect(first.liveHandles(grant.grantId)).toEqual(['handle-1']);

    const restarted = createStore(fake.persistence, createFiles([IMPLEMENTER_FILE]));
    await restarted.initialize();

    // Nothing is live after a restart, so the cap is free again while the
    // lifetime count — which persists — is unchanged.
    expect(restarted.liveHandles(grant.grantId)).toEqual([]);
    expect(restarted.get(grant.grantId)?.createdSessions).toBe(1);
    expect(restarted.registeredSessionPath(grant.grantId, 'implementer')).toBe(IMPLEMENTER_FILE);
    expect((await restarted.reserveLive(grant.grantId, 'handle-2')).ok).toBe(true);
  });

  it('rolls back a pending reservation whose session file is absent', async () => {
    const fake = createPersistence();
    const first = createStore(fake.persistence);
    const grant = await first.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    await reserved(first, grant.grantId, 'implementer', IMPLEMENTER_FILE);

    // Crash before construction: releasing the binding and the count is what
    // stops a nonexistent session being openable and the cap shrinking forever.
    const files = createFiles();
    const restarted = createStore(fake.persistence, files);
    await restarted.initialize();

    expect(restarted.get(grant.grantId)?.pending).toEqual({});
    expect(restarted.get(grant.grantId)?.createdSessions).toBe(0);
    expect(restarted.registeredSessionPath(grant.grantId, 'implementer')).toBeNull();
    expect(storedGrant(fake, grant.grantId).sessionPaths).toEqual({});
    expect(files.removed).toEqual([]);
  });

  it('rolls back a pending reservation whose session file exists, and deletes the partial file', async () => {
    // DIVERGENCE from architecture.md §3.5.1, which says a present file commits.
    // The implementation rolls back either way, because a surviving `pending`
    // record means the commit never ran, and construction can create the file
    // and then fail — so the file is not proof that the session is usable.
    const fake = createPersistence();
    const first = createStore(fake.persistence);
    const grant = await first.issue('orchestrator', SESSION_DIR, 'approval-1', proposal());
    await reserved(first, grant.grantId, 'implementer', IMPLEMENTER_FILE);

    const files = createFiles([IMPLEMENTER_FILE]);
    const restarted = createStore(fake.persistence, files);
    await restarted.initialize();

    expect(restarted.get(grant.grantId)?.pending).toEqual({});
    expect(restarted.get(grant.grantId)?.createdSessions).toBe(0);
    expect(restarted.registeredSessionPath(grant.grantId, 'implementer')).toBeNull();
    expect(files.removed).toEqual([IMPLEMENTER_FILE]);
    expect(storedGrant(fake, grant.grantId).sessionPaths).toEqual({});
  });

  it('frees the caps it rolled back, so a reserve after restart succeeds', async () => {
    const fake = createPersistence();
    const first = createStore(fake.persistence);
    const grant = await first.issue(
      'orchestrator',
      SESSION_DIR,
      'approval-1',
      proposal({ maxLiveSessions: 1, maxTotalSessions: 1 }),
    );
    await reserved(first, grant.grantId, 'implementer', IMPLEMENTER_FILE);

    const restarted = createStore(fake.persistence);
    await restarted.initialize();

    expect((await restarted.reserve(grant.grantId, 'implementer', IMPLEMENTER_FILE)).ok).toBe(true);
  });
});
