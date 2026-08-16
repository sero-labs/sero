/**
 * Fakes and builders for the grant store tests.
 *
 * Persistence clones on read and write, so the store never keeps a live
 * reference into "disk" — that is what makes the restart cases real restarts
 * rather than the same object under a new name. The session directory is a fake
 * listing for the same reason: reconciliation must be provable without timing a
 * real crash.
 */

import type {
  PersistentSessionGrantProposal,
  PersistentSessionSubjectPolicy,
} from '@sero-ai/common';
import {
  GrantStore,
  type GrantStatePersistence,
  type StoredGrant,
} from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';

export const SESSION_DIR = '/sessions/rooms/room-1';
export const IMPLEMENTER_FILE = `${SESSION_DIR}/session-implementer.jsonl`;
export const REVIEWER_FILE = `${SESSION_DIR}/session-reviewer.jsonl`;
export const ORPHAN_FILE = `${SESSION_DIR}/session-orphan.jsonl`;
export const NOW = '2026-08-14T00:00:00.000Z';

export interface FakePersistence {
  persistence: GrantStatePersistence;
  /** What survives a restart. */
  stored(): Record<string, StoredGrant> | null;
  writes(): number;
}

export function createPersistence(): FakePersistence {
  let snapshot: Record<string, StoredGrant> | null = null;
  let writes = 0;
  // A JSON round-trip on purpose: the real store writes these grants to a JSON
  // file, so this drops exactly what a restart drops. `structuredClone` would
  // keep `undefined` and `Date`s that never survive the real file, and the fake
  // would stop matching the thing it stands in for.
  // react-doctor-disable-next-line react-doctor/no-json-parse-stringify-clone
  const clone = (grants: Record<string, StoredGrant>): Record<string, StoredGrant> =>
    JSON.parse(JSON.stringify(grants)) as Record<string, StoredGrant>;

  return {
    persistence: {
      read: async () => (snapshot === null ? null : clone(snapshot)),
      // Yields before writing, so concurrent callers really do interleave.
      write: async (grants) => {
        await Promise.resolve();
        snapshot = clone(grants);
        writes += 1;
      },
    },
    stored: () => snapshot,
    writes: () => writes,
  };
}

export interface FakeFiles {
  exists(sessionPath: string): boolean;
  list(sessionDir: string): string[];
  remove(sessionPath: string): void;
  removed: string[];
}

/** A fake session directory. Entries are absolute paths under SESSION_DIR. */
export function createFiles(present: string[] = []): FakeFiles {
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

export function createStore(
  persistence: GrantStatePersistence,
  files: FakeFiles = createFiles(),
): GrantStore {
  let counter = 0;
  return new GrantStore({
    persistence,
    now: () => NOW,
    newId: (prefix) => `${prefix}-${(counter += 1)}`,
    sessionFileExists: files.exists,
    listSessionFiles: files.list,
    removeSessionFile: files.remove,
  });
}

export function policy(): PersistentSessionSubjectPolicy {
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

export function proposal(
  overrides: Partial<PersistentSessionGrantProposal> = {},
): PersistentSessionGrantProposal {
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

export function storedGrant(fake: FakePersistence, grantId: string): StoredGrant {
  const grant = fake.stored()?.[grantId];
  if (!grant) throw new Error(`grant ${grantId} was never persisted`);
  return grant;
}

/** Reserves and unwraps, so a test that is not about denial stays one line. */
export async function reserved(store: GrantStore, grantId: string, subject: string): Promise<string> {
  const result = await store.reserve(grantId, subject);
  if (!result.ok) throw new Error(`expected a reservation, got ${result.reason}`);
  return result.reservationId;
}

/** Issues a grant and creates one committed session for `subject`. */
export async function issueWithSession(
  store: GrantStore,
  subject: string,
  sessionPath: string,
  handleId: string,
  overrides: Partial<PersistentSessionGrantProposal> = {},
): Promise<StoredGrant> {
  const grant = await store.issue('orchestrator', () => SESSION_DIR, 'approval-1', proposal(overrides));
  const reservationId = await reserved(store, grant.grantId, subject);
  await store.commitReservation(grant.grantId, reservationId, handleId, sessionPath);
  return grant;
}
